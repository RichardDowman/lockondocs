// Email helpers for LockonDocs (password reset, email verification).
// Sends via Resend from the client's verified domain. The sender address is
// controlled by EMAIL_FROM so the domain can be changed without a code edit.
// Best-effort: callers handle failures.

import { Resend } from "resend";
import { prisma } from "@/lib/db";

interface SendArgs {
  // Retained for backwards compatibility with existing callers; unused by Resend.
  notificationId?: string | undefined;
  recipientEmail: string;
  subject: string;
  html: string;
  // Optional metadata used only to record the send in the EmailLog table so the
  // admin Emails screen can show what was sent. None of these affect delivery.
  logType?: string;
  userId?: string | null;
  documentId?: string | null;
  preview?: string | null;
}

// Strips HTML tags and collapses whitespace to build a short plain-text preview
// for the admin Emails log. Never throws.
function toPreview(html: string, max = 140): string {
  try {
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&middot;/g, "·")
      .replace(/&copy;/g, "©")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
  } catch {
    return "";
  }
}

// Best-effort write to the EmailLog table. Never throws so it cannot break a
// send. status is "sent" when the provider accepted the message, else "failed".
async function recordEmailLog(args: {
  recipientEmail: string;
  subject: string;
  status: string;
  logType?: string;
  userId?: string | null;
  documentId?: string | null;
  preview?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        recipientEmail: args.recipientEmail,
        subject: args.subject,
        status: args.status,
        type: args.logType ?? "general",
        userId: args.userId ?? null,
        documentId: args.documentId ?? null,
        preview: args.preview ?? null,
        error: args.error ?? null,
      },
    });
  } catch {
    // Logging must never interrupt the primary send flow.
  }
}

// e.g. "LockonDocs <noreply@lockondocs.app>". Must be on a domain verified in Resend.
const FROM_ADDRESS =
  process.env.EMAIL_FROM || "LockonDocs <noreply@lockondocs.app>";

export async function sendAppEmail({
  recipientEmail,
  subject,
  html,
  logType,
  userId,
  documentId,
  preview,
}: SendArgs): Promise<boolean> {
  const previewText = preview ?? toPreview(html);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("sendAppEmail: RESEND_API_KEY is not configured.");
    await recordEmailLog({
      recipientEmail,
      subject,
      status: "failed",
      logType,
      userId,
      documentId,
      preview: previewText,
      error: "RESEND_API_KEY is not configured",
    });
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: recipientEmail,
      subject,
      html,
    });
    if (error) {
      console.error("sendAppEmail failed:", error?.message ?? error);
      await recordEmailLog({
        recipientEmail,
        subject,
        status: "failed",
        logType,
        userId,
        documentId,
        preview: previewText,
        error: (error as any)?.message ?? String(error),
      });
      return false;
    }
    await recordEmailLog({
      recipientEmail,
      subject,
      status: "sent",
      logType,
      userId,
      documentId,
      preview: previewText,
    });
    return true;
  } catch (err: any) {
    console.error("sendAppEmail error:", err?.message ?? err);
    await recordEmailLog({
      recipientEmail,
      subject,
      status: "failed",
      logType,
      userId,
      documentId,
      preview: previewText,
      error: err?.message ?? String(err),
    });
    return false;
  }
}

export function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
}

// Absolute, app-hosted logo URL so the email source stays fully branded
// (no third-party asset host). Resolves to the live domain at runtime.
function logoUrl(): string {
  const base = baseUrl() || "https://vault.lockondocs.app";
  return `${base}/brand/lockondocs-email-logo.png`;
}

// Brand palette
const NAVY = "#1f2430";
const GOLD = "#c8a44d";
const GOLD_DARK = "#9a7a2e";
const INK = "#3f4657";
const MUTED = "#9aa0ad";
const PAGE_BG = "#eef1f5";

// A bulletproof, brand-gold call-to-action button plus a plain-text fallback
// link (for clients that strip styled buttons). Use inside emailShell bodies.
export function emailButton(href: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 8px;">
    <tr>
      <td align="center" bgcolor="${GOLD}" style="border-radius:8px;">
        <a href="${href}" target="_blank" style="display:inline-block; padding:14px 36px; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; color:${NAVY}; text-decoration:none; border-radius:8px;">${label}</a>
      </td>
    </tr>
  </table>
  <p style="margin:0 0 4px; text-align:center; color:${MUTED}; font-size:12px; line-height:1.5;">Or copy and paste this link into your browser:</p>
  <p style="margin:0; text-align:center; word-break:break-all;"><a href="${href}" target="_blank" style="color:${GOLD_DARK}; font-size:12px;">${href}</a></p>`;
}

export function emailShell(title: string, bodyInner: string): string {
  return `
  <div style="margin:0; padding:0; background-color:${PAGE_BG};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE_BG}; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:14px; overflow:hidden; box-shadow:0 1px 4px rgba(31,36,48,0.10); font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td align="center" style="background-color:${NAVY}; padding:30px 24px 26px;">
                <img src="${logoUrl()}" width="66" height="66" alt="LockonDocs" style="display:block; width:66px; height:66px; margin:0 auto 12px;" />
                <div style="color:#ffffff; font-size:22px; font-weight:bold; letter-spacing:0.5px;">LockonDocs</div>
                <div style="color:${GOLD}; font-size:11px; letter-spacing:2.5px; text-transform:uppercase; margin-top:6px;">Secure Document Vault</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px 12px;">
                <h1 style="margin:0 0 16px; color:${NAVY}; font-size:20px; font-weight:bold;">${title}</h1>
                <div style="color:${INK}; font-size:15px; line-height:1.6;">
                  ${bodyInner}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 40px 30px;">
                <div style="border-top:1px solid ${PAGE_BG}; padding-top:18px;">
                  <p style="margin:0; color:${MUTED}; font-size:12px; line-height:1.55;">You are receiving this email because this action was requested for your LockonDocs account. If you did not request it, you can safely ignore this message.</p>
                  <p style="margin:12px 0 0; color:#c1c5cf; font-size:11px;">&copy; LockonDocs &middot; Secure Document Vault</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

// ---------------------------------------------------------------------------
// Expiry reminder email templates (Phase B email layer).
// Each document triggers at most one "expiring soon" email (at 30 days) and one
// "expired" email, both fully branded via emailShell. GB English, no em dashes.
// ---------------------------------------------------------------------------

function greetingName(name?: string | null): string {
  const n = (name ?? "").trim();
  return n ? n.split(/\s+/)[0] : "there";
}

// Escapes user-supplied text before placing it in the HTML body.
function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ReminderEmailArgs {
  recipientName?: string | null;
  documentName: string;
  folderName?: string | null;
  expiryLabel: string; // human-readable date, e.g. "12 September 2026"
  daysRemaining: number; // whole days until expiry (>= 0 for "soon")
  ctaUrl: string;
}

export function reminderSoonEmailHtml(args: ReminderEmailArgs): string {
  const first = esc(greetingName(args.recipientName));
  const doc = esc(args.documentName || "A document");
  const folder = args.folderName ? esc(args.folderName) : "";
  const days =
    args.daysRemaining <= 0
      ? "today"
      : args.daysRemaining === 1
        ? "in 1 day"
        : `in ${args.daysRemaining} days`;
  const inVault = folder ? ` in your <strong>${folder}</strong> vault` : "";
  const body = `
    <p style="margin:0 0 14px;">Hello ${first},</p>
    <p style="margin:0 0 14px;">This is a friendly reminder that <strong>${doc}</strong>${inVault} is due to expire <strong>${days}</strong>, on <strong>${esc(args.expiryLabel)}</strong>.</p>
    <p style="margin:0 0 6px;">If you have already renewed it, you can update the expiry date in the app so we stop reminding you. Otherwise, now is a good time to arrange a renewal.</p>
    ${emailButton(args.ctaUrl, "Review in LockonDocs")}`;
  return emailShell("A document is expiring soon", body);
}

export function reminderExpiredEmailHtml(args: ReminderEmailArgs): string {
  const first = esc(greetingName(args.recipientName));
  const doc = esc(args.documentName || "A document");
  const folder = args.folderName ? esc(args.folderName) : "";
  const inVault = folder ? ` in your <strong>${folder}</strong> vault` : "";
  const body = `
    <p style="margin:0 0 14px;">Hello ${first},</p>
    <p style="margin:0 0 14px;"><strong>${doc}</strong>${inVault} expired on <strong>${esc(args.expiryLabel)}</strong>.</p>
    <p style="margin:0 0 6px;">If you have renewed it, update the stored copy and its expiry date in the app to keep your vault current. If not, please arrange a renewal at your earliest convenience.</p>
    ${emailButton(args.ctaUrl, "Open LockonDocs")}`;
  return emailShell("A document has expired", body);
}
