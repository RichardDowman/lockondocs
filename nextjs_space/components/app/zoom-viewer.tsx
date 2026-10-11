"use client";

import { useEffect, useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { usePinchZoom } from "@/lib/use-pinch-zoom";

// Full-screen reader for a scanned page: pinch or double-tap to zoom in on
// small print, drag to move around. Closes with the X, or Escape on desktop.
export function ZoomViewer({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const { containerRef, imgStyle, view, reset, handlers } = usePinchZoom({
    natural,
    fit: "contain",
    maxZoom: 8,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={alt}>
      <div className="safe-top flex shrink-0 items-center justify-between px-3 py-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          {view.z > 1.05 ? `${view.z.toFixed(1)}x, tap to fit` : "Fit to screen"}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div ref={containerRef} className="relative flex-1 touch-none overflow-hidden" {...handlers}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={imgStyle}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
        />
      </div>
      {view.z <= 1.05 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs text-white">
            <ZoomIn className="h-3.5 w-3.5" /> Pinch or double-tap to zoom
          </span>
        </div>
      )}
    </div>
  );
}
