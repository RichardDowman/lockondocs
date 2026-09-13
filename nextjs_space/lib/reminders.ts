// Expiry reminder helpers (Phase B).
//
// A document's expiry date is derived from its vault's designated expiry field
// (see getExpiryFieldKey) and stored, denormalized, on Document.expiryDate so
// reminder queries stay cheap and an optional scheduled email job can read it
// directly. All date maths here works in whole calendar days (UTC-normalised)
// so a document is never "expired" a few hours early because of a timezone.

import type { FieldDef } from "@/lib/vault-fields";
import { getExpiryFieldKey } from "@/lib/vault-fields";

export type ExpiryStatus = "expired" | "soon" | "ok";

export const DEFAULT_REMINDER_LEAD_DAYS = 30;

// Fixed lead window (in days) for the single branded "expiring soon" reminder
// email. This is deliberately independent of the user's in-app
// reminderLeadDays so every user gets exactly one soon email at 30 days,
// regardless of how they have tuned the in-app warning window.
export const EMAIL_REMINDER_SOON_DAYS = 30;

// Allowed lead-time choices offered in the UI.
export const REMINDER_LEAD_CHOICES = [7, 14, 30, 60, 90] as const;

// Parses a metadata date value (typically an ISO "yyyy-mm-dd" string from a
// date input) into a Date at UTC midnight. Returns null for empty / invalid.
export function parseDateValue(value: unknown): Date | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // Prefer the plain yyyy-mm-dd shape so we do not drift across timezones.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
  );
}

// Computes the canonical expiry Date for a document from its metadata and the
// vault's field definitions. Returns null when the vault has no expiry field
// or the value is empty / unparseable.
export function computeExpiryDate(
  metadata: Record<string, string> | null | undefined,
  fields: FieldDef[],
): Date | null {
  if (!metadata) return null;
  const key = getExpiryFieldKey(fields);
  if (!key) return null;
  return parseDateValue(metadata[key]);
}

// Today at UTC midnight, for stable whole-day comparisons.
export function todayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

// Whole days from today until the given date (negative when already past).
export function daysUntil(date: Date, now: Date = new Date()): number {
  const ms = date.getTime() - todayUtc(now).getTime();
  return Math.round(ms / 86_400_000);
}

// Classifies an expiry date relative to the lead window.
export function statusFor(
  expiryDate: Date | null | undefined,
  leadDays: number,
  now: Date = new Date(),
): ExpiryStatus {
  if (!expiryDate) return "ok";
  const days = daysUntil(expiryDate, now);
  if (days < 0) return "expired";
  if (days <= leadDays) return "soon";
  return "ok";
}

// A short human label for a status + days-remaining pair, GB English, no em
// dashes. Used by both the reminders list and the document badge.
export function reminderLabel(status: ExpiryStatus, days: number): string {
  if (status === "expired") {
    const overdue = Math.abs(days);
    if (overdue === 0) return "Expires today";
    return overdue === 1 ? "Expired 1 day ago" : `Expired ${overdue} days ago`;
  }
  if (status === "soon") {
    if (days === 0) return "Expires today";
    return days === 1 ? "Expires in 1 day" : `Expires in ${days} days`;
  }
  return "";
}

// Normalises an arbitrary lead-days value to a sane integer (1..730).
export function normalizeLeadDays(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_REMINDER_LEAD_DAYS;
  return Math.min(730, Math.max(1, n));
}
