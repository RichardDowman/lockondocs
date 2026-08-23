// Email helpers for LockonDocs (password reset, email verification).
// Uses the Abacus notification email API. Best-effort: callers handle failures.

interface SendArgs {
  notificationId: string | undefined;
  recipientEmail: string;
  subject: string;
  html: string;
}

export async function sendAppEmail({
  notificationId,
  recipientEmail,
  subject,
  html,
}: SendArgs): Promise<boolean> {
  try {
    const appUrl = process.env.NEXTAUTH_URL || "";
    const hostname = appUrl ? new URL(appUrl).hostname : "vault.lockondocs.app";
    const appName = hostname.split(".")[0] || "LockonDocs";

    const res = await fetch("https://apps.abacus.ai/api/sendNotificationEmail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        app_id: process.env.WEB_APP_ID,
        notification_id: notificationId,
        subject,
        body: html,
        is_html: true,
        recipient_email: recipientEmail,
        sender_email: `noreply@${hostname}`,
        sender_alias: "LockonDocs",
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!result?.success) {
      if (result?.notification_disabled) return true;
      console.error("sendAppEmail failed:", result?.message ?? "unknown");
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("sendAppEmail error:", err?.message ?? err);
    return false;
  }
}

export function baseUrl(): string {
  return (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
}

export function emailShell(title: string, bodyInner: string): string {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2430;">
    <div style="text-align:center; padding: 8px 0 16px;">
      <h2 style="margin:0; color:#1f2430;">LockonDocs</h2>
    </div>
    <div style="background:#f7f7f9; padding: 24px; border-radius: 12px;">
      <h3 style="margin-top:0; color:#1f2430;">${title}</h3>
      ${bodyInner}
    </div>
    <p style="color:#8a8f9a; font-size:12px; text-align:center; margin-top:16px;">
      If you did not request this, you can safely ignore this email.
    </p>
  </div>`;
}
