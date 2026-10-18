export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { requireSameOrigin, ShareError, shareFailure, shareJson, shareOwner } from "@/lib/sharing";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await shareOwner();
    const share = await prisma.documentShare.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
    if (!share) throw new ShareError("Share not found.", 404);
    const events = await prisma.shareAccess.findMany({ where: { shareId: share.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: { id: true, action: true, createdAt: true } });
    return shareJson({ events });
  } catch (error) { return shareFailure(error); }
}
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await shareOwner();
    requireSameOrigin(req);
    const result = await prisma.documentShare.updateMany({ where: { id: params.id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) {
      const existing = await prisma.documentShare.findFirst({ where: { id: params.id, userId: user.id }, select: { id: true } });
      if (!existing) throw new ShareError("Share not found.", 404);
    } else await recordAudit({ userId: user.id, action: "share.revoked", detail: `Revoked a document share (${params.id}).` });
    return shareJson({ ok: true });
  } catch (error) { return shareFailure(error); }
}
