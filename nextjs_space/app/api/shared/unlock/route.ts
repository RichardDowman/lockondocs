export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { digest, liveShare, liveShareWhere, readShareBody, recipientSession, shareCookie, ShareError, shareFailure, shareJson } from "@/lib/sharing";

// Recipient authentication is a share capability + passcode, not an account session.
export async function POST(req: NextRequest) {
  try {
    const body = await readShareBody(req);
    if (!body || typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token) || typeof body.passcode !== "string" || Array.from(body.passcode).length > 64 || new TextEncoder().encode(body.passcode).length > 72) throw new ShareError("Check the link and sharing password.", 401);
    const share = await prisma.documentShare.findUnique({ where: { tokenHash: digest(body.token) }, select: { id: true, passcodeHash: true } });
    if (!share) throw new ShareError("This share is unavailable or has expired.", 410);
    await liveShare(share.id);
    const now = new Date();
    const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
    await prisma.documentShare.updateMany({ where: { id: share.id, OR: [{ attemptWindow: null }, { attemptWindow: { lte: cutoff } }] }, data: { attemptWindow: now, attemptCount: 0 } });
    const claim = await prisma.documentShare.updateMany({ where: { id: share.id, ...liveShareWhere(), attemptCount: { lt: 10 } }, data: { attemptCount: { increment: 1 } } });
    if (!claim.count) throw new ShareError("Too many attempts. Try again in 15 minutes or ask the sender for a new share.", 429);
    if (!(await bcrypt.compare(body.passcode, share.passcodeHash))) throw new ShareError("Incorrect sharing password.", 401);
    const current = await liveShare(share.id);
    const session = recipientSession(current.id, current.expiresAt);
    const res = shareJson({ id: current.id, mimeType: current.document.mimeType, allowDownload: current.allowDownload, expiresAt: current.expiresAt, sessionExpiresAt: session.expires });
    res.cookies.set(shareCookie(current.id), session.token, { httpOnly: true, secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https", sameSite: "strict", path: "/api/shared", expires: session.expires });
    return res;
  } catch (error) { return shareFailure(error); }
}
