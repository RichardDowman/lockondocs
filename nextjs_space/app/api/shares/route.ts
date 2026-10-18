export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { sharePasswordError } from "@/lib/share-password";
import { confirmSharePassword, digest, newShareToken, readShareBody, ShareError, shareFailure, shareJson, shareOwner } from "@/lib/sharing";

export async function GET(req: NextRequest) {
  try {
    const user = await shareOwner();
    const documentId = req.nextUrl.searchParams.get("documentId") || undefined;
    const cursor = req.nextUrl.searchParams.get("cursor");
    let before: { createdAt: Date; id: string } | null = null;
    if (cursor) {
      before = await prisma.documentShare.findFirst({ where: { id: cursor, userId: user.id, documentId }, select: { createdAt: true, id: true } });
      if (!before) throw new ShareError("Invalid page.");
    }
    const rows = await prisma.documentShare.findMany({
      where: { userId: user.id, documentId, ...(before ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 21,
      select: { id: true, label: true, documentId: true, document: { select: { name: true } }, allowDownload: true, createdAt: true, expiresAt: true, revokedAt: true, viewCount: true, downloadCount: true, lastAccessAt: true },
    });
    return shareJson({ shares: rows.slice(0, 20).map((s) => ({ ...s, status: s.revokedAt ? "Revoked" : s.expiresAt <= new Date() ? "Expired" : "Active" })), nextCursor: rows.length > 20 ? rows[19].id : null });
  } catch (error) { return shareFailure(error); }
}

export async function POST(req: NextRequest) {
  try {
    const user = await shareOwner();
    const body = await readShareBody(req);
    if (!body || typeof body.documentId !== "string") throw new ShareError("Choose a document.");
    const hours = body.hours ?? 24;
    if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new ShareError("Expiration must be from 1 hour to 7 days.");
    if (body.allowDownload !== undefined && typeof body.allowDownload !== "boolean") throw new ShareError("Invalid download setting.");
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (label.length > 80) throw new ShareError("The private label must be 80 characters or fewer.");
    const passwordError = sharePasswordError(body.passcode);
    if (passwordError) throw new ShareError(passwordError);
    if (body.passcode === body.password) throw new ShareError("Choose a sharing password that is different from your account password.");
    const doc = await prisma.document.findFirst({ where: { id: body.documentId, userId: user.id } });
    if (!doc) throw new ShareError("Document not found.", 404);
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"].includes(doc.mimeType)) throw new ShareError("Save this document as a JPEG, PNG, WebP, or PDF before sharing.");
    await confirmSharePassword(user, body.password);
    const token = newShareToken();
    const share = await prisma.documentShare.create({ data: {
      userId: user.id, documentId: doc.id, label, tokenHash: digest(token), passcodeHash: await bcrypt.hash(body.passcode, 12),
      expiresAt: new Date(Date.now() + hours * 60 * 60 * 1000), allowDownload: body.allowDownload === true,
    }, select: { id: true, expiresAt: true } });
    await recordAudit({ userId: user.id, action: "share.created", detail: `Created a document share (${share.id}).` });
    // Returned once only. The database never holds the raw link token or passcode.
    return shareJson({ ...share, token }, 201);
  } catch (error) { return shareFailure(error); }
}
