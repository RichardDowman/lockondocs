// Shared validation rules for LockonDocs.

/** Password policy: min 8 chars, with at least one letter and one number. */
export function validatePassword(password: string): { ok: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, error: "Password must include a letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, error: "Password must include a number." };
  }
  return { ok: true };
}

export const PASSWORD_POLICY_HINT =
  "At least 8 characters, including a letter and a number.";

/** Allowed document upload types (browser scans + file imports). */
export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

/** Maximum size for a single uploaded document (25 MB). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function isAllowedUploadType(contentType: string): boolean {
  return ALLOWED_UPLOAD_TYPES.includes((contentType ?? "").toLowerCase());
}

/** Login lockout policy. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
