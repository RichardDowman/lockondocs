// Shared by the creation form and API. Existing generated passcodes remain valid.
export const SHARE_PASSWORD_HINT = "Use 12 to 64 characters. Spaces and symbols are welcome; no spaces at the start or end. Do not reuse your account password.";
export function sharePasswordError(value: unknown): string | null {
  if (typeof value !== "string" || Array.from(value).length < 12 || Array.from(value).length > 64) return "Use a sharing password of 12 to 64 characters.";
  if (value !== value.trim() || /\p{Cc}/u.test(value)) return "Remove spaces at the start or end and any line breaks from the sharing password.";
  // bcrypt ignores bytes after 72. Reject rather than silently truncate Unicode passwords.
  if (new TextEncoder().encode(value).length > 72) return "This sharing password is too long in bytes. Use fewer special characters (maximum 72 bytes).";
  return null;
}
