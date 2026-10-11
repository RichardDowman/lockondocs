"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WifiOff, Copy } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  OFFLINE_SYNCED_EVENT,
  OFFLINE_SYNC_NOW_EVENT,
  getOfflineState,
  getPlatform,
  offlineEnabledHere,
  readOfflineFlag,
  registerOfflineWorker,
  turnOfflineOff,
  writeOfflineFlag,
} from "@/lib/offline/vault-store";

function formatWhen(ms: number) {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-US")} ${d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/**
 * Settings card for the offline vault. Switching it on acts straight away with
 * no explanation: the installed app just starts saving, a browser that can
 * install shows its install prompt, and an in-app browser hands over to the
 * phone's own browser on the install page.
 */
export function OfflineVaultCard() {
  const router = useRouter();
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState("");
  const [copyUrl, setCopyUrl] = useState<string | null>(null);
  const jumpTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const here = offlineEnabledHere();
    const handedOver = readOfflineFlag() === "jump";
    setOn(here || handedOver);
    if (!here) {
      setStatus(handedOver ? "Opens from your home screen." : "");
      return;
    }
    try {
      const s = await getOfflineState();
      setStatus(
        s?.lastSync
          ? `Saved for offline · ${s.saved} of ${s.count} documents · ${formatWhen(s.lastSync)}`
          : "Saving to this phone.",
      );
    } catch {
      setStatus("Saving to this phone.");
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(OFFLINE_SYNCED_EVENT, refresh);
    return () => {
      window.removeEventListener(OFFLINE_SYNCED_EVENT, refresh);
      if (jumpTimer.current) window.clearTimeout(jumpTimer.current);
    };
  }, [refresh]);

  // If the hand-over did not leave the page, offer the link quietly.
  function watchJump(url: string) {
    if (jumpTimer.current) window.clearTimeout(jumpTimer.current);
    jumpTimer.current = window.setTimeout(() => {
      if (document.visibilityState === "visible") setCopyUrl(url);
    }, 1800);
  }

  function turnOn() {
    const p = getPlatform();
    const installUrl = `${window.location.origin}/install?offline=on`;
    setCopyUrl(null);

    if (p.standalone) {
      writeOfflineFlag("1");
      registerOfflineWorker();
      window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_NOW_EVENT));
      refresh();
      return;
    }

    const prompt = (window as any).__ldInstallPrompt;
    if (prompt && typeof prompt.prompt === "function") {
      writeOfflineFlag("1");
      registerOfflineWorker();
      setOn(true);
      prompt.prompt();
      Promise.resolve(prompt.userChoice)
        .catch(() => undefined)
        .finally(() => {
          (window as any).__ldInstallPrompt = null;
          refresh();
        });
      return;
    }

    if (p.androidWebView) {
      writeOfflineFlag("jump");
      setOn(true);
      window.location.href =
        `intent://${window.location.host}/install?offline=on#Intent;scheme=https;package=com.android.chrome;` +
        `S.browser_fallback_url=${encodeURIComponent(installUrl)};end`;
      watchJump(installUrl);
      return;
    }

    if (p.isIOS && !p.iosSafari) {
      writeOfflineFlag("jump");
      setOn(true);
      window.location.href = `x-safari-${installUrl}`;
      watchJump(installUrl);
      return;
    }

    writeOfflineFlag("1");
    router.push("/install?offline=on");
  }

  async function turnOff() {
    setOn(false);
    setCopyUrl(null);
    setStatus("");
    await turnOfflineOff();
    toast.success("Offline copy removed from this phone.");
  }

  async function copyLink() {
    if (!copyUrl) return;
    try {
      await navigator.clipboard.writeText(copyUrl);
      toast.success("Link copied.");
    } catch {
      window.prompt("Copy this link", copyUrl);
    }
  }

  return (
    <div className="rounded-[var(--radius-lg)] bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Offline vault</p>
            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
              {on && status ? status : "Open your vault with no signal on this phone."}
            </p>
          </div>
        </div>
        <Switch
          checked={on}
          onCheckedChange={(v) => (v ? turnOn() : turnOff())}
          aria-label="Offline vault"
        />
      </div>
      {copyUrl ? (
        <button
          type="button"
          onClick={copyLink}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-accent/60 px-3 py-2 text-sm font-medium text-accent-foreground active:scale-[0.98]"
        >
          <Copy className="h-4 w-4" /> Copy link
        </button>
      ) : null}
    </div>
  );
}
