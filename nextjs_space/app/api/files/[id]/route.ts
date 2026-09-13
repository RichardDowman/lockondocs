export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFileUrl } from "@/lib/s3";

// Maps a stored MIME type to a sensible file extension.
function extForMime(mimeType: string): string {
  switch ((mimeType || "").toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}

// Produces a safe attachment filename that already carries the right extension.
function safeDownloadName(name: string, mimeType: string): string {
  const ext = extForMime(mimeType);
  const base = (name || "document").replace(/[\\/:*?"<>|\r\n]+/g, "_").trim() || "document";
  if (ext && base.toLowerCase().endsWith(ext)) return base;
  return base + ext;
}

// Branded document streaming. Streams the file through the app's own domain so
// the underlying storage host is never exposed to the user. Scoped by userId
// to preserve strict per-user isolation. Supports two modes via the
// "disposition" query param: "inline" (in-app preview of images and PDFs) and
// the default "attachment" (a proper download).
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const doc = await prisma.document.findFirst({
      where: { id: params.id, userId },
      select: { cloudStoragePath: true, mimeType: true, name: true, thumbnailPath: true },
    });
    if (!doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const inline = req.nextUrl.searchParams.get("disposition") === "inline";

    // A small preview thumbnail (always a JPEG). Falls back to the full file
    // when a document has no stored thumbnail.
    const wantsThumb =
      req.nextUrl.searchParams.get("variant") === "thumb" && !!doc.thumbnailPath;
    const servePath = wantsThumb ? (doc.thumbnailPath as string) : doc.cloudStoragePath;
    const serveMime = wantsThumb ? "image/jpeg" : doc.mimeType;

    const signed = await getFileUrl(servePath, serveMime, false);
    const upstream = await fetch(signed);
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Could not retrieve the document." }, { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", serveMime || "application/octet-stream");
    const dispositionType = inline || wantsThumb ? "inline" : "attachment";
    headers.set(
      "Content-Disposition",
      `${dispositionType}; filename="${safeDownloadName(doc.name, serveMime)}"`,
    );
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    // Sensitive per-user content: keep it private to the browser only.
    headers.set("Cache-Control", "private, max-age=0, must-revalidate");

    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (err: any) {
    console.error("File download error:", err?.message ?? err);
    return NextResponse.json({ error: "Failed to download the document." }, { status: 500 });
  }
}
