"use client";

import Link from "next/link";
import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, ScanLine, Settings, Upload, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { setPendingUpload } from "@/lib/pending-upload";

export function BottomNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const pickerRef = useRef<HTMLInputElement | null>(null);

  const isHome = pathname === "/home" || pathname.startsWith("/folder") || pathname.startsWith("/document");
  const isActivity = pathname.startsWith("/activity");
  const isSettings = pathname.startsWith("/settings");

  const itemClass = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center gap-0.5 rounded-md py-1 text-[10px] font-medium transition-colors no-select",
      active ? "text-primary" : "text-muted-foreground",
    );

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 safe-bottom">
      <div className="relative mx-3 mb-3 flex items-center justify-between rounded-[var(--radius-lg)] bg-card/95 px-2 py-2.5 shadow-lg backdrop-blur-md">
        <Link href="/home" className={itemClass(isHome)}>
          <LayoutGrid className="h-5 w-5" />
          Vaults
        </Link>

        {/*
          Upload opens the phone's native picker immediately, over whatever
          screen the user is on. There is no in-app chooser: if they cancel the
          picker nothing happens and they stay where they were; if they pick a
          file we park it and go straight to the review screen.

          The accept list is images only, and uses a plain MIME type with no
          file extensions. That matters on Android: as soon as the accept list
          contains a non-image type or a bare extension the system falls back to
          the generic "Camera / Camcorder / Files" chooser, which is why the
          photo gallery was missing. Image-only accept is what makes Android
          open the photo gallery picker.
        */}
        <input
          ref={pickerRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setPendingUpload(file);
            router.push("/scan?pick=pending");
          }}
        />
        <button
          type="button"
          onClick={() => pickerRef.current?.click()}
          className={itemClass(false)}
        >
          <Upload className="h-5 w-5" />
          Upload
        </button>

        {/* Center spacer that the floating scan button sits above */}
        <div className="h-9 w-14 shrink-0" aria-hidden="true" />

        <button
          type="button"
          onClick={() => router.push("/scan?pick=camera")}
          aria-label="Scan a document"
          className="gold-surface gold-shimmer !absolute left-1/2 -top-6 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full text-primary-foreground shadow-lg ring-4 ring-background transition-transform active:scale-95 no-select"
        >
          <ScanLine className="h-7 w-7" />
        </button>

        <Link href="/activity" className={itemClass(isActivity)}>
          <Activity className="h-5 w-5" />
          Activity
        </Link>

        <Link href="/settings" className={itemClass(isSettings)}>
          <Settings className="h-5 w-5" />
          Settings
        </Link>
      </div>
    </nav>
  );
}
