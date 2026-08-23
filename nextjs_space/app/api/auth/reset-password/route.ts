export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { validatePassword } from "@/lib/validation";
import { recordAudit, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawToken = (body?.token ?? "").toString().trim();
    const password = (body?.password ?? "").toString();

    if (!rawToken) {
      return NextResponse.json({ error: "Invalid or missing token." }, { status: 400 });
    }
    const pw = validatePassword(password);
    if (!pw.ok) {
      return NextResponse.json({ error: pw.error }, { status: 400 });
    }

    const hash = hashToken(rawToken);
    const record = await prisma.passwordResetToken.findUnique({
      where: { token: hash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired." },
        { status: 400 },
      );
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: record.userId },
      data: {
        password: hashed,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    await recordAudit({
      userId: record.userId,
      action: "auth.password_reset",
      detail: "Password successfully reset",
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Reset-password error:", err?.message ?? err);
    return NextResponse.json({ error: "Could not reset password." }, { status: 500 });
  }
}
