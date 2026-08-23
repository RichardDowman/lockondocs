export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Returns the current user's own recent activity feed. Strictly scoped to the
// signed-in user: no cross-user data is ever returned.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const logs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        action: true,
        detail: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      activity: logs.map((l) => ({
        id: l.id,
        action: l.action,
        detail: l.detail ?? "",
        createdAt: l.createdAt,
      })),
    });
  } catch (err: any) {
    console.error("User activity GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load activity." }, { status: 500 });
  }
}
