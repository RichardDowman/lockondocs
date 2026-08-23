"use client";

import { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

export function MobileFrame({
  children,
  showNav = true,
}: {
  children: ReactNode;
  showNav?: boolean;
}) {
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <main className={showNav ? "flex-1 pb-28" : "flex-1"}>{children}</main>
      {showNav && <BottomNav />}
    </div>
  );
}
