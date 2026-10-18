export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { authorizedShare, requireSameOrigin, shareCookie, shareFailure, shareJson } from "@/lib/sharing";
export async function GET(req: NextRequest) {
  try {
    const share = await authorizedShare(req, req.nextUrl.searchParams.get("id") || "");
    return shareJson({ ok: true, allowDownload: share.allowDownload });
  } catch (error) { return shareFailure(error); }
}
export async function DELETE(req: NextRequest) {
  try {
    requireSameOrigin(req);
    const id = req.nextUrl.searchParams.get("id") || "";
    const res = shareJson({ ok: true });
    if (/^[a-z0-9]{20,40}$/.test(id)) res.cookies.set(shareCookie(id), "", { path: "/api/shared", httpOnly: true, sameSite: "strict", maxAge: 0 });
    return res;
  } catch (error) { return shareFailure(error); }
}
