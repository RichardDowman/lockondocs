export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/admin";

// Returns the latest status plus recent history for each backup job type so the
// admin Backups screen can show real operational data (weekly GitHub code push
// and daily storage verification).
export async function GET() {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [githubLatest, githubHistory, storageLatest, storageHistory] =
      await Promise.all([
        prisma.backupLog.findFirst({
          where: { type: "github" },
          orderBy: { createdAt: "desc" },
        }),
        prisma.backupLog.findMany({
          where: { type: "github" },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        prisma.backupLog.findFirst({
          where: { type: "storage" },
          orderBy: { createdAt: "desc" },
        }),
        prisma.backupLog.findMany({
          where: { type: "storage" },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
      ]);

    return NextResponse.json({
      github: { latest: githubLatest, history: githubHistory },
      storage: { latest: storageLatest, history: storageHistory },
    });
  } catch (err) {
    console.error("GET /api/admin/backups failed:", err);
    return NextResponse.json(
      { error: "Failed to load backup status" },
      { status: 500 },
    );
  }
}
