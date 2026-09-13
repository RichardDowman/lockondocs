"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { LockProvider } from "@/components/security/lock-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <LockProvider>{children}</LockProvider>
    </SessionProvider>
  );
}
