export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl, deleteFile } from "@/lib/s3";
import { recordAudit, getClientIp } from "@/lib/audit";
import { coerceFieldDefs, sanitizeMetadata, buildSearchText } from "@/lib/vault-fields";
import { computeExpiryDate } from "@/lib/reminders";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const document = await prisma.document.findFirst({
      where: { id: params.id, userId },
      include: { folder: { select: { id: true, name: true, fields: true } } },
    });
    if (!document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const url = await getFileUrl(
      document.cloudStoragePath,
      document.mimeType,
      document.isPublic,
    );

    return NextResponse.json({
      document: {
        id: document.id,
        name: document.name,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        createdAt: document.createdAt,
        folderId: document?.folder?.id ?? "",
        folderName: document?.folder?.name ?? "",
        expiryDate: document.expiryDate ? document.expiryDate.toISOString() : null,
        // The vault's tailored field definitions plus this document's captured
        // values, so the document screen can render and edit them.
        fields: coerceFieldDefs(document?.folder?.fields),
        metadata: (document.metadata as Record<string, string>) ?? {},
        url,
      },
    });
  } catch (err: any) {
    console.error("Document GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load document." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = (body?.name ?? "").toString().trim();
    const targetFolderId = body?.folderId != null ? body.folderId.toString().trim() : undefined;
    const hasMetadata = body?.metadata !== undefined;

    if (!name && targetFolderId === undefined && !hasMetadata) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    if (body?.name != null && !name) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    const existing = await prisma.document.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const data: {
      name?: string;
      folderId?: string;
      metadata?: any;
      searchText?: string;
      expiryDate?: Date | null;
      reminderDismissedAt?: Date | null;
      reminderSoonSentAt?: Date | null;
      reminderExpiredSentAt?: Date | null;
    } = {};
    if (name) data.name = name;

    // Moving between folders: verify target folder ownership (strict isolation).
    let effectiveFolderId = existing.folderId;
    if (targetFolderId !== undefined && targetFolderId !== existing.folderId) {
      const target = await prisma.folder.findFirst({
        where: { id: targetFolderId, userId },
      });
      if (!target) {
        return NextResponse.json({ error: "Target vault not found." }, { status: 404 });
      }
      data.folderId = targetFolderId;
      effectiveFolderId = targetFolderId;
    }

    if (Object.keys(data).length === 0 && !hasMetadata) {
      return NextResponse.json({ success: true });
    }

    // Recompute metadata + search text against the effective vault's fields
    // whenever the name, vault or field values change.
    const folder = await prisma.folder.findFirst({
      where: { id: effectiveFolderId, userId },
      select: { fields: true },
    });
    const fieldDefs = coerceFieldDefs(folder?.fields);
    const rawMetadata = hasMetadata ? body.metadata : (existing.metadata ?? {});
    const metadata = sanitizeMetadata(rawMetadata, fieldDefs);
    const effectiveName = data.name ?? existing.name;
    data.metadata = metadata as any;
    data.searchText = buildSearchText(effectiveName, metadata, fieldDefs);

    // Recompute the denormalized expiry date against the effective vault. When
    // it changes, clear any prior dismissal so the new date resurfaces as a
    // reminder rather than staying silently hidden.
    const newExpiry = computeExpiryDate(metadata, fieldDefs);
    const prevMs = existing.expiryDate ? existing.expiryDate.getTime() : null;
    const newMs = newExpiry ? newExpiry.getTime() : null;
    data.expiryDate = newExpiry;
    if (prevMs !== newMs) {
      // A changed (or renewed) expiry date resurfaces the in-app reminder and
      // re-arms both branded emails for the new cycle.
      data.reminderDismissedAt = null;
      data.reminderSoonSentAt = null;
      data.reminderExpiredSentAt = null;
    }

    await prisma.document.update({
      where: { id: existing.id },
      data,
    });

    await recordAudit({
      userId,
      action: data.folderId ? "document.move" : "document.rename",
      detail: data.folderId
        ? `Document ${existing.id} moved to vault ${data.folderId}`
        : `Document ${existing.id} renamed to \"${name}\"`,
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Document PATCH error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to update document." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existing = await prisma.document.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    try {
      await deleteFile(existing.cloudStoragePath);
    } catch (e) {
      // proceed with metadata delete regardless
    }

    if (existing.thumbnailPath) {
      try {
        await deleteFile(existing.thumbnailPath);
      } catch (e) {
        // best effort; the thumbnail is non-essential
      }
    }

    await prisma.document.delete({ where: { id: existing.id } });

    const dec = BigInt(existing.fileSize ?? 0);
    await prisma.user.update({
      where: { id: userId },
      data: { storageUsed: { decrement: dec } },
    }).catch(() => {});

    await recordAudit({
      userId,
      action: "document.delete",
      detail: `Document \"${existing.name}\" (${existing.id}) deleted`,
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Document DELETE error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to delete document." }, { status: 500 });
  }
}
