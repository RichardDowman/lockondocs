export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { DEFAULT_FOLDERS } from "@/lib/default-folders";
import { getDefaultFieldsFor } from "@/lib/vault-fields";
import { validatePassword } from "@/lib/validation";
import { createToken } from "@/lib/tokens";
import { sendAppEmail, emailShell, emailButton, baseUrl } from "@/lib/email";
import { recordAudit, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body?.email ?? "").toString().trim().toLowerCase();
    const password = (body?.password ?? "").toString();
    const name = (body?.name ?? "").toString().trim();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }
    const pw = validatePassword(password);
    if (!pw.ok) {
      return NextResponse.json({ error: pw.error }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        password: hashed,
        folders: {
          create: DEFAULT_FOLDERS.map((f) => ({
            name: f.name,
            icon: f.icon,
            isDefault: true,
            // Seed each default vault with its tailored document fields.
            fields: getDefaultFieldsFor(f.name) as any,
          })),
        },
      },
    });

    await recordAudit({
      userId: user.id,
      action: "user.signup",
      detail: `New account created for ${email}`,
      ip: getClientIp(req),
    });

    // Send a verification email (soft verification: does not block sign-in).
    try {
      const { raw, hash } = createToken();
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: hash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const link = `${baseUrl()}/verify-email?token=${raw}`;
      await sendAppEmail({
        notificationId: process.env.NOTIF_ID_EMAIL_VERIFICATION,
        recipientEmail: email,
        subject: "Confirm your LockonDocs email",
        html: emailShell(
          "Confirm your email",
          `<p style="margin:0;">Welcome to LockonDocs. Please confirm your email address to activate and secure your account.</p>
           ${emailButton(link, "Confirm email address")}
           <p style="margin:24px 0 0; color:#9aa0ad; font-size:13px;">This link expires in 24 hours.</p>`,
        ),
      });
    } catch (e) {
      // Verification email is best-effort; signup still succeeds.
    }

    return NextResponse.json(
      { success: true, userId: user.id },
      { status: 201 },
    );
  } catch (err: any) {
    console.error("Signup error:", err?.message ?? err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
