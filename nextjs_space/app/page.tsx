export const dynamic = "force-dynamic";

import Image from "next/image";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ArrowRight, ScanLine, FolderLock, ShieldCheck } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VaultLaunch } from "@/components/home/vault-launch";

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.id) {
    redirect("/home");
  }

  const features = [
    { icon: ScanLine, label: "Scan documents" },
    { icon: FolderLock, label: "Organise securely" },
    { icon: ShieldCheck, label: "Private to you" },
  ];

  return (
    <div className="hero-gradient flex min-h-screen flex-col items-center justify-between px-6 py-12 text-center">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="relative mb-6 h-32 w-32">
          <Image
            src="/logo.png"
            alt="LockonDocs logo"
            fill
            sizes="128px"
            className="object-contain"
            priority
          />
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
          LockonDocs
        </h1>
        <p className="mt-3 max-w-xs text-base leading-relaxed text-muted-foreground">
          Your private vault to scan, organise and securely store the documents
          that matter most.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          {features.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Icon className="h-4 w-4 text-primary" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-sm">
        <VaultLaunch
          path="/home"
          className={cn(buttonVariants({ size: "lg" }), "w-full text-base")}
        >
          Access My Vault
          <ArrowRight className="h-4 w-4" />
        </VaultLaunch>
        <p className="mt-4 text-sm text-muted-foreground">
          New here?{" "}
          <VaultLaunch
            path="/register"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </VaultLaunch>
        </p>
      </div>
    </div>
  );
}
