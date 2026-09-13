export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import {
  sendAppEmail,
  baseUrl,
  reminderSoonEmailHtml,
  reminderExpiredEmailHtml,
} from "@/lib/email";
import {
  EMAIL_REMINDER_SOON_DAYS,
  daysUntil,
  todayUtc,
} from "@/lib/reminders";

// POST /api/reminders/dispatch
//
// Sends the branded expiry reminder emails. Designed to be called once a day by
// a scheduled task. Protected by CRON_SECRET (sent as an Authorization: Bearer
// header or an x-cron-secret header). Per document it sends at most one
// "expiring soon" email (at 30 days) and one "expired" email, tracked by the
// reminderSoonSentAt / reminderExpiredSentAt flags so nothing is sent twice.
//
// A user who has turned off email reminders (emailRemindersEnabled = false) is
// skipped entirely, as are documents whose reminder has been dismissed.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  if (bearer !== secret && headerSecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const today = todayUtc(now);
    // Inclusive 30-day window: a document that is exactly EMAIL_REMINDER_SOON_DAYS
    // out must be picked up, to match the in-app bell (statusFor uses days <=
    // leadDays). We compare with lt against the START of the day after the
    // window (today + 30 + 1 days) so a document expiring exactly 30 days from
    // today is included, not excluded by a strict less-than on the boundary.
    const soonCutoff = new Date(
      today.getTime() + (EMAIL_REMINDER_SOON_DAYS + 1) * 86_400_000,
    );
    const base = baseUrl() || "https://vault.lockondocs.app";

    const dateFmt = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

    // Candidate documents: has an expiry date, reminder not dismissed, owner
    // has email reminders enabled and is active (not suspended/deleted). We
    // fetch anything up to the soon window OR already expired that still needs
    // an email, and decide per document below.
    const docs = await prisma.document.findMany({
      where: {
        expiryDate: { not: null, lt: soonCutoff },
        reminderDismissedAt: null,
        user: {
          emailRemindersEnabled: true,
          suspendedAt: null,
          deletedAt: null,
        },
        OR: [
          { reminderSoonSentAt: null },
          { reminderExpiredSentAt: null },
        ],
      },
      select: {
        id: true,
        name: true,
        expiryDate: true,
        reminderSoonSentAt: true,
        reminderExpiredSentAt: true,
        userId: true,
        folder: { select: { name: true } },
        user: { select: { email: true, name: true } },
      },
    });

    let soonSent = 0;
    let expiredSent = 0;
    let failed = 0;

    for (const d of docs) {
      if (!d.expiryDate || !d.user?.email) continue;
      const days = daysUntil(d.expiryDate, now);
      const isExpired = days < 0;
      const expiryLabel = dateFmt.format(d.expiryDate);
      const ctaUrl = `${base}/document/${d.id}`;

      if (isExpired) {
        if (d.reminderExpiredSentAt) continue;
        const html = reminderExpiredEmailHtml({
          recipientName: d.user.name,
          documentName: d.name,
          folderName: d.folder?.name ?? "",
          expiryLabel,
          daysRemaining: days,
          ctaUrl,
        });
        const ok = await sendAppEmail({
          recipientEmail: d.user.email,
          subject: `Expired: ${d.name}`,
          html,
          logType: "reminder_expired",
          userId: d.userId,
          documentId: d.id,
        });
        if (ok) {
          await prisma.document.update({
            where: { id: d.id },
            data: { reminderExpiredSentAt: new Date() },
          });
          expiredSent += 1;
        } else {
          failed += 1;
        }
      } else {
        // Expiring soon (0..30 days ahead).
        if (d.reminderSoonSentAt) continue;
        const html = reminderSoonEmailHtml({
          recipientName: d.user.name,
          documentName: d.name,
          folderName: d.folder?.name ?? "",
          expiryLabel,
          daysRemaining: days,
          ctaUrl,
        });
        const ok = await sendAppEmail({
          recipientEmail: d.user.email,
          subject: `Expiring soon: ${d.name}`,
          html,
          logType: "reminder_soon",
          userId: d.userId,
          documentId: d.id,
        });
        if (ok) {
          await prisma.document.update({
            where: { id: d.id },
            data: { reminderSoonSentAt: new Date() },
          });
          soonSent += 1;
        } else {
          failed += 1;
        }
      }
    }

    await recordAudit({
      userId: null,
      action: "reminder.emails_dispatched",
      detail: `Expiry reminder run: ${soonSent} soon, ${expiredSent} expired, ${failed} failed, ${docs.length} candidates`,
      ip: null,
    });

    return NextResponse.json({
      success: true,
      candidates: docs.length,
      soonSent,
      expiredSent,
      failed,
    });
  } catch (err: any) {
    console.error("Reminder dispatch error:", err?.message ?? err);
    return NextResponse.json(
      { error: "Failed to dispatch reminder emails." },
      { status: 500 },
    );
  }
}
