export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3";
import { recordAudit, getClientIp } from "@/lib/audit";

// Permanently deletes the account and ALL of the user's documents.
// Requires the current password for confirmation.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const password = (body?.password ?? "").toString();
    if (!password) {
      return NextResponse.json(
        { error: "Please enter your password to confirm." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, password: true },
    });
    if (!user || !user.password) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 400 });
    }

    // Delete every stored file from cloud storage (best-effort per file).
    const documents = await prisma.document.findMany({
      where: { userId },
      select: { cloudStoragePath: true },
    });
    let deletedFiles = 0;
    for (const doc of documents) {
      try {
        await deleteFile(doc.cloudStoragePath);
        deletedFiles += 1;
      } catch (e) {
        console.error("Failed to delete file during account deletion:", doc.cloudStoragePath);
      }
    }

    // Audit BEFORE deletion (userId is set to null on cascade via SetNull).
    await recordAudit({
      userId,
      action: "user.account_deleted",
      detail: `Account ${user.email} deleted; ${deletedFiles}/${documents.length} files removed`,
      ip: getClientIp(req),
    });

    // Cascade deletes folders, documents, tokens; audit logs keep with null userId.
    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Account deletion error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to delete your account." }, { status: 500 });
  }
}
