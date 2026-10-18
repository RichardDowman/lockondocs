export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getFileUrl } from "@/lib/s3";
import { authorizedShare, liveShare, PRIVATE_HEADERS, recordShareAccess, ShareError, shareFailure } from "@/lib/sharing";

export async function GET(req: NextRequest) {
  try {
    const share = await authorizedShare(req, req.nextUrl.searchParams.get("id") || "");
    const download = req.nextUrl.searchParams.get("download") === "1";
    if (download && !share.allowDownload) throw new ShareError("The sender has not enabled downloads.", 403);
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
    const ext = extensions[share.document.mimeType];
    if (!ext) throw new ShareError("This file type cannot be shared.", 415);
    const url = await getFileUrl(share.document.cloudStoragePath, share.document.mimeType, false);
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) throw new ShareError("The document could not be loaded. Try again later.", 502);
    await liveShare(share.id);
    await recordShareAccess(share.id, download ? "download" : "view");
    const headers = new Headers(PRIVATE_HEADERS);
    headers.set("Content-Type", share.document.mimeType);
    headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename="shared-document.${ext}"`);
    // The recipient never receives a reusable storage URL or the owner's filename.
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) { return shareFailure(error); }
}
