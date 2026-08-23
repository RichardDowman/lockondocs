export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/admin";
import { resolveRange, createdAtFilter } from "@/lib/admin-range";

export async function GET(req: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const range = resolveRange(searchParams);
    const createdAt = createdAtFilter(range);
    const now = new Date();

    const [
      totalUsers,
      adminUsers,
      superAdminUsers,
      lockedUsers,
      suspendedUsers,
      deletedUsers,
      totalDocuments,
      totalFolders,
      storageAgg,
      newUsers,
      newDocuments,
      newFolders,
      failedLogins,
      topStorageRaw,
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, isAdmin: true } }),
      prisma.user.count({ where: { deletedAt: null, isSuperAdmin: true } }),
      prisma.user.count({ where: { deletedAt: null, lockedUntil: { gt: now } } }),
      prisma.user.count({ where: { deletedAt: null, suspendedAt: { not: null } } }),
      prisma.user.count({ where: { deletedAt: { not: null } } }),
      prisma.document.count(),
      prisma.folder.count(),
      prisma.user.aggregate({ _sum: { storageUsed: true }, where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, ...(createdAt ? { createdAt } : {}) } }),
      prisma.document.count({ where: createdAt ? { createdAt } : undefined }),
      prisma.folder.count({ where: createdAt ? { createdAt } : undefined }),
      prisma.auditLog.count({
        where: { action: "auth.failed_login", ...(createdAt ? { createdAt } : {}) },
      }),
      prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { storageUsed: "desc" },
        take: 5,
        select: { id: true, name: true, email: true, storageUsed: true, storageLimit: true },
      }),
    ]);

    return NextResponse.json({
      range: { key: range.key, from: range.from, to: range.to },
      totals: {
        users: totalUsers,
        admins: adminUsers,
        superAdmins: superAdminUsers,
        documents: totalDocuments,
        folders: totalFolders,
        storageUsedBytes: Number(storageAgg._sum.storageUsed ?? BigInt(0)),
        lockedUsers,
        suspendedUsers,
        deletedUsers,
      },
      inRange: {
        newUsers,
        newDocuments,
        newFolders,
        failedLogins,
      },
      topStorage: topStorageRaw.map((u) => ({
        id: u.id,
        name: u.name ?? "",
        email: u.email,
        storageUsed: Number(u.storageUsed ?? BigInt(0)),
        storageLimit: Number(u.storageLimit ?? BigInt(0)),
      })),
    });
  } catch (err: any) {
    console.error("Admin stats GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load stats." }, { status: 500 });
  }
}
