export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";
import { isAllowedUploadType, MAX_UPLOAD_BYTES } from "@/lib/validation";
import { recordAudit, getClientIp } from "@/lib/audit";
import { coerceFieldDefs, sanitizeMetadata, buildSearchText } from "@/lib/vault-fields";
import { computeExpiryDate } from "@/lib/reminders";

// GET: recent documents across all folders (for the home screen)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const documents = await prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { folder: { select: { name: true } } },
    });

    const docs = await Promise.all(
      (documents ?? []).map(async (d) => ({
        id: d.id,
        name: d.name,
        mimeType: d.mimeType,
        folderName: d?.folder?.name ?? "",
        createdAt: d.createdAt,
        url: await getFileUrl(d.cloudStoragePath, d.mimeType, d.isPublic),
      })),
    );

    return NextResponse.json({ documents: docs });
  } catch (err: any) {
    console.error("Documents GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load documents." }, { status: 500 });
  }
}

// POST: save document metadata after a successful S3 upload
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const name = (body?.name ?? "Scanned document").toString().trim() || "Scanned document";
    const folderId = (body?.folderId ?? "").toString();
    const cloudStoragePath = (body?.cloudStoragePath ?? "").toString();
    const mimeType = (body?.mimeType ?? "image/jpeg").toString();
    const fileSize = Number(body?.fileSize ?? 0) || 0;
    const thumbnailPath = body?.thumbnailPath ? body.thumbnailPath.toString() : null;

    if (!folderId || !cloudStoragePath) {
      return NextResponse.json(
        { error: "Missing vault or file reference." },
        { status: 400 },
      );
    }

    // Server-side validation (authoritative).
    if (!isAllowedUploadType(mimeType)) {
      return NextResponse.json(
        { error: "Unsupported file type." },
        { status: 400 },
      );
    }
    if (fileSize > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File is too large. The maximum size is 25 MB." },
        { status: 400 },
      );
    }

    // Ensure the folder belongs to this user (strict isolation).
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, userId },
    });
    if (!folder) {
      return NextResponse.json({ error: "Vault not found." }, { status: 404 });
    }

    // Capture the vault's tailored field values (only known keys are kept) and
    // build the denormalized search haystack.
    const fieldDefs = coerceFieldDefs(folder.fields);
    const metadata = sanitizeMetadata(body?.metadata, fieldDefs);
    const searchText = buildSearchText(name, metadata, fieldDefs);
    const expiryDate = computeExpiryDate(metadata, fieldDefs);

    // Enforce storage quota authoritatively.
    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { storageUsed: true, storageLimit: true },
    });
    if (owner) {
      const projected = BigInt(owner.storageUsed ?? BigInt(0)) + BigInt(fileSize);
      if (projected > BigInt(owner.storageLimit ?? BigInt(0))) {
        return NextResponse.json(
          { error: "Storage limit reached." },
          { status: 413 },
        );
      }
    }

    const document = await prisma.document.create({
      data: {
        userId,
        folderId,
        name,
        cloudStoragePath,
        mimeType,
        fileSize,
        thumbnailPath,
        isPublic: false,
        metadata: metadata as any,
        searchText,
        expiryDate,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { storageUsed: { increment: BigInt(fileSize) } },
    });

    await recordAudit({
      userId,
      action: "document.create",
      detail: `Document \"${name}\" saved to vault ${folderId}`,
      ip: getClientIp(req),
    });

    return NextResponse.json({ documentId: document.id }, { status: 201 });
  } catch (err: any) {
    console.error("Documents POST error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to save document." }, { status: 500 });
  }
}
