"use client";

import { ReactNode } from "react";

/**
 * Launches the app in a TOP-LEVEL browser context instead of navigating inside
 * the current window.
 *
 * On the GoodBarber home page the app is shown inside an embed (iframe /
 * native webview). If "Access My Vault" simply navigated to /login inside that
 * embed, the login would run in a third-party context where the session cookie
 * is blocked by the browser (iOS Safari ITP / third-party cookie blocking), so
 * sign-in toasts, spins and then sticks on the login screen.
 *
 * Opening the target in a new top-level context (the in-app browser with its
 * web header, exactly like the previous "open in browser" behaviour) makes the
 * app run first-party, so cookies, login and the camera all work.
 */
export function VaultLaunch({
  path,
  className,
  children,
}: {
  path: string;
  className?: string;
  children: ReactNode;
}) {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const url = window.location.origin + path;
    // Preferred: open a new top-level browser window. Inside the GoodBarber
    // shell this triggers the in-app browser (with header); in a normal browser
    // it opens a new tab. Either way the app runs first-party.
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) return;
    //
    // The fallbacks below REPLACE the current entry instead of pushing a new
    // one. This is what fixes the double back press coming out of the app
    // shell. Many in-app webviews ignore target=_blank and navigate in place;
    // pushing left the landing page sitting behind the vault, so the first back
    // press returned to the landing page, which immediately sent a signed-in
    // user forward to the vault again (it looked like a page reload) and only a
    // second press escaped. Replacing means the vault is the only entry, so one
    // back press leaves the app.
    //
    // Fallback 1: break out of the iframe by navigating the top frame.
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.replace(url);
        return;
      }
    } catch {
      // Cross-origin top access is blocked; fall through to same-frame nav.
    }
    // Fallback 2: last resort, navigate the current window.
    window.location.replace(url);
  }

  return (
    <a
      href={path}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
