"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Share, SquarePlus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getPlatform,
  registerOfflineWorker,
  writeOfflineFlag,
} from "@/lib/offline/vault-store";

type Mode = "loading" | "prompt" | "ios" | "menu" | "done";

/**
 * Landing page in the phone's own browser. One action only: install.
 */
export function InstallScreen() {
  const [mode, setMode] = useState<Mode>("loading");
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("offline") === "on") writeOfflineFlag("1");
    const p = getPlatform();
    setIsAndroid(p.isAndroid);
    if (p.standalone) {
      window.location.replace("/home");
      return;
    }
    registerOfflineWorker();

    const pick = () => {
      if ((window as any).__ldInstallPrompt) setMode("prompt");
      else setMode(p.isIOS ? "ios" : "menu");
    };
    pick();
    const onReady = () => setMode("prompt");
    const onInstalled = () => setMode("done");
    window.addEventListener("ld-installready", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("ld-installready", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    const prompt = (window as any).__ldInstallPrompt;
    if (!prompt) return;
    prompt.prompt();
    try {
      const choice = await prompt.userChoice;
      (window as any).__ldInstallPrompt = null;
      setMode(choice?.outcome === "accepted" ? "done" : "menu");
    } catch {
      setMode("menu");
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center">
      <div className="relative mb-6 h-20 w-20">
        <Image src="/logo.png" alt="LockonDocs logo" fill sizes="80px" className="object-contain" priority />
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">LockonDocs</h1>

      <div className="mt-8 w-full max-w-[320px]">
        {mode === "loading" ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        ) : mode === "prompt" ? (
          <Button size="lg" className="gold-surface h-14 w-full text-base" onClick={install}>
            Install LockonDocs
          </Button>
        ) : mode === "ios" ? (
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-base text-foreground">
            Tap <Share className="h-5 w-5 text-primary" aria-label="Share" /> Share, then
            <SquarePlus className="h-5 w-5 text-primary" aria-hidden /> Add to Home Screen.
          </p>
        ) : mode === "menu" ? (
          <p className="text-base text-foreground">
            {isAndroid
              ? "Tap the browser menu, then Add to Home screen."
              : "Use your browser menu to install LockonDocs."}
          </p>
        ) : (
          <p className="flex items-center justify-center gap-2 text-base text-foreground">
            <Check className="h-5 w-5 text-primary" /> Done. Open LockonDocs from your home screen.
          </p>
        )}
      </div>
    </main>
  );
}
