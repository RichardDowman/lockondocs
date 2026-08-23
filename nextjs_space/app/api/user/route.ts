export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    const name = (body?.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }
    await prisma.user.update({ where: { id: userId }, data: { name } });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("User PATCH error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
