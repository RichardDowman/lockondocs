export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/admin";
import { resolveRange, createdAtFilter, toCsv } from "@/lib/admin-range";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const status = (searchParams.get("status") ?? "").trim(); // admins|locked|suspended|deleted
    const sort = (searchParams.get("sort") ?? "created_desc").trim();
    const format = (searchParams.get("format") ?? "").trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize") ?? "25") || 25));
    const range = resolveRange(searchParams);
    const createdAt = createdAtFilter(range);
    const now = new Date();

    const where: Prisma.UserWhereInput = {};
    if (status === "deleted") where.deletedAt = { not: null };
    else where.deletedAt = null;
    if (status === "admins") where.OR = [{ isAdmin: true }, { isSuperAdmin: true }];
    if (status === "locked") where.lockedUntil = { gt: now };
    if (status === "suspended") where.suspendedAt = { not: null };
    if (createdAt) where.createdAt = createdAt;
    if (q) {
      const contains = { contains: q, mode: "insensitive" as const };
      where.AND = [{ OR: [{ email: contains }, { name: contains }] }];
    }

    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: "desc" };
    if (sort === "created_asc") orderBy = { createdAt: "asc" };
    else if (sort === "storage_desc") orderBy = { storageUsed: "desc" };
    else if (sort === "storage_asc") orderBy = { storageUsed: "asc" };
    else if (sort === "name_asc") orderBy = { name: "asc" };
    else if (sort === "name_desc") orderBy = { name: "desc" };

    const total = await prisma.user.count({ where });

    const users = await prisma.user.findMany({
      where,
      orderBy,
      ...(format === "csv" ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        isSuperAdmin: true,
        emailVerified: true,
        storageUsed: true,
        storageLimit: true,
        lockedUntil: true,
        suspendedAt: true,
        deletedAt: true,
        createdAt: true,
        _count: { select: { folders: true, documents: true } },
      },
    });

    const mapped = users.map((u) => ({
      id: u.id,
      name: u.name ?? "",
      email: u.email,
      isAdmin: !!u.isAdmin || !!u.isSuperAdmin,
      isSuperAdmin: !!u.isSuperAdmin,
      emailVerified: !!u.emailVerified,
      storageUsed: Number(u.storageUsed ?? BigInt(0)),
      storageLimit: Number(u.storageLimit ?? BigInt(0)),
      locked: !!(u.lockedUntil && u.lockedUntil > now),
      suspended: !!u.suspendedAt,
      deleted: !!u.deletedAt,
      documentCount: u._count.documents,
      folderCount: u._count.folders,
      createdAt: u.createdAt,
    }));

    if (format === "csv") {
      const csv = toCsv(
        ["Name", "Email", "Role", "Verified", "Storage used", "Storage limit", "Documents", "Vaults", "Status", "Created"],
        mapped.map((u) => [
          u.name,
          u.email,
          u.isSuperAdmin ? "Super admin" : u.isAdmin ? "Admin" : "User",
          u.emailVerified ? "Yes" : "No",
          formatBytes(u.storageUsed),
          formatBytes(u.storageLimit),
          u.documentCount,
          u.folderCount,
          u.deleted ? "Deleted" : u.suspended ? "Suspended" : u.locked ? "Locked" : "Active",
          new Date(u.createdAt).toISOString(),
        ]),
      );
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="lockondocs-users-${Date.now()}.csv"`,
        },
      });
    }

    return NextResponse.json({
      users: mapped,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err: any) {
    console.error("Admin users GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }
}
