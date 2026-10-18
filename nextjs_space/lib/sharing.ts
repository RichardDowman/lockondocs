import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import jwt, { JwtPayload } from "jsonwebtoken";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
export class ShareError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const newShareToken = () => randomBytes(32).toString("base64url");
export function shareJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: PRIVATE_HEADERS });
}
export function shareFailure(error: unknown) {
  if (error instanceof ShareError) return shareJson({ error: error.message }, error.status);
  // Never log bodies, cookies, link tokens, passcodes, or signed storage URLs.
  console.error("Sharing request failed", error instanceof Error ? error.name : "UnknownError");
  return shareJson({ error: "Could not complete this request. Please try again." }, 500);
}
export function requireSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host || req.headers.get("sec-fetch-site") === "cross-site") {
    throw new ShareError("Request not allowed.", 403);
  }
}
export async function readShareBody(req: NextRequest) {
  requireSameOrigin(req);
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new ShareError("JSON required.", 415);
  if (Number(req.headers.get("content-length") || 0) > 4096) throw new ShareError("Request too large.", 413);
  const text = await req.text();
  if (text.length > 4096) throw new ShareError("Request too large.", 413);
  try { return JSON.parse(text); } catch { throw new ShareError("Invalid request."); }
}
export async function shareOwner() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new ShareError("Please sign in.", 401);
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.deletedAt || user.suspendedAt) throw new ShareError("Account unavailable.", 403);
  return user;
}
export async function confirmSharePassword(user: Awaited<ReturnType<typeof shareOwner>>, password: unknown) {
  if (typeof password !== "string" || password.length > 256 || !password) throw new ShareError("Enter your account password.");
  const now = new Date();
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  await prisma.user.updateMany({
    where: { id: user.id, OR: [{ shareAuthWindow: null }, { shareAuthWindow: { lte: cutoff } }] },
    data: { shareAuthWindow: now, shareAuthAttempts: 0 },
  });
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, shareAuthAttempts: { lt: 5 }, deletedAt: null, suspendedAt: null },
    data: { shareAuthAttempts: { increment: 1 } },
  });
  if (!claimed.count) throw new ShareError("Too many password checks. Try again in 15 minutes.", 429);
  if (!(await bcrypt.compare(password, user.password))) throw new ShareError("Incorrect account password.", 401);
}
export const liveShareWhere = () => ({
  revokedAt: null,
  expiresAt: { gt: new Date() },
  user: { deletedAt: null, suspendedAt: null },
});
export async function liveShare(id: string) {
  const share = await prisma.documentShare.findFirst({
    where: { id, ...liveShareWhere() },
    include: { document: { select: { userId: true, cloudStoragePath: true, mimeType: true } } },
  });
  if (!share || share.document.userId !== share.userId) throw new ShareError("This share is unavailable or has expired.", 410);
  return share;
}
function sessionSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Missing session configuration");
  return secret;
}
export const shareCookie = (id: string) => `ld_share_${id}`;
export function recipientSession(shareId: string, expiresAt: Date) {
  const expires = Math.min(Math.floor(expiresAt.getTime() / 1000), Math.floor(Date.now() / 1000) + 15 * 60);
  const token = jwt.sign({ sid: shareId, exp: expires }, sessionSecret(), { algorithm: "HS256", audience: "document-share", issuer: "lockondocs" });
  return { token, expires: new Date(expires * 1000) };
}
export async function authorizedShare(req: NextRequest, id: string) {
  if (!/^[a-z0-9]{20,40}$/.test(id)) throw new ShareError("Access required.", 401);
  const token = req.cookies.get(shareCookie(id))?.value;
  try {
    const claims = jwt.verify(token || "", sessionSecret(), { algorithms: ["HS256"], audience: "document-share", issuer: "lockondocs" }) as JwtPayload;
    if (claims.sid !== id) throw new Error("Wrong share");
  } catch { throw new ShareError("Enter the passcode again to continue.", 401); }
  return liveShare(id);
}
export async function recordShareAccess(id: string, action: "view" | "download") {
  // Updating the parent serializes events for this share, including concurrent opens.
  await prisma.$transaction(async (tx) => {
    const updated = await tx.documentShare.updateMany({
      where: { id, ...liveShareWhere(), ...(action === "download" ? { allowDownload: true } : {}) },
      data: { lastAccessAt: new Date(), ...(action === "view" ? { viewCount: { increment: 1 } } : { downloadCount: { increment: 1 } }) },
    });
    if (!updated.count) throw new ShareError("This share is unavailable or has expired.", 410);
    await tx.shareAccess.create({ data: { shareId: id, action } });
    const boundary = await tx.shareAccess.findMany({ where: { shareId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 99, take: 1 });
    if (boundary[0]) {
      const b = boundary[0];
      await tx.shareAccess.deleteMany({ where: { shareId: id, OR: [{ createdAt: { lt: b.createdAt } }, { createdAt: b.createdAt, id: { lt: b.id } }] } });
    }
  });
}
