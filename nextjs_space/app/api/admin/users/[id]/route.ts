export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminUser } from "@/lib/admin";
import { recordAudit, getClientIp } from "@/lib/audit";
import { createToken } from "@/lib/tokens";
import { sendAppEmail, emailShell, emailButton, baseUrl } from "@/lib/email";

// Per-user detail summary for the admin Users drawer.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const admin = await getAdminUser();
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const u = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        isSuperAdmin: true,
        emailVerified: true,
        storageUsed: true,
        storageLimit: true,
        lockedUntil: true,
        suspendedAt: true,
        deletedAt: true,
        failedLoginAttempts: true,
        createdAt: true,
        _count: { select: { folders: true, documents: true } },
      },
    });
    if (!u) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const recentActivity = await prisma.auditLog.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, action: true, detail: true, createdAt: true },
    });

    const now = new Date();
    return NextResponse.json({
      user: {
        id: u.id,
        name: u.name ?? "",
        email: u.email,
        isAdmin: !!u.isAdmin || !!u.isSuperAdmin,
        isSuperAdmin: !!u.isSuperAdmin,
        emailVerified: !!u.emailVerified,
        storageUsed: Number(u.storageUsed ?? BigInt(0)),
        storageLimit: Number(u.storageLimit ?? BigInt(0)),
        locked: !!(u.lockedUntil && u.lockedUntil > now),
        suspended: !!u.suspendedAt,
        deleted: !!u.deletedAt,
        failedLoginAttempts: u.failedLoginAttempts ?? 0,
        documentCount: u._count.documents,
        folderCount: u._count.folders,
        createdAt: u.createdAt,
      },
      recentActivity: recentActivity.map((l) => ({
        id: l.id,
        action: l.action,
        detail: l.detail ?? "",
        createdAt: l.createdAt,
      })),
    });
  } catch (err: any) {
    console.error("Admin user GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load user." }, { status: 500 });
  }
}

// Adjust storage, unlock, suspend/unsuspend, change role, or send a reset link.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const targetId = params.id;
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const data: Record<string, any> = {};
    const actions: string[] = [];

    if (body?.storageLimitMb !== undefined) {
      const mb = Number(body.storageLimitMb);
      if (!Number.isFinite(mb) || mb < 0 || mb > 1024 * 1024) {
        return NextResponse.json(
          { error: "Storage limit must be between 0 and 1,048,576 MB." },
          { status: 400 },
        );
      }
      data.storageLimit = BigInt(Math.round(mb * 1024 * 1024));
      actions.push("storage limit");
    }

    if (body?.unlock === true) {
      data.lockedUntil = null;
      data.failedLoginAttempts = 0;
      actions.push("unlock");
    }

    if (body?.suspend === true) {
      if (target.isSuperAdmin) {
        return NextResponse.json(
          { error: "Super admins cannot be suspended." },
          { status: 400 },
        );
      }
      if (target.id === admin.id) {
        return NextResponse.json(
          { error: "You cannot suspend your own account." },
          { status: 400 },
        );
      }
      data.suspendedAt = new Date();
      actions.push("suspend");
    }
    if (body?.suspend === false) {
      data.suspendedAt = null;
      actions.push("unsuspend");
    }

    // Role changes are restricted to super admins.
    if (body?.role !== undefined) {
      if (!admin.isSuperAdmin) {
        return NextResponse.json(
          { error: "Only a super admin can change roles." },
          { status: 403 },
        );
      }
      const role = String(body.role);
      if (!["user", "admin", "superadmin"].includes(role)) {
        return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      }
      // Prevent removing the last super admin (e.g. demoting yourself).
      if (target.isSuperAdmin && role !== "superadmin") {
        const superCount = await prisma.user.count({
          where: { isSuperAdmin: true, deletedAt: null },
        });
        if (superCount <= 1) {
          return NextResponse.json(
            { error: "Cannot remove the last super admin." },
            { status: 400 },
          );
        }
      }
      if (role === "user") {
        data.isAdmin = false;
        data.isSuperAdmin = false;
      } else if (role === "admin") {
        data.isAdmin = true;
        data.isSuperAdmin = false;
      } else {
        data.isAdmin = true;
        data.isSuperAdmin = true;
      }
      actions.push(`role -> ${role}`);
    }

    // Send a password reset link (does not change the password directly).
    if (body?.sendReset === true) {
      await prisma.passwordResetToken
        .updateMany({
          where: { userId: target.id, usedAt: null },
          data: { usedAt: new Date() },
        })
        .catch(() => {});
      const { raw, hash } = createToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: target.id,
          token: hash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const link = `${baseUrl()}/reset-password?token=${raw}`;
      await sendAppEmail({
        notificationId: process.env.NOTIF_ID_PASSWORD_RESET,
        recipientEmail: target.email,
        subject: "Reset your LockonDocs password",
        html: emailShell(
          "Reset your password",
          `<p style="margin:0;">An administrator has initiated a password reset for your LockonDocs account.</p>
           ${emailButton(link, "Reset password")}
           <p style="margin:24px 0 0; color:#9aa0ad; font-size:13px;">This link expires in 24 hours.</p>`,
        ),
      }).catch(() => {});
      await recordAudit({
        userId: admin.id,
        action: "admin.password_reset_sent",
        detail: `Sent password reset link to ${target.email}`,
        ip: getClientIp(req),
      });
      if (Object.keys(data).length === 0) {
        return NextResponse.json({ success: true, resetSent: true });
      }
    }

    if (Object.keys(data).length === 0 && actions.length === 0) {
      return NextResponse.json({ error: "No changes provided." }, { status: 400 });
    }

    if (Object.keys(data).length > 0) {
      await prisma.user.update({ where: { id: targetId }, data });
    }

    await recordAudit({
      userId: admin.id,
      action: "admin.user_update",
      detail: `Updated user ${target.email}: ${actions.join(", ")}`,
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Admin user PATCH error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to update user." }, { status: 500 });
  }
}
