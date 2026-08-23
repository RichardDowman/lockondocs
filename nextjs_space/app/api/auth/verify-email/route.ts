export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { recordAudit, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawToken = (body?.token ?? "").toString().trim();
    if (!rawToken) {
      return NextResponse.json({ error: "Invalid or missing token." }, { status: 400 });
    }

    const hash = hashToken(rawToken);
    const record = await prisma.emailVerificationToken.findUnique({
      where: { token: hash },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "This verification link is invalid or has expired." },
        { status: 400 },
      );
    }

    await prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: new Date() },
    });
    await prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    await recordAudit({
      userId: record.userId,
      action: "auth.email_verified",
      detail: "Email address verified",
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Verify-email error:", err?.message ?? err);
    return NextResponse.json({ error: "Could not verify email." }, { status: 500 });
  }
}
