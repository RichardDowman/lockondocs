export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/register-form";

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.id) {
    redirect("/home");
  }

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
          Create your account
        </h1>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Your documents stay private and are visible only to you.
        </p>
      </div>
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="pt-6">
          <RegisterForm />
        </CardContent>
      </Card>
    </div>
  );
}
