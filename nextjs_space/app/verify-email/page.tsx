export const dynamic = "force-dynamic";

import { Suspense } from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { VerifyEmailClient } from "@/components/auth/verify-email-client";

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 py-10 hero-gradient">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="relative mb-4 h-24 w-24">
          <Image
            src="/logo.png"
            alt="LockonDocs logo"
            fill
            sizes="96px"
            className="object-contain"
            priority
          />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Verify your email
        </h1>
      </div>
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="pt-6">
          <Suspense fallback={null}>
            <VerifyEmailClient />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
