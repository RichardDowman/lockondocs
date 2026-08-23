// Shared formatting helpers for the admin console. Kept hydration-safe by
// always using a fixed locale (en-GB) and UTC timezone so server and client
// render identical strings.

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", { timeZone: "UTC" });
  } catch {
    return "";
  }
}

export function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC" });
  } catch {
    return "";
  }
}

// Human-friendly action label for audit log entries.
export function formatAction(action: string): string {
  const map: Record<string, string> = {
    "auth.login": "Login",
    "auth.failed_login": "Failed login",
    "auth.locked": "Account locked",
    "auth.password_reset_requested": "Password reset requested",
    "user.signup": "Signup",
    "admin.user_update": "Admin: user update",
    "admin.password_reset_sent": "Admin: reset link sent",
    "data.export": "Data export",
    "account.delete": "Account deleted",
    "folder.update": "Vault updated",
    "folder.delete": "Vault deleted",
    "document.move": "Document moved",
    "document.rename": "Document renamed",
    "document.create": "Document added",
    "document.delete": "Document deleted",
  };
  if (map[action]) return map[action];
  // Fallback: turn "some.action_name" into "Some action name".
  return action
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
