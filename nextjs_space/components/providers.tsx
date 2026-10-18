"use client";

import { SessionProvider } from "next-auth/react";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { LockProvider } from "@/components/security/lock-provider";
import { OfflineSync } from "@/components/offline/offline-sync";

export function Providers({ children }: { children: ReactNode }) {
  const recipientPage = usePathname() === "/share";
  return (
    <SessionProvider>
      {recipientPage ? children : <LockProvider>{children}</LockProvider>}
      {!recipientPage && <OfflineSync />}
    </SessionProvider>
  );
}
