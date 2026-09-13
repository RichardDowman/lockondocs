export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperAdminUser } from "@/lib/admin";
import { deleteFile } from "@/lib/s3";
import { recordAudit, getClientIp } from "@/lib/audit";

// Super-admin only: permanently delete one or more user accounts and every
// document (plus its cloud files) that belongs to them. Used to clear out test
// accounts in bulk. Refuses to delete the caller or any other super admin.
export async function POST(req: NextRequest) {
  try {
    const admin = await getSuperAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const rawIds = Array.isArray(body?.userIds) ? body.userIds : [];
    const userIds = Array.from(
      new Set(rawIds.map((v: any) => String(v)).filter(Boolean)),
    ) as string[];

    if (userIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one user to delete." },
        { status: 400 },
      );
    }

    const targets = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, isSuperAdmin: true },
    });

    let deleted = 0;
    let filesRemoved = 0;
    const skipped: { email: string; reason: string }[] = [];

    for (const target of targets) {
      if (target.id === admin.id) {
        skipped.push({ email: target.email, reason: "cannot delete yourself" });
        continue;
      }
      if (target.isSuperAdmin) {
        skipped.push({ email: target.email, reason: "super admin protected" });
        continue;
      }

      // Remove every stored file (original + thumbnail) best-effort.
      const documents = await prisma.document.findMany({
        where: { userId: target.id },
        select: { cloudStoragePath: true, thumbnailPath: true },
      });
      for (const doc of documents) {
        try {
          await deleteFile(doc.cloudStoragePath);
          filesRemoved += 1;
        } catch {
          console.error("Bulk delete: failed to remove file", doc.cloudStoragePath);
        }
        if (doc.thumbnailPath) {
          try {
            await deleteFile(doc.thumbnailPath);
            filesRemoved += 1;
          } catch {
            console.error("Bulk delete: failed to remove thumbnail", doc.thumbnailPath);
          }
        }
      }

      // Audit BEFORE deletion (audit rows keep with null userId via SetNull).
      await recordAudit({
        userId: target.id,
        action: "admin.user_deleted",
        detail: `Super admin ${admin.email} deleted account ${target.email}; ${documents.length} documents removed`,
        ip: getClientIp(req),
      });

      await prisma.user.delete({ where: { id: target.id } });
      deleted += 1;
    }

    return NextResponse.json({
      success: true,
      deleted,
      filesRemoved,
      skipped,
      requested: userIds.length,
    });
  } catch (err: any) {
    console.error("Bulk user delete error:", err?.message ?? err);
    return NextResponse.json(
      { error: "Failed to delete the selected users." },
      { status: 500 },
    );
  }
}
