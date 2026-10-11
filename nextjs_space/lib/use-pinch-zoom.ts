"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Pinch, drag, wheel and double-tap zoom for a single image inside a box.
// The page itself blocks browser zoom (the app runs in a fixed viewport), so
// anything that must be read up close zooms through this instead.
//
// The view is kept as a zoom level plus the image point (0 to 1 on each axis)
// that sits in the middle of the box, so it survives the box resizing.

export type ZoomFit = "contain" | "cover";

export interface ZoomView {
  z: number;
  cx: number;
  cy: number;
}

export interface VisibleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const START: ZoomView = { z: 1, cx: 0.5, cy: 0.5 };

export function usePinchZoom({
  natural,
  fit = "contain",
  maxZoom = 8,
}: {
  natural: { w: number; h: number } | null;
  fit?: ZoomFit;
  maxZoom?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [view, setViewState] = useState<ZoomView>(START);
  const viewRef = useRef<ZoomView>(START);
  const boxRef = useRef(box);
  const naturalRef = useRef(natural);
  naturalRef.current = natural;
  boxRef.current = box;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ d: number; mx: number; my: number } | null>(null);
  const lastTapRef = useRef(0);

  const baseScale = useCallback(() => {
    const n = naturalRef.current;
    const b = boxRef.current;
    if (!n || !n.w || !n.h || !b.w || !b.h) return 0;
    return fit === "cover" ? Math.max(b.w / n.w, b.h / n.h) : Math.min(b.w / n.w, b.h / n.h);
  }, [fit]);

  // Keep the picture covering the box (or centered when it is smaller).
  const clampView = useCallback(
    (v: ZoomView): ZoomView => {
      const n = naturalRef.current;
      const b = boxRef.current;
      const s = baseScale();
      const z = Math.min(maxZoom, Math.max(1, v.z));
      if (!n || !s) return { z, cx: 0.5, cy: 0.5 };
      const dw = n.w * s * z;
      const dh = n.h * s * z;
      const axis = (c: number, d: number, size: number) => {
        if (d <= size) return 0.5;
        const half = size / (2 * d);
        return Math.min(1 - half, Math.max(half, c));
      };
      return { z, cx: axis(v.cx, dw, b.w), cy: axis(v.cy, dh, b.h) };
    },
    [baseScale, maxZoom],
  );

  const setView = useCallback(
    (v: ZoomView) => {
      const next = clampView(v);
      viewRef.current = next;
      setViewState(next);
    },
    [clampView],
  );

  const reset = useCallback(() => setView(START), [setView]);

  // Zoom by a factor while keeping the image point under (px, py) in place.
  const zoomAt = useCallback(
    (factor: number, px: number, py: number, fromX = px, fromY = py) => {
      const n = naturalRef.current;
      const b = boxRef.current;
      const s = baseScale();
      if (!n || !s) return;
      const v = viewRef.current;
      const dw = n.w * s * v.z;
      const dh = n.h * s * v.z;
      const ix = v.cx + (fromX - b.w / 2) / dw;
      const iy = v.cy + (fromY - b.h / 2) / dh;
      const z = Math.min(maxZoom, Math.max(1, v.z * factor));
      const dw2 = n.w * s * z;
      const dh2 = n.h * s * z;
      setView({ z, cx: ix - (px - b.w / 2) / dw2, cy: iy - (py - b.h / 2) / dh2 });
    },
    [baseScale, maxZoom, setView],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Wheel zoom needs a non-passive listener so the page does not scroll.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, [zoomAt]);

  // Re-clamp whenever the box or the picture changes size.
  useEffect(() => {
    setView(viewRef.current);
  }, [box.w, box.h, natural?.w, natural?.h, setView]);

  const local = (e: React.PointerEvent) => {
    const r = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const pinchState = () => {
    const [a, b] = Array.from(pointers.current.values());
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) pinchRef.current = pinchState();
    if (pointers.current.size === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        const p = local(e);
        if (viewRef.current.z > 1.05) reset();
        else zoomAt(2.5, p.x, p.y);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2 && pinchRef.current) {
      const next = pinchState();
      const before = pinchRef.current;
      zoomAt(next.d / before.d, next.mx, next.my, before.mx, before.my);
      pinchRef.current = next;
      return;
    }
    const n = naturalRef.current;
    const s = baseScale();
    if (!n || !s) return;
    const v = viewRef.current;
    setView({
      z: v.z,
      cx: v.cx - (p.x - prev.x) / (n.w * s * v.z),
      cy: v.cy - (p.y - prev.y) / (n.h * s * v.z),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinchRef.current = pointers.current.size === 2 ? pinchState() : null;
  };

  // Placement of the <img>: drawn at its fitted size, then moved and scaled.
  const s = baseScale();
  const imgStyle: React.CSSProperties =
    natural && s
      ? {
          position: "absolute",
          left: 0,
          top: 0,
          width: natural.w * s,
          height: natural.h * s,
          maxWidth: "none",
          transformOrigin: "0 0",
          transform: `translate(${box.w / 2 - view.cx * natural.w * s * view.z}px, ${
            box.h / 2 - view.cy * natural.h * s * view.z
          }px) scale(${view.z})`,
          willChange: "transform",
          userSelect: "none",
          pointerEvents: "none",
        }
      : { visibility: "hidden" };

  // The part of the picture currently in the box, as fractions of the image.
  const visibleRect = useCallback((): VisibleRect => {
    const n = naturalRef.current;
    const b = boxRef.current;
    const sc = baseScale();
    const v = viewRef.current;
    if (!n || !sc) return { x: 0, y: 0, w: 1, h: 1 };
    const w = Math.min(1, b.w / (n.w * sc * v.z));
    const h = Math.min(1, b.h / (n.h * sc * v.z));
    const x = Math.min(1 - w, Math.max(0, v.cx - w / 2));
    const y = Math.min(1 - h, Math.max(0, v.cy - h / 2));
    return { x, y, w, h };
  }, [baseScale]);

  return {
    containerRef,
    imgStyle,
    view,
    reset,
    visibleRect,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
