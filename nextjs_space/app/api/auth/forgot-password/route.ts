export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createToken } from "@/lib/tokens";
import { sendAppEmail, emailShell, baseUrl } from "@/lib/email";
import { recordAudit, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body?.email ?? "").toString().trim().toLowerCase();

    // Always return success to avoid leaking which emails exist.
    const genericOk = NextResponse.json({
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    });

    if (!email) return genericOk;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return genericOk;

    // Invalidate any prior unused tokens for this user.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }).catch(() => {});

    const { raw, hash } = createToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const link = `${baseUrl()}/reset-password?token=${raw}`;
    await sendAppEmail({
      notificationId: process.env.NOTIF_ID_PASSWORD_RESET,
      recipientEmail: email,
      subject: "Reset your LockonDocs password",
      html: emailShell(
        "Reset your password",
        `<p>We received a request to reset your LockonDocs password.</p>
         <p style="margin:24px 0;"><a href="${link}" style="background:#c8a44d; color:#1f2430; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:bold;">Reset password</a></p>
         <p style="font-size:12px; color:#8a8f9a;">This link expires in 1 hour. If you did not request it, no action is needed.</p>`,
      ),
    });

    await recordAudit({
      userId: user.id,
      action: "auth.password_reset_requested",
      detail: "Password reset link requested",
      ip: getClientIp(req),
    });

    return genericOk;
  } catch (err: any) {
    console.error("Forgot-password error:", err?.message ?? err);
    return NextResponse.json({
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    });
  }
}
