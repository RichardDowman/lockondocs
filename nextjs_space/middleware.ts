import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Allow the app to be embedded in the GoodBarber mobile app shell.
//
// GoodBarber native "custom sections" render inside a WebView whose parent
// document is served from a non-network scheme (Capacitor/Cordova style shells
// use schemes such as capacitor://, ionic:// or file://). A CSP
// "frame-ancestors *" directive does NOT match those non-http(s) schemes, so
// sending it caused the native WebView to block the app with
// net::ERR_BLOCKED_BY_RESPONSE. This was confirmed by bisection: pages sent
// with frame-ancestors were blocked, while pages with no CSP loaded fine.
//
// The correct approach for "embeddable anywhere" is therefore to send NO
// frame-ancestors CSP at all, and simply ensure no X-Frame-Options header is
// present (deleted defensively in case an upstream layer adds one). With
// neither header, framing is unrestricted by default, which is what the
// GoodBarber shell needs.
export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.delete("X-Frame-Options");
  return res;
}

export const config = {
  // Run on all routes and static assets so no framing restriction slips through.
  matcher: ["/((?!_next/image).*)"],
};
