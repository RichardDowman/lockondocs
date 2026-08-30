export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createToken } from "@/lib/tokens";
import { sendAppEmail, emailShell, emailButton, baseUrl } from "@/lib/email";
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
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    const link = `${baseUrl()}/reset-password?token=${raw}`;
    await sendAppEmail({
      notificationId: process.env.NOTIF_ID_PASSWORD_RESET,
      recipientEmail: email,
      subject: "Reset your LockonDocs password",
      html: emailShell(
        "Reset your password",
        `<p style="margin:0;">We received a request to reset the password for your LockonDocs account.</p>
         ${emailButton(link, "Reset password")}
         <p style="margin:24px 0 0; color:#9aa0ad; font-size:13px;">This link expires in 24 hours. If you did not request this, no action is needed and your password will stay the same.</p>`,
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
