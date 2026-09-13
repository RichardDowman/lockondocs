export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl, deleteFile } from "@/lib/s3";
import { recordAudit, getClientIp } from "@/lib/audit";
import { coerceFieldDefs } from "@/lib/vault-fields";

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

    const folder = await prisma.folder.findFirst({
      where: { id: params.id, userId },
    });
    if (!folder) {
      return NextResponse.json({ error: "Vault not found." }, { status: 404 });
    }

    const documents = await prisma.document.findMany({
      where: { folderId: folder.id, userId },
      orderBy: { createdAt: "desc" },
    });

    const docsWithUrls = await Promise.all(
      (documents ?? []).map(async (d) => ({
        id: d.id,
        name: d.name,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        createdAt: d.createdAt,
        hasThumbnail: !!d.thumbnailPath,
        url: await getFileUrl(d.cloudStoragePath, d.mimeType, d.isPublic),
      })),
    );

    return NextResponse.json({
      folder: {
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        isDefault: folder.isDefault,
        fields: coerceFieldDefs(folder.fields),
      },
      documents: docsWithUrls,
    });
  } catch (err: any) {
    console.error("Folder GET error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to load vault." }, { status: 500 });
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

    const folder = await prisma.folder.findFirst({
      where: { id: params.id, userId },
    });
    if (!folder) {
      return NextResponse.json({ error: "Vault not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const name = (body?.name ?? "").toString().trim();
    const icon = body?.icon != null ? body.icon.toString().trim() : undefined;
    // The field builder sends a `fields` array to replace the vault's schema.
    const hasFields = body?.fields !== undefined;
    const fields = hasFields ? coerceFieldDefs(body.fields) : undefined;

    if (!name && icon === undefined && !hasFields) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 },
      );
    }
    if (name && name.length > 60) {
      return NextResponse.json({ error: "Vault name is too long." }, { status: 400 });
    }
    if (fields && fields.length > 20) {
      return NextResponse.json(
        { error: "A vault can have at most 20 fields." },
        { status: 400 },
      );
    }

    const data: { name?: string; icon?: string; fields?: any } = {};
    if (name) data.name = name;
    if (icon !== undefined && icon !== "") data.icon = icon;
    if (fields !== undefined) data.fields = fields as any;

    const updated = await prisma.folder.update({
      where: { id: folder.id },
      data,
    });

    await recordAudit({
      userId,
      action: "folder.update",
      detail: `Vault ${folder.id} renamed/updated to \"${updated.name}\"`,
      ip: getClientIp(req),
    });

    return NextResponse.json({
      folder: {
        id: updated.id,
        name: updated.name,
        icon: updated.icon,
        isDefault: updated.isDefault,
        fields: coerceFieldDefs(updated.fields),
      },
    });
  } catch (err: any) {
    console.error("Folder PATCH error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to update vault." }, { status: 500 });
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

    const folder = await prisma.folder.findFirst({
      where: { id: params.id, userId },
    });
    if (!folder) {
      return NextResponse.json({ error: "Vault not found." }, { status: 404 });
    }
    if (folder.isDefault) {
      return NextResponse.json(
        { error: "Default vaults cannot be deleted." },
        { status: 400 },
      );
    }

    const docs = await prisma.document.findMany({
      where: { folderId: folder.id, userId },
    });
    for (const d of docs ?? []) {
      try {
        await deleteFile(d.cloudStoragePath);
      } catch (e) {
        // continue removing metadata even if a file delete fails
      }
    }

    // Return storage freed to the user's quota counter.
    const freed = (docs ?? []).reduce(
      (sum, d) => sum + BigInt(d.fileSize ?? 0),
      BigInt(0),
    );
    if (freed > BigInt(0)) {
      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { decrement: freed } },
      }).catch(() => {});
    }

    await prisma.folder.delete({ where: { id: folder.id } });

    await recordAudit({
      userId,
      action: "folder.delete",
      detail: `Vault \"${folder.name}\" (${folder.id}) deleted with ${docs?.length ?? 0} document(s)`,
      ip: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Folder DELETE error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to delete vault." }, { status: 500 });
  }
}
