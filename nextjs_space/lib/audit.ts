import { prisma } from "./db";
import { NextRequest } from "next/server";

/**
 * Records a key user/security action to the AuditLog table.
 * Best-effort: never throws, so it cannot break the primary request flow.
 */
export async function recordAudit(params: {
  userId?: string | null;
  action: string;
  detail?: string | null;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        detail: params.detail ?? null,
        ip: params.ip ?? null,
      },
    });
  } catch (e) {
    // Auditing must never interrupt the primary action.
  }
}

/** Extracts a best-effort client IP from request headers. */
export function getClientIp(req: NextRequest): string | null {
  try {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
  } catch (e) {
    // ignore
  }
  return null;
}
