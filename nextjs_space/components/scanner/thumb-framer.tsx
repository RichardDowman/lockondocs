"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import { usePinchZoom, type VisibleRect } from "@/lib/use-pinch-zoom";

// The tile-shaped window used to choose a custom vault thumbnail. The page is
// pinched, zoomed and dragged underneath a fixed 3:4 window (the tile's own
// shape), and whatever sits in the window becomes the thumbnail.
export function ThumbFramer({
  src,
  rectRef,
  resetRef,
}: {
  src: string;
  rectRef: MutableRefObject<(() => VisibleRect) | null>;
  resetRef: MutableRefObject<(() => void) | null>;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const { containerRef, imgStyle, visibleRect, reset, handlers } = usePinchZoom({
    natural,
    fit: "cover",
    maxZoom: 6,
  });

  useEffect(() => {
    rectRef.current = visibleRect;
    resetRef.current = reset;
    return () => {
      rectRef.current = null;
      resetRef.current = null;
    };
  }, [rectRef, resetRef, visibleRect, reset]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto aspect-[3/4] w-full max-w-[280px] touch-none overflow-hidden rounded-[var(--radius)] bg-muted shadow-inner ring-2 ring-primary"
      {...handlers}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Document page to frame as the thumbnail"
        draggable={false}
        style={imgStyle}
        onLoad={(e) =>
          setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
      />
    </div>
  );
}
