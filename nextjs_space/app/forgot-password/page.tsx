export const dynamic = "force-dynamic";

import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function ForgotPasswordPage() {
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
          Reset your password
        </h1>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Enter your email and we will send you a secure link to set a new password.
        </p>
      </div>
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="pt-6">
          <ForgotPasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
