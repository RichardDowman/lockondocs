export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  AUTO_LOCK_CHOICES,
  DEFAULT_AUTO_LOCK_MINUTES,
} from "@/lib/auto-lock";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        storageUsed: true,
        storageLimit: true,
        isAdmin: true,
        emailVerified: true,
        reminderLeadDays: true,
        emailRemindersEnabled: true,
        autoLockMinutes: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const [folderCount, documentCount] = await Promise.all([
      prisma.folder.count({ where: { userId } }),
      prisma.document.count({ where: { userId } }),
    ]);

    return NextResponse.json({
      user: {
        name: user.name ?? "",
        email: user.email,
        storageUsed: Number(user.storageUsed ?? BigInt(0)),
        storageLimit: Number(user.storageLimit ?? BigInt(0)),
        isAdmin: !!user.isAdmin,
        emailVerified: !!user.emailVerified,
        reminderLeadDays: user.reminderLeadDays ?? 30,
        emailRemindersEnabled: user.emailRemindersEnabled ?? true,
        autoLockMinutes: user.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES,
        folderCount,
        documentCount,
      },
    });
  } catch (err: any) {
    console.error("User GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const data: { name?: string; autoLockMinutes?: number } = {};

    // Name is optional now so the same endpoint can update auto-lock alone.
    if (body?.name !== undefined) {
      const name = (body.name ?? "").toString().trim();
      if (!name) {
        return NextResponse.json({ error: "Name is required." }, { status: 400 });
      }
      data.name = name;
    }

    if (body?.autoLockMinutes !== undefined) {
      const minutes = Number(body.autoLockMinutes);
      if (!AUTO_LOCK_CHOICES.includes(minutes)) {
        return NextResponse.json(
          { error: "Invalid auto-lock value." },
          { status: 400 },
        );
      }
      data.autoLockMinutes = minutes;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    await prisma.user.update({ where: { id: userId }, data });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("User PATCH error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
