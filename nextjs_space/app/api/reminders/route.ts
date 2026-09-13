export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, getClientIp } from "@/lib/audit";
import {
  DEFAULT_REMINDER_LEAD_DAYS,
  daysUntil,
  normalizeLeadDays,
  reminderLabel,
  statusFor,
} from "@/lib/reminders";

// GET /api/reminders
// Returns the signed-in user's documents that are expired or expiring within
// their lead window, newest deadline first, with folder context. Dismissed
// reminders are excluded until their expiry date next changes.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { reminderLeadDays: true, emailRemindersEnabled: true },
    });
    const leadDays = user?.reminderLeadDays ?? DEFAULT_REMINDER_LEAD_DAYS;
    const emailRemindersEnabled = user?.emailRemindersEnabled ?? true;

    const docs = await prisma.document.findMany({
      where: { userId, expiryDate: { not: null }, reminderDismissedAt: null },
      orderBy: { expiryDate: "asc" },
      select: {
        id: true,
        name: true,
        folderId: true,
        expiryDate: true,
        folder: { select: { name: true, icon: true } },
      },
    });

    const items = docs
      .map((d) => {
        const status = statusFor(d.expiryDate, leadDays);
        const days = d.expiryDate ? daysUntil(d.expiryDate) : 0;
        return {
          id: d.id,
          name: d.name,
          folderId: d.folderId,
          folderName: d.folder?.name ?? "",
          folderIcon: d.folder?.icon ?? "folder",
          expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
          status,
          daysRemaining: days,
          label: reminderLabel(status, days),
        };
      })
      .filter((d) => d.status !== "ok");

    const counts = {
      expired: items.filter((d) => d.status === "expired").length,
      soon: items.filter((d) => d.status === "soon").length,
    };

    return NextResponse.json({ leadDays, emailRemindersEnabled, items, counts });
  } catch (err: any) {
    console.error("Reminders GET error:", err?.message ?? err);
    return NextResponse.json(
      { error: "Failed to load reminders." },
      { status: 500 },
    );
  }
}

// PATCH /api/reminders
// { leadDays?: number }               -> update the reminder lead window
// { dismissDocumentId?: string }      -> hide a single reminder
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    let did = false;

    if (body?.leadDays !== undefined) {
      const leadDays = normalizeLeadDays(body.leadDays);
      await prisma.user.update({
        where: { id: userId },
        data: { reminderLeadDays: leadDays },
      });
      did = true;
    }

    if (body?.emailRemindersEnabled !== undefined) {
      await prisma.user.update({
        where: { id: userId },
        data: { emailRemindersEnabled: !!body.emailRemindersEnabled },
      });
      did = true;
    }

    if (body?.dismissDocumentId) {
      const id = String(body.dismissDocumentId);
      const doc = await prisma.document.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!doc) {
        return NextResponse.json(
          { error: "Document not found." },
          { status: 404 },
        );
      }
      await prisma.document.update({
        where: { id: doc.id },
        data: { reminderDismissedAt: new Date() },
      });
      await recordAudit({
        userId,
        action: "reminder.dismiss",
        detail: `Reminder dismissed for document ${doc.id}`,
        ip: getClientIp(req),
      });
      did = true;
    }

    if (!did) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Reminders PATCH error:", err?.message ?? err);
    return NextResponse.json(
      { error: "Failed to update reminders." },
      { status: 500 },
    );
  }
}
