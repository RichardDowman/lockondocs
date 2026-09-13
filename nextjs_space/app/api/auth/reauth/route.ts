export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Confirms the signed-in user's password without going through the full login
// flow. Used to unlock the auto-lock overlay and to reveal masked sensitive
// fields. Deliberately does NOT touch failedLoginAttempts / lockedUntil - a
// mistyped password here must never lock the user out of the login screen,
// because they are already authenticated. It only proves the person at the
// device is the account holder.
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
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      await prisma.auditLog
        .create({
          data: {
            userId: user.id,
            action: "auth.reauth_failed",
            detail: "Failed re-authentication (unlock or reveal)",
          },
        })
        .catch(() => {});
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    await prisma.auditLog
      .create({
        data: {
          userId: user.id,
          action: "auth.reauth",
          detail: "Re-authentication confirmed",
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Re-auth error:", err?.message ?? err);
    return NextResponse.json({ error: "Could not verify your password." }, { status: 500 });
  }
}
