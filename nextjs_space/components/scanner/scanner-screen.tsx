"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  X,
  RotateCcw,
  RotateCw,
  Crop as CropIcon,
  Check,
  Sun,
  Contrast,
  Loader2,
  Images,
  FileUp,
  FileText,
  AlertTriangle,
  Plus,
  Trash2,
  Files,
  Image as ImageIcon,
  ScanLine,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  loadImage,
  renderProcessedPage,
  buildPdfFromImages,
  renderThumbnailContain,
  renderThumbnailCover,
  type CropRect,
  type ProcessedPage,
} from "@/lib/imaging";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ThumbFramer } from "@/components/scanner/thumb-framer";
import type { VisibleRect } from "@/lib/use-pinch-zoom";
import { takePendingUpload } from "@/lib/pending-upload";
import type { FieldDef } from "@/lib/vault-fields";
import {
  loadDocScanner,
  isScannerReady,
  detectCorners,
  blendCorners,
  cornersDrift,
  correctCanvasToDataUrl,
  scaleCorners,
  MAX_SOURCE_PIXELS,
  type Corners,
} from "@/lib/doc-scan";
import { createCaptureGate, DETECT_INTERVAL_MS, type CaptureGate } from "@/lib/doc-scan-gate";

interface FolderItem {
  id: string;
  name: string;
  fields: FieldDef[];
}

type Stage = "choose" | "loading" | "camera" | "nocamera" | "edit" | "saving";

// Start the crop box at the full frame so an upload is never trimmed until the
// user actively drags the handles inward.
const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

// --- Live outline drawing ---------------------------------------------------
// Detecting a shape is not the same as having something worth drawing. A quad
// that has not passed the framing checks is only outlined once it has agreed
// with the previous frames, because on slower Android webviews the raw contour
// can land on a completely different shape each frame and drawing every one of
// them looks like the outline is flying around the screen.
//
// Largest corner movement between frames, as a share of the frame diagonal,
// that still counts as the same shape.
const DRAW_STEADY_DRIFT = 0.1;
// How many frames in a row must agree before an unconfirmed outline is drawn.
const DRAW_STEADY_FRAMES = 3;
// How long the last outline stays on screen through a missed or noisy frame,
// so it settles instead of blinking.
const DRAW_GRACE_MS = 500;

// When a hold keeps collapsing, the hint stops repeating "hold steady" and
// offers the shutter instead. How many abandoned holds, and over what window.
const STRUGGLE_BREAKS = 3;
const STRUGGLE_WINDOW_MS = 8000;

// How long the "Scan captured" confirmation is held on the frozen frame before
// the details step opens, so an automatic capture is felt as a finished scan
// rather than an abrupt jump.
const CAPTURE_CONFIRM_MS = 900;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// File-type detection that works across iOS and Android. Mobile browsers are
// inconsistent: iOS often reports HEIC/HEIF photos, and many Android file
// managers and content-URI pickers report an empty or generic MIME type. So we
// fall back to the filename extension whenever the reported type is unhelpful.
function fileExt(name: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name || "");
  return m ? m[1].toLowerCase() : "";
}

function isHeicFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  const e = fileExt(file.name);
  return e === "heic" || e === "heif";
}

function isPdfFile(file: File): boolean {
  if ((file.type || "").toLowerCase() === "application/pdf") return true;
  return fileExt(file.name) === "pdf";
}

function isImageFile(file: File): boolean {
  if ((file.type || "").toLowerCase().startsWith("image/")) return true;
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif"].includes(
    fileExt(file.name),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read-failed"));
    reader.onerror = () => reject(reader.error ?? new Error("read-failed"));
    reader.readAsDataURL(blob);
  });
}

export function ScannerScreen({
  initialFolderId,
  initialPick,
}: {
  initialFolderId?: string;
  initialPick?: string;
}) {
  const router = useRouter();
  const autoPickRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const cropLayerRef = useRef<HTMLDivElement | null>(null);
  const thumbSourceRef = useRef<HTMLImageElement | null>(null);
  // Read the framed area / reset the framing inside the thumbnail dialog.
  const thumbRectRef = useRef<(() => VisibleRect) | null>(null);
  const thumbResetRef = useRef<(() => void) | null>(null);
  // Unsaved-scan guard: the latest dirty flag, whether our back-gesture history
  // entry is on the stack, whether leaving is now allowed, the action waiting
  // on the exit dialog, and a navigation queued behind history.back().
  const dirtyRef = useRef(false);
  const guardPushedRef = useRef(false);
  const allowExitRef = useRef(false);
  const pendingExitRef = useRef<(() => void) | null>(null);
  const leaveRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<
    | { mode: "move" | "nw" | "ne" | "sw" | "se"; startXn: number; startYn: number; startRect: CropRect }
    | null
  >(null);

  // --- On-device document detection (OpenCV.js + jscanify, loaded lazily) ---
  // The scanner instance, a scratch canvas the live detector draws into, and
  // guards so a capture never runs twice or overlaps a still-in-flight one.
  const scannerRef = useRef<Awaited<ReturnType<typeof loadDocScanner>> | null>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Decides when a detection has been held steady long enough to capture.
  const gateRef = useRef<CaptureGate | null>(null);
  // Last drawn outline, used to ease the polygon instead of letting it twitch.
  const smoothRef = useRef<Corners | null>(null);
  // The previous raw detection plus how many frames in a row have agreed with
  // it, and when an outline was last drawn. Together these keep unstable
  // detections off the screen.
  const rawRef = useRef<Corners | null>(null);
  const steadyDrawRef = useRef(0);
  const lastDrawAtRef = useRef(0);
  const capturingRef = useRef(false);
  // The latest well-framed outline from the live preview (in detect-canvas
  // pixels), used as a fallback when straightening the full-resolution frame.
  const lastGoodRef = useRef<{ corners: Corners; cw: number; ch: number; at: number } | null>(null);
  // Half-size scratch canvas for the live detector's stepped downscale.
  const stepCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Timestamps of recently abandoned holds. Several in a short window means the
  // phone is finding the page but cannot keep it still, which is when the hint
  // should point at the manual shutter instead of repeating "hold steady".
  const breaksRef = useRef<number[]>([]);
  const strugglingRef = useRef(false);
  // Rolling detection counters for the ?debug=1 panel. Reset every publish tick.
  const diagRef = useRef({
    runs: 0,
    sumMs: 0,
    found: 0,
    since: 0,
    reason: "",
    frames: 0,
    drift: -1,
    total: -1,
    breaks: 0,
    vw: 0,
    vh: 0,
    cw: 0,
    ch: 0,
    cam: "",
  });
  // The two versions of the just-captured page, both kept so the review screen
  // can toggle between them: the auto-straightened crop and the untouched frame.
  const correctedDataUrlRef = useRef<string | null>(null);
  const originalDataUrlRef = useRef<string | null>(null);

  // The entry point decides where we start. "camera" (the floating scan button)
  // and "pending" (a file already chosen from the phone's native picker) both
  // skip the chooser entirely and show a brief spinner while they get going.
  // Everything else (e.g. "Scan into this vault") opens the two-option chooser.
  const [stage, setStage] = useState<Stage>(
    initialPick === "camera" || initialPick === "pending" ? "loading" : "choose",
  );
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [cropping, setCropping] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [pages, setPages] = useState<ProcessedPage[]>([]);
  const [saveAsPdf, setSaveAsPdf] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [folderId, setFolderId] = useState<string>(initialFolderId ?? "");
  const [docName, setDocName] = useState("");
  // Captured values for the chosen vault's tailored fields, keyed by field key.
  const [metaValues, setMetaValues] = useState<Record<string, string>>({});
  const [preparing, setPreparing] = useState(false);
  // A user-chosen preview thumbnail (optional). When unset, a "whole page"
  // thumbnail is generated automatically at save time.
  const [thumbBlob, setThumbBlob] = useState<Blob | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbOpen, setThumbOpen] = useState(false);
  // Exit confirmation for an unsaved scan (Build 38).
  const [exitOpen, setExitOpen] = useState(false);
  // Which question the review card is on. Back to the first step whenever a
  // fresh scan or file arrives (a failed save returns to edit and keeps it).
  const [detailStep, setDetailStep] = useState(0);
  const prevStageRef = useRef(stage);
  useEffect(() => {
    const prev = prevStageRef.current;
    prevStageRef.current = stage;
    if (stage === "edit" && prev !== "edit" && prev !== "saving") setDetailStep(0);
  }, [stage]);
  const [thumbBusy, setThumbBusy] = useState(false);
  // The image shown inside the framing dialog. The overlay layer wraps the
  // rendered <img> (inline-block) so the frame lines up exactly.
  const [thumbImgUrl, setThumbImgUrl] = useState<string | null>(null);
  // Automatic edge detection is on by default. When on, a live frame outline is
  // drawn over the camera feed and a well-framed document is captured on its
  // own. It can be turned off to fall back to a plain manual shutter.
  const [autoDetect, setAutoDetect] = useState(true);
  // Corner points of the currently detected document, in on-screen pixels, plus
  // whether the framing is good. Drives the live overlay polygon.
  const [overlay, setOverlay] = useState<{
    pts: { x: number; y: number }[];
    good: boolean;
    progress: number;
  } | null>(null);
  // True once a captured or uploaded image was auto-straightened, so the review
  // screen can show a badge and let the user toggle between the straightened
  // crop and the untouched original.
  const [autoCorrected, setAutoCorrected] = useState(false);
  // Which of the two versions is currently on screen. Starts on the corrected
  // crop; "Use original" flips it and "Use auto-cropped" flips it back.
  const [showingOriginal, setShowingOriginal] = useState(false);
  // The just-captured frame, held on screen under a confirmation while the
  // review screen is prepared. Null whenever no capture is being confirmed.
  const [captureFlash, setCaptureFlash] = useState<string | null>(null);
  // Drives the white shutter flash that fades out over the frozen frame.
  const [flashOn, setFlashOn] = useState(false);
  // Set once the same hold has been abandoned several times in a row, so the
  // hint can offer the manual shutter instead of silently trying forever.
  const [struggling, setStruggling] = useState(false);
  // Live detection diagnostics, shown only with ?debug=1 on the scan screen.
  // Purely a field-support aid: it is the quickest way to tell a device that
  // is detecting too slowly from one that simply cannot be held still.
  const [debug, setDebug] = useState(false);
  const [diag, setDiag] = useState<{
    rate: number;
    avgMs: number;
    foundPct: number;
    frames: number;
    drift: number;
    totalDrift: number;
    reason: string;
    breaks: number;
    video: string;
    detect: string;
    cam: string;
  } | null>(null);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setStage("loading");
    setCaptureFlash(null);
    setFlashOn(false);
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setStage("nocamera");
        return;
      }
      const md = navigator.mediaDevices;
      // Open the rear camera exactly as Build 37 did, so the phone picks the
      // same lens it used when edge detection worked. Asking for 4K in the
      // first request (Build 38) can steer a multi-lens phone to a different
      // rear lens and makes the live preview heavy, which cost us auto-detect.
      let stream = await md.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      // Then raise the SAME camera to 1080p for a sharper picture. This keeps
      // the chosen lens; if the browser refuses, the default stream stays.
      // The full-resolution photo at the shutter (where supported) is the
      // main readability path, so the live stream does not need 4K.
      try {
        const t = stream.getVideoTracks()[0];
        const s = t?.getSettings?.() ?? {};
        const portrait = (s.height ?? 0) > (s.width ?? 0);
        await t?.applyConstraints?.({
          width: { ideal: portrait ? 1080 : 1920 },
          height: { ideal: portrait ? 1920 : 1080 },
        });
      } catch {
        // keep the default resolution
      }
      // Android: keep autofocus running continuously where the browser allows.
      const track = stream.getVideoTracks()[0];
      try {
        const caps: any = track?.getCapabilities?.() ?? {};
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] });
        }
      } catch {
        // not supported; the camera's default focus applies
      }
      try {
        const s = track?.getSettings?.() ?? {};
        diagRef.current.cam = `${track?.label || "camera"} ${s.width ?? "?"}x${s.height ?? "?"}`;
      } catch {
        diagRef.current.cam = "camera";
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStage("camera");
    } catch (err) {
      setStage("nocamera");
    }
  }, []);

  // Load folders once.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/folders");
        const data = await res.json().catch(() => ({}));
        const list: FolderItem[] = (data?.folders ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          fields: Array.isArray(f.fields) ? f.fields : [],
        }));
        setFolders(list);
        if (!initialFolderId && list.length > 0) {
          setFolderId(list[0].id);
        }
      } catch (err) {
        // non-fatal
      }
    })();
  }, [initialFolderId]);

  // Clean up the camera stream when leaving the screen.
  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const renderPreview = useCallback((b: number, c: number, rot: number) => {
    const img = sourceImageRef.current;
    const canvas = previewCanvasRef.current;
    if (!img || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const r = (((rot % 360) + 360) % 360);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const swap = r === 90 || r === 270;
    canvas.width = swap ? ih : iw;
    canvas.height = swap ? iw : ih;
    ctx.filter = `brightness(${b}%) contrast(${c}%)`;
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((r * Math.PI) / 180);
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();
  }, []);

  // Show a data URL in the review/edit stage. This only handles the on-screen
  // image and its adjustments; the corrected/original bookkeeping is set by the
  // caller so switching between the two versions never disturbs the refs.
  const loadSourceFromDataUrl = useCallback(
    (dataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        setPdfFile(null);
        sourceImageRef.current = img;
        setBrightness(100);
        setContrast(100);
        setRotation(0);
        setCropRect(null);
        setCropping(false);
        setThumbBlob(null);
        setThumbUrl(null);
        setStage("edit");
        setTimeout(() => renderPreview(100, 100, 0), 30);
      };
      img.onerror = () => toast.error("Could not process the image.");
      img.src = dataUrl;
    },
    [renderPreview],
  );

  // Record which two versions the review screen can toggle between. Passing a
  // corrected and an original enables the toggle; passing nulls disables it and
  // always starts on the corrected crop.
  const setVersions = useCallback(
    (correctedUrl: string | null, originalUrl: string | null) => {
      correctedDataUrlRef.current = correctedUrl;
      originalDataUrlRef.current = originalUrl;
      setAutoCorrected(!!correctedUrl && !!originalUrl);
      setShowingOriginal(false);
    },
    [],
  );

  const capture = useCallback(async () => {
    if (capturingRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) {
      toast.error("Camera is not ready yet.");
      return;
    }
    capturingRef.current = true;
    const hintSnap = lastGoodRef.current;
    lastGoodRef.current = null;
    const startedAt = performance.now();
    // Freeze the full-resolution video frame straight away, so the shutter
    // feels instant whatever happens next.
    const vk = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (vw * vh)));
    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = Math.max(1, Math.round(vw * vk));
    videoCanvas.height = Math.max(1, Math.round(vh * vk));
    const ctx = videoCanvas.getContext("2d");
    if (!ctx) {
      capturingRef.current = false;
      return;
    }
    ctx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);
    const videoRaw = videoCanvas.toDataURL("image/jpeg", 0.95);
    setOverlay(null);
    gateRef.current?.reset();
    smoothRef.current = null;
    rawRef.current = null;
    steadyDrawRef.current = 0;
    breaksRef.current = [];
    strugglingRef.current = false;
    setStruggling(false);
    // Hold a short confirmation on the frozen frame: a white shutter flash, a
    // tick and "Scan captured". Without it an automatic capture simply jumps to
    // the details form and the user never sees that the scan landed.
    setCaptureFlash(videoRaw);
    setFlashOn(true);
    window.setTimeout(() => setFlashOn(false), 90);

    // Where the browser can take a real photo (Chrome on Android), use it: it
    // is usually several times the resolution of the video stream and goes
    // through the camera's own sharpening. iOS has no such API, so it keeps
    // the full-resolution video frame. Bounded, so a slow camera never stalls.
    let still: HTMLCanvasElement | null = null;
    try {
      const IC = (window as any).ImageCapture;
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (IC && track && track.readyState === "live") {
        const ic = new IC(track);
        const settings: Record<string, string> = {};
        try {
          const caps = await ic.getPhotoCapabilities();
          if (Array.isArray(caps?.fillLightMode) && caps.fillLightMode.includes("off")) {
            settings.fillLightMode = "off";
          }
        } catch {
          /* no photo capabilities */
        }
        const blob: Blob | null = await Promise.race([
          ic.takePhoto(settings).catch(() => null),
          new Promise<null>((res) => window.setTimeout(() => res(null), 2000)),
        ]);
        if (blob) {
          const bmp = await createImageBitmap(blob);
          const sameShape = bmp.width >= bmp.height === vw >= vh;
          if (sameShape && bmp.width * bmp.height > vw * vh * 1.2) {
            const k = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (bmp.width * bmp.height)));
            const sc = document.createElement("canvas");
            sc.width = Math.max(1, Math.round(bmp.width * k));
            sc.height = Math.max(1, Math.round(bmp.height * k));
            const sctx = sc.getContext("2d");
            if (sctx) {
              sctx.imageSmoothingQuality = "high";
              sctx.drawImage(bmp, 0, 0, sc.width, sc.height);
              still = sc;
            }
          }
          bmp.close?.();
        }
      }
    } catch {
      still = null;
    }
    stopStream();
    // Let the confirmation paint before the heavier straightening work.
    await new Promise((resolve) => window.setTimeout(resolve, 30));

    // Straighten the document on-device when the CV runtime is already loaded.
    // Any failure falls back to the untouched frame, so a capture never breaks.
    let raw = videoRaw;
    let corrected: string | null = null;
    const scanner = isScannerReady() ? scannerRef.current : null;
    if (still) {
      try {
        raw = still.toDataURL("image/jpeg", 0.95);
        if (scanner) corrected = correctCanvasToDataUrl(still, scanner, 0.95);
      } catch {
        corrected = null;
      }
    }
    if (!corrected && scanner) {
      try {
        const hint =
          hintSnap && startedAt - hintSnap.at < 1000
            ? scaleCorners(
                hintSnap.corners,
                videoCanvas.width / hintSnap.cw,
                videoCanvas.height / hintSnap.ch,
              )
            : null;
        const fromVideo = correctCanvasToDataUrl(videoCanvas, scanner, 0.95, hint);
        if (fromVideo) {
          corrected = fromVideo;
          // Keep the pair consistent: the original shown beside this crop is
          // the same video frame it was cut from.
          raw = videoRaw;
        }
      } catch {
        corrected = null;
      }
    }
    const remaining = CAPTURE_CONFIRM_MS - (performance.now() - startedAt);
    if (remaining > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remaining));
    }
    if (corrected) {
      setVersions(corrected, raw);
      loadSourceFromDataUrl(corrected);
    } else {
      setVersions(null, null);
      loadSourceFromDataUrl(raw);
    }
    // The confirmation lives inside the camera stage, which the review screen
    // replaces. This is only a safety net in case the image fails to load.
    window.setTimeout(() => setCaptureFlash(null), 4000);
    capturingRef.current = false;
  }, [loadSourceFromDataUrl, setVersions, stopStream]);

  // Switch the review image to the untouched original. Both versions are kept,
  // so the auto-cropped one can be brought back with useCorrectedImage.
  const useOriginalImage = useCallback(() => {
    const original = originalDataUrlRef.current;
    if (!original) return;
    setShowingOriginal(true);
    loadSourceFromDataUrl(original);
    toast.success("Showing the original photo.");
  }, [loadSourceFromDataUrl]);

  // Switch the review image back to the auto-straightened crop.
  const useCorrectedImage = useCallback(() => {
    const corrected = correctedDataUrlRef.current;
    if (!corrected) return;
    setShowingOriginal(false);
    loadSourceFromDataUrl(corrected);
    toast.success("Showing the auto-cropped scan.");
  }, [loadSourceFromDataUrl]);

  // Live document detection while the camera is open. A lightweight throttled
  // loop outlines the detected document and hands each detection to the capture
  // gate, which only fires the shutter once the same well-framed document has
  // been held still for a sustained stretch (and never in the first moment
  // after the camera opens). Best-effort: if OpenCV cannot load, the loop draws
  // nothing and the manual shutter still works.
  useEffect(() => {
    if (stage !== "camera" || !autoDetect) {
      setOverlay(null);
      gateRef.current = null;
      smoothRef.current = null;
      rawRef.current = null;
      steadyDrawRef.current = 0;
      return;
    }
    let cancelled = false;
    let rafId = 0;
    let lastRun = 0;
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const gate = createCaptureGate(startedAt);
    gateRef.current = gate;
    smoothRef.current = null;
    rawRef.current = null;
    steadyDrawRef.current = 0;
    lastDrawAtRef.current = 0;

    const loop = (now: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(loop);
      if (now - lastRun < DETECT_INTERVAL_MS) return;
      lastRun = now;
      const scanner = scannerRef.current;
      const video = videoRef.current;
      if (!scanner || !video || capturingRef.current) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;
      const scale = Math.min(1, 360 / vw);
      const cw = Math.max(1, Math.round(vw * scale));
      const ch = Math.max(1, Math.round(vh * scale));
      let dc = detectCanvasRef.current;
      if (!dc) {
        dc = document.createElement("canvas");
        detectCanvasRef.current = dc;
      }
      dc.width = cw;
      dc.height = ch;
      const dctx = dc.getContext("2d");
      if (!dctx) return;
      dctx.imageSmoothingEnabled = true;
      dctx.imageSmoothingQuality = "high";
      // A sharp stream shrunk to 360px in one jump turns print and texture
      // into speckle that hides the page edges. Halve it first, then finish,
      // so the detector sees a clean, averaged picture.
      if (vw > cw * 2.5) {
        let sc = stepCanvasRef.current;
        if (!sc) {
          sc = document.createElement("canvas");
          stepCanvasRef.current = sc;
        }
        const hw = cw * 2;
        const hh = ch * 2;
        if (sc.width !== hw || sc.height !== hh) {
          sc.width = hw;
          sc.height = hh;
        }
        const sctx = sc.getContext("2d");
        if (sctx) {
          sctx.imageSmoothingEnabled = true;
          sctx.imageSmoothingQuality = "high";
          sctx.drawImage(video, 0, 0, hw, hh);
          dctx.drawImage(sc, 0, 0, cw, ch);
        } else {
          dctx.drawImage(video, 0, 0, cw, ch);
        }
      } else {
        dctx.drawImage(video, 0, 0, cw, ch);
      }
      let corners: Corners | null = null;
      const detectStart = performance.now();
      try {
        corners = detectCorners(dc, scanner);
      } catch {
        corners = null;
      }
      const d = diagRef.current;
      d.runs += 1;
      d.sumMs += performance.now() - detectStart;
      if (corners) d.found += 1;
      d.vw = vw;
      d.vh = vh;
      d.cw = cw;
      d.ch = ch;

      // The gate owns the decision: is this a document, and has it been held
      // still long enough to be worth capturing?
      const verdict = gate.push(corners, cw, ch, now);
      d.reason = verdict.reason;
      d.frames = verdict.frames;
      d.drift = verdict.drift;
      d.total = verdict.totalDrift;
      // Remember the latest well-framed outline, so a capture can still be
      // straightened if the full-size frame happens to confuse the detector.
      if (corners && verdict.good) {
        lastGoodRef.current = { corners, cw, ch, at: now };
      }

      // Count abandoned holds over a short rolling window. Three or more means
      // the page keeps being found and lost, so offer the shutter.
      if (verdict.broke) breaksRef.current.push(now);
      if (breaksRef.current.length) {
        breaksRef.current = breaksRef.current.filter((t) => now - t < STRUGGLE_WINDOW_MS);
      }
      d.breaks = breaksRef.current.length;
      const isStruggling = breaksRef.current.length >= STRUGGLE_BREAKS;
      if (isStruggling !== strugglingRef.current) {
        strugglingRef.current = isStruggling;
        setStruggling(isStruggling);
      }

      // Nothing found. Hold the last outline briefly so a single missed frame
      // does not make it blink, then drop it.
      if (!corners) {
        rawRef.current = null;
        steadyDrawRef.current = 0;
        if (now - lastDrawAtRef.current >= DRAW_GRACE_MS) {
          smoothRef.current = null;
          setOverlay(null);
        } else {
          // Keep the outline and the wording steady, but let the hold bar give
          // ground, so a dropped frame reads as losing a little rather than as
          // nothing happening at all.
          setOverlay((o) => (o ? { ...o, progress: verdict.progress } : o));
        }
        return;
      }

      // Is this shape worth drawing? A quad that passed the framing checks
      // always is. Anything else has to agree with the previous frames first,
      // which is what keeps a jittery Android detection off the screen instead
      // of outlining a different shape every frame.
      const previousRaw = rawRef.current;
      rawRef.current = corners;
      const agrees =
        !!previousRaw &&
        cornersDrift(previousRaw, corners, cw, ch) < DRAW_STEADY_DRIFT;
      steadyDrawRef.current = agrees ? steadyDrawRef.current + 1 : 0;
      if (!verdict.good && steadyDrawRef.current < DRAW_STEADY_FRAMES) {
        if (now - lastDrawAtRef.current >= DRAW_GRACE_MS) {
          smoothRef.current = null;
          setOverlay(null);
        }
        return;
      }

      // Ease the drawn outline towards the new detection so it settles rather
      // than twitching, but snap straight to it after a real jump.
      const prev = smoothRef.current;
      const drawn =
        prev && cornersDrift(prev, corners, cw, ch) < 0.12
          ? blendCorners(prev, corners)
          : corners;
      smoothRef.current = drawn;
      lastDrawAtRef.current = now;

      // Map small-canvas coords to on-screen pixels, honoring object-cover.
      const rect = video.getBoundingClientRect();
      const coverScale = Math.max(rect.width / vw, rect.height / vh);
      const offX = (rect.width - vw * coverScale) / 2;
      const offY = (rect.height - vh * coverScale) / 2;
      const toScreen = (p: { x: number; y: number }) => ({
        x: offX + (p.x / scale) * coverScale,
        y: offY + (p.y / scale) * coverScale,
      });
      setOverlay({
        pts: [
          toScreen(drawn.topLeftCorner),
          toScreen(drawn.topRightCorner),
          toScreen(drawn.bottomRightCorner),
          toScreen(drawn.bottomLeftCorner),
        ],
        good: verdict.good,
        progress: verdict.progress,
      });

      if (verdict.shouldCapture && !capturingRef.current) {
        gate.reset();
        void capture();
      }
    };

    // Kick off (or reuse) the CV runtime; the loop starts regardless so the
    // outline appears the moment detection is ready.
    (async () => {
      try {
        const scanner = await loadDocScanner();
        if (!cancelled) scannerRef.current = scanner;
      } catch {
        // CDN blocked or timed out; overlay stays hidden, manual capture works.
      }
    })();
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      setOverlay(null);
      gateRef.current = null;
      smoothRef.current = null;
      rawRef.current = null;
      steadyDrawRef.current = 0;
      breaksRef.current = [];
      strugglingRef.current = false;
      setStruggling(false);
    };
  }, [stage, autoDetect, capture]);

  // Read the debug flag on the client only, so the server and first client
  // render agree. ?debug=1 turns on the live detection readout.
  useEffect(() => {
    try {
      setDebug(new URLSearchParams(window.location.search).get("debug") === "1");
    } catch {
      setDebug(false);
    }
  }, []);

  // Publish the rolling detection counters a couple of times a second while the
  // debug readout is on. Averaging over a window keeps the numbers readable.
  useEffect(() => {
    if (!debug || stage !== "camera") {
      setDiag(null);
      return;
    }
    const d = diagRef.current;
    d.runs = 0;
    d.sumMs = 0;
    d.found = 0;
    d.since = performance.now();
    const id = window.setInterval(() => {
      const c = diagRef.current;
      const elapsed = Math.max(1, performance.now() - c.since) / 1000;
      setDiag({
        rate: c.runs / elapsed,
        avgMs: c.runs ? c.sumMs / c.runs : 0,
        foundPct: c.runs ? (c.found / c.runs) * 100 : 0,
        frames: c.frames,
        drift: c.drift,
        totalDrift: c.total,
        reason: c.reason || "idle",
        breaks: c.breaks,
        video: `${c.vw}x${c.vh}`,
        detect: `${c.cw}x${c.ch}`,
        cam: c.cam || "n/a",
      });
      c.runs = 0;
      c.sumMs = 0;
      c.found = 0;
      c.since = performance.now();
    }, 500);
    return () => window.clearInterval(id);
  }, [debug, stage]);

  // Turn any selected image (including an iPhone HEIC/HEIF photo) into a data
  // URL the canvas can edit. HEIC is decoded to JPEG in the browser so the flow
  // works identically on iOS and Android.
  const ingestImage = useCallback(
    async (file: File) => {
      setPreparing(true);
      try {
        let source: Blob = file;
        if (isHeicFile(file)) {
          const heic2any = (await import("heic2any")).default;
          const converted = await heic2any({
            blob: file,
            toType: "image/jpeg",
            quality: 0.95,
          });
          source = Array.isArray(converted) ? converted[0] : (converted as Blob);
        }
        const dataUrl = await blobToDataUrl(source);
        // Try to straighten uploaded/gallery photos too, so a snapshot of a
        // document taken outside the app still comes out flat. The scanner is
        // loaded with a bound wait so a blocked CDN never stalls the upload.
        let handled = false;
        try {
          const scanner = await Promise.race([
            loadDocScanner(),
            new Promise<null>((res) => setTimeout(() => res(null), 12000)),
          ]);
          if (scanner) {
            scannerRef.current = scanner;
            const img = await loadImage(dataUrl);
            const w0 = img.naturalWidth || img.width;
            const h0 = img.naturalHeight || img.height;
            if (w0 > 0 && h0 > 0) {
              // Stay under the iOS canvas limit for very large photos.
              const k = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (w0 * h0)));
              const cvs = document.createElement("canvas");
              cvs.width = Math.max(1, Math.round(w0 * k));
              cvs.height = Math.max(1, Math.round(h0 * k));
              const ctx = cvs.getContext("2d");
              if (ctx) {
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(img, 0, 0, cvs.width, cvs.height);
                const corrected = correctCanvasToDataUrl(cvs, scanner, 0.95);
                if (corrected) {
                  setVersions(corrected, dataUrl);
                  loadSourceFromDataUrl(corrected);
                  handled = true;
                }
              }
            }
          }
        } catch {
          // Detection failed; fall back to the raw photo below.
        }
        if (!handled) {
          setVersions(null, null);
          loadSourceFromDataUrl(dataUrl);
        }
      } catch (err) {
        toast.error("Could not read that photo. Please try a different one.");
      } finally {
        setPreparing(false);
      }
    },
    [loadSourceFromDataUrl, setVersions],
  );

  // Pick an existing photo from the gallery (images only).
  const handleGalleryPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!isImageFile(file)) {
        toast.error("Please choose an image file.");
        return;
      }
      void ingestImage(file);
    },
    [ingestImage],
  );

  const startPdfReview = useCallback((file: File) => {
    sourceImageRef.current = null;
    setPages([]);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setCropRect(null);
    setCropping(false);
    setSaveAsPdf(false);
    setDocName("");
    setAutoCorrected(false);
    setShowingOriginal(false);
    correctedDataUrlRef.current = null;
    originalDataUrlRef.current = null;
    setPdfFile(file);
    setStage("edit");
  }, []);

  // Upload an existing file (PDF or image) from the device. Detection uses both
  // the reported MIME type and the filename extension, because Android file
  // pickers frequently report an empty or generic type.
  const handleUploadPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (isPdfFile(file)) {
        startPdfReview(file);
        return;
      }
      if (isImageFile(file)) {
        void ingestImage(file);
        return;
      }
      toast.error("Please choose a PDF or image file.");
    },
    [startPdfReview, ingestImage],
  );

  // Direct entry points, handled once on mount.
  //
  // "camera" (the floating scan button) starts the camera straight away, so the
  // camera is the only thing that path ever shows. "pending" means the user
  // already picked a file from the phone's native picker on the previous screen
  // (the Upload button in the bottom bar opens that picker itself), so we go
  // straight to the review screen with no chooser in between. Anything else
  // (for example "Scan into this vault") opens the two-option chooser.
  useEffect(() => {
    if (autoPickRef.current) return;
    autoPickRef.current = true;
    if (initialPick === "camera") {
      startCamera();
      return;
    }
    if (initialPick === "pending") {
      const file = takePendingUpload();
      if (!file) {
        // No file parked (for example the page was reloaded directly on this
        // URL): fall back to the chooser rather than showing a dead screen.
        setStage("choose");
        return;
      }
      if (isPdfFile(file)) {
        startPdfReview(file);
        return;
      }
      if (isImageFile(file)) {
        void ingestImage(file);
        return;
      }
      toast.error("Please choose a PDF or image file.");
      setStage("choose");
      return;
    }
    autoPickRef.current = false;
  }, [initialPick, startCamera, startPdfReview, ingestImage]);

  useEffect(() => {
    if (stage === "edit" && !cropping && !pdfFile) {
      renderPreview(brightness, contrast, rotation);
    }
  }, [brightness, contrast, rotation, stage, cropping, pdfFile, renderPreview]);

  // --- Crop interaction ---
  const normFromEvent = useCallback((e: React.PointerEvent) => {
    const layer = cropLayerRef.current;
    if (!layer) return { xn: 0, yn: 0 };
    const r = layer.getBoundingClientRect();
    return {
      xn: clamp((e.clientX - r.left) / r.width, 0, 1),
      yn: clamp((e.clientY - r.top) / r.height, 0, 1),
    };
  }, []);

  const startDrag = (mode: "move" | "nw" | "ne" | "sw" | "se") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { xn, yn } = normFromEvent(e);
    dragRef.current = {
      mode,
      startXn: xn,
      startYn: yn,
      startRect: cropRect ?? DEFAULT_CROP,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onCropPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { xn, yn } = normFromEvent(e);
    const dx = xn - d.startXn;
    const dy = yn - d.startYn;
    const MIN = 0.1;
    const s = d.startRect;
    if (d.mode === "move") {
      const x = clamp(s.x + dx, 0, 1 - s.w);
      const y = clamp(s.y + dy, 0, 1 - s.h);
      setCropRect({ x, y, w: s.w, h: s.h });
      return;
    }
    let x1 = s.x;
    let y1 = s.y;
    let x2 = s.x + s.w;
    let y2 = s.y + s.h;
    if (d.mode.includes("w")) x1 = clamp(s.x + dx, 0, x2 - MIN);
    if (d.mode.includes("n")) y1 = clamp(s.y + dy, 0, y2 - MIN);
    if (d.mode.includes("e")) x2 = clamp(x2 + dx, x1 + MIN, 1);
    if (d.mode.includes("s")) y2 = clamp(y2 + dy, y1 + MIN, 1);
    setCropRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  };

  const onCropPointerUp = () => {
    dragRef.current = null;
  };

  const enterCrop = () => {
    setCropRect(DEFAULT_CROP);
    setCropping(true);
  };

  const cancelCrop = () => {
    setCropRect(null);
    setCropping(false);
    setTimeout(() => renderPreview(brightness, contrast, rotation), 20);
  };

  const applyCrop = async () => {
    const img = sourceImageRef.current;
    if (!img || !cropRect) {
      cancelCrop();
      return;
    }
    try {
      const processed = await renderProcessedPage(img, {
        rotation,
        crop: cropRect,
        brightness,
        contrast,
      });
      const newImg = await loadImage(processed.dataUrl);
      sourceImageRef.current = newImg;
      setRotation(0);
      setBrightness(100);
      setContrast(100);
      setCropRect(null);
      setCropping(false);
      // The working image changed, so any previously set thumbnail is stale.
      setThumbBlob(null);
      setThumbUrl(null);
      // Cropping produces a new image, so the auto-straighten badge/undo no
      // longer applies to what is on screen.
      setAutoCorrected(false);
      setShowingOriginal(false);
      correctedDataUrlRef.current = null;
      originalDataUrlRef.current = null;
      setTimeout(() => renderPreview(100, 100, 0), 20);
    } catch (err) {
      toast.error("Could not crop the image.");
    }
  };

  const bakeCurrent = useCallback(async (): Promise<ProcessedPage | null> => {
    const img = sourceImageRef.current;
    if (!img) return null;
    return renderProcessedPage(img, { rotation, crop: null, brightness, contrast });
  }, [rotation, brightness, contrast]);

  // --- Preview thumbnail framing ---
  // Bake the first/current page (with its current rotation and adjustments) and
  // open a dialog where the user pinches, zooms and drags the page under a
  // tile-shaped window to choose the part shown on the vault tile (Build 38).
  const openThumbDialog = useCallback(async () => {
    try {
      setThumbBusy(true);
      const baked = pages[0] ? pages[0] : await bakeCurrent();
      if (!baked) {
        toast.error("Add a page first.");
        return;
      }
      const img = await loadImage(baked.dataUrl);
      thumbSourceRef.current = img;
      setThumbImgUrl(baked.dataUrl);
      setThumbOpen(true);
    } catch (err) {
      toast.error("Could not open the thumbnail tool.");
    } finally {
      setThumbBusy(false);
    }
  }, [pages, bakeCurrent]);

  const applyThumbFrame = async () => {
    const img = thumbSourceRef.current;
    if (!img) return;
    try {
      setThumbBusy(true);
      // Whatever sits inside the tile-shaped window right now, as a fraction of
      // the page. A centered crop is used if the framer is not ready.
      const frame = thumbRectRef.current?.() ?? null;
      const t = await renderThumbnailCover(img, { frame });
      setThumbBlob(t.blob);
      setThumbUrl(t.dataUrl);
      setThumbOpen(false);
      toast.success("Preview thumbnail set.");
    } catch (err) {
      toast.error("Could not set the thumbnail.");
    } finally {
      setThumbBusy(false);
    }
  };

  const useWholePageThumb = async () => {
    const img = thumbSourceRef.current;
    if (!img) return;
    try {
      setThumbBusy(true);
      const t = await renderThumbnailContain(img);
      setThumbBlob(t.blob);
      setThumbUrl(t.dataUrl);
      setThumbOpen(false);
      toast.success("Preview set to the whole page.");
    } catch (err) {
      toast.error("Could not set the thumbnail.");
    } finally {
      setThumbBusy(false);
    }
  };

  const resetWorking = useCallback(() => {
    sourceImageRef.current = null;
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setCropRect(null);
    setCropping(false);
    setThumbBlob(null);
    setThumbUrl(null);
    setAutoCorrected(false);
    setShowingOriginal(false);
    correctedDataUrlRef.current = null;
    originalDataUrlRef.current = null;
  }, []);

  const addPage = async () => {
    const baked = await bakeCurrent();
    if (!baked) {
      toast.error("Nothing to add yet.");
      return;
    }
    setPages((p) => [...p, baked]);
    resetWorking();
    toast.success("Page added.");
    startCamera();
  };

  const removePage = (index: number) => {
    setPages((p) => p.filter((_, i) => i !== index));
  };

  const retake = useCallback(() => {
    resetWorking();
    startCamera();
  }, [resetWorking, startCamera]);

  // Return to the source chooser (used by the file/PDF path).
  const backToChooser = useCallback(() => {
    stopStream();
    setPdfFile(null);
    setPages([]);
    resetWorking();
    setStage("choose");
  }, [stopStream, resetWorking]);
  // Navigate away for good (after a save or a confirmed exit). If the back-
  // gesture guard entry is on the history stack it is stepped off first, so
  // the scanner does not reappear when the user later presses back.
  const leave = useCallback((go: () => void) => {
    allowExitRef.current = true;
    if (!guardPushedRef.current) {
      go();
      return;
    }
    guardPushedRef.current = false;
    leaveRef.current = go;
    window.history.back();
    window.setTimeout(() => {
      const pending = leaveRef.current;
      leaveRef.current = null;
      pending?.();
    }, 400);
  }, []);

  const save = useCallback(async () => {
    if (!folderId) {
      toast.error("Please choose a vault.");
      return;
    }
    setStage("saving");
    try {
      let blob: Blob;
      let mimeType: string;
      let ext: string;
      let name: string;
      // A small JPEG shown on the vault tile. Generated for every scanned
      // document (image or scan-built PDF). Externally uploaded PDFs have no
      // source image, so they keep the generic PDF tile.
      let thumbToUpload: Blob | null = null;

      if (pdfFile) {
        blob = pdfFile;
        mimeType = "application/pdf";
        ext = "pdf";
        name = docName.trim() || pdfFile.name.replace(/\.pdf$/i, "") || "Document";
      } else {
        const baked = await bakeCurrent();
        const allPages = baked ? [...pages, baked] : [...pages];
        if (allPages.length === 0) {
          toast.error("Please add a page first.");
          setStage("edit");
          return;
        }
        const asPdf = allPages.length > 1 || saveAsPdf;
        if (asPdf) {
          blob = buildPdfFromImages(
            allPages.map((p) => ({ dataUrl: p.dataUrl, width: p.width, height: p.height })),
          );
          mimeType = "application/pdf";
          ext = "pdf";
        } else {
          blob = allPages[0].blob;
          mimeType = "image/jpeg";
          ext = "jpg";
        }
        name =
          docName.trim() ||
          `Scan ${new Date().toLocaleDateString("en-US", { timeZone: "UTC" })}`;
        // Use the user's chosen preview if they set one, otherwise fall back to
        // the whole first page letterboxed on a white card (nothing cropped).
        try {
          if (thumbBlob) {
            thumbToUpload = thumbBlob;
          } else {
            const firstImg = await loadImage(allPages[0].dataUrl);
            const t = await renderThumbnailContain(firstImg);
            thumbToUpload = t.blob;
          }
        } catch {
          thumbToUpload = null;
        }
      }

      const safeFileName = `${name.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`;

      const presignRes = await fetch("/api/upload/presigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: safeFileName, contentType: mimeType, fileSize: blob.size }),
      });
      const presign = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok || !presign?.uploadUrl) {
        toast.error(presign?.error ?? "Could not start the upload.");
        setStage("edit");
        return;
      }

      const putRes = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType,
          // Must match the ServerSideEncryption set on the presigned command.
          "x-amz-server-side-encryption": "AES256",
        },
        body: blob,
      });
      if (!putRes.ok) {
        toast.error("Upload failed. Please try again.");
        setStage("edit");
        return;
      }

      // Upload the preview thumbnail (best effort; never blocks the save).
      let thumbnailPath: string | null = null;
      if (thumbToUpload) {
        try {
          const tName = `${name.replace(/[^a-zA-Z0-9._-]/g, "_")}_thumb.jpg`;
          const tPresignRes = await fetch("/api/upload/presigned", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: tName,
              contentType: "image/jpeg",
              fileSize: thumbToUpload.size,
            }),
          });
          const tPresign = await tPresignRes.json().catch(() => ({}));
          if (tPresignRes.ok && tPresign?.uploadUrl) {
            const tPut = await fetch(tPresign.uploadUrl, {
              method: "PUT",
              headers: {
                "Content-Type": "image/jpeg",
                "x-amz-server-side-encryption": "AES256",
              },
              body: thumbToUpload,
            });
            if (tPut.ok) thumbnailPath = tPresign.cloud_storage_path;
          }
        } catch {
          thumbnailPath = null;
        }
      }

      const selectedFolder = folders.find((f) => f.id === folderId);
      const metadata: Record<string, string> = {};
      for (const field of selectedFolder?.fields ?? []) {
        const raw = (metaValues[field.key] ?? "").trim();
        if (raw) metadata[field.key] = raw;
      }

      const metaRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          folderId,
          cloudStoragePath: presign.cloud_storage_path,
          mimeType,
          fileSize: blob.size,
          thumbnailPath,
          metadata,
        }),
      });
      const meta = await metaRes.json().catch(() => ({}));
      if (!metaRes.ok) {
        toast.error(meta?.error ?? "Could not save the document.");
        setStage("edit");
        return;
      }

      toast.success("Document saved.");
      leave(() => router.replace(`/folder/${folderId}`));
    } catch (err) {
      toast.error("Something went wrong while saving.");
      setStage("edit");
    }
  }, [bakeCurrent, docName, folderId, folders, leave, metaValues, pages, router, saveAsPdf, pdfFile, thumbBlob]);

  const close = useCallback(() => {
    stopStream();
    leave(() => router.replace("/home"));
  }, [leave, router, stopStream]);

  // --- Unsaved-scan guard (Build 38) ---
  // Once a page has been captured or a file chosen, leaving by the close
  // button, the browser or system back gesture, or a reload asks first. A
  // native shell closing the whole webview cannot be intercepted by a page.
  const dirty = stage === "edit" || stage === "saving" || pages.length > 0 || !!pdfFile;

  useEffect(() => {
    dirtyRef.current = dirty;
    if (!dirty || guardPushedRef.current || allowExitRef.current) return;
    try {
      // A same-URL history entry for the back gesture to land on.
      window.history.pushState({ ...(window.history.state ?? {}), lockonScanGuard: true }, "");
      guardPushedRef.current = true;
    } catch (err) {
      // History unavailable: the close button still asks.
    }
  }, [dirty]);

  useEffect(() => {
    const onPop = () => {
      const go = leaveRef.current;
      if (go) {
        leaveRef.current = null;
        // The app router handles this same popstate with its own restore. If
        // our listener runs first, navigating now gets discarded by that
        // restore, so wait until the router has finished stepping back.
        window.setTimeout(go, 60);
        return;
      }
      if (!guardPushedRef.current) return;
      guardPushedRef.current = false;
      if (allowExitRef.current || !dirtyRef.current) return;
      try {
        window.history.pushState({ ...(window.history.state ?? {}), lockonScanGuard: true }, "");
        guardPushedRef.current = true;
      } catch (err) {
        // Fall through and still ask.
      }
      pendingExitRef.current = close;
      setExitOpen(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [close]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowExitRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const requestExit = (action: () => void) => {
    if (!dirty) {
      action();
      return;
    }
    pendingExitRef.current = action;
    setExitOpen(true);
  };

  const confirmExit = () => {
    const action = pendingExitRef.current;
    pendingExitRef.current = null;
    setExitOpen(false);
    action?.();
  };

  const totalPages = pages.length + (stage === "edit" || stage === "saving" ? 1 : 0);
  const willBePdf = totalPages > 1 || saveAsPdf;

  // The review details, one question per step (see the details card below).
  const vaultFields = folders.find((f) => f.id === folderId)?.fields ?? [];
  const savingNow = stage === "saving";
  const detailSteps: { key: string; title: string; body: ReactNode }[] = [];
  if (pdfFile) {
    detailSteps.push({
      key: "file",
      title: "Your file",
      body: (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => requestExit(backToChooser)}
          disabled={savingNow}
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Choose a different source
        </Button>
      ),
    });
  } else {
    detailSteps.push({
      key: "page",
      title: "Check the page",
      body: (
        <>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setRotation((r) => r - 90)} disabled={savingNow}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Left
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setRotation((r) => r + 90)} disabled={savingNow}>
              <RotateCw className="mr-1.5 h-4 w-4" /> Right
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={enterCrop} disabled={savingNow}>
              <CropIcon className="mr-1.5 h-4 w-4" /> Crop
            </Button>
          </div>
          {autoCorrected && (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-primary/40 bg-primary/10 px-3 py-2">
              <span className="flex items-center gap-2 text-xs font-medium text-primary">
                <Sparkles className="h-4 w-4 shrink-0" />
                {showingOriginal ? "Showing the original photo" : "Edges detected and straightened"}
              </span>
              {showingOriginal ? (
                <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs text-primary hover:text-primary" onClick={useCorrectedImage} disabled={savingNow}>
                  <ScanLine className="mr-1 h-3.5 w-3.5" /> Use auto-cropped
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs text-primary hover:text-primary" onClick={useOriginalImage} disabled={savingNow}>
                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Use original
                </Button>
              )}
            </div>
          )}
          {pages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Pages in this document ({pages.length + 1})</Label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {pages.map((p, i) => (
                  <div key={i} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.dataUrl} alt={`Page ${i + 1}`} className="h-16 w-12 rounded border border-border object-cover" />
                    <button
                      type="button"
                      onClick={() => removePage(i)}
                      disabled={savingNow}
                      aria-label={`Remove page ${i + 1}`}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <div className="flex h-16 w-12 shrink-0 items-center justify-center rounded border border-dashed border-primary text-primary">
                  <span className="text-[10px] font-medium">Now</span>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={retake} disabled={savingNow}>
              <RotateCcw className="mr-2 h-4 w-4" /> Retake
            </Button>
            <Button variant="outline" onClick={addPage} disabled={savingNow}>
              <Plus className="mr-2 h-4 w-4" /> Add page
            </Button>
          </div>
        </>
      ),
    });
  }
  detailSteps.push({
    key: "vault",
    title: "Which vault?",
    body: (
      <Select value={folderId} onValueChange={setFolderId} disabled={savingNow}>
        <SelectTrigger aria-label="Vault">
          <SelectValue placeholder="Choose a vault" />
        </SelectTrigger>
        <SelectContent>
          {(folders ?? []).map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
  });
  detailSteps.push({
    key: "name",
    title: "Name this document",
    body: (
      <Input
        id="docName"
        aria-label="Document name"
        value={docName}
        onChange={(e) => setDocName(e.target.value)}
        placeholder="e.g. Passport"
        disabled={savingNow}
      />
    ),
  });
  vaultFields.forEach((field) => {
    detailSteps.push({
      key: `field-${field.key}`,
      title: field.label,
      body:
        field.type === "select" ? (
          <Select
            value={metaValues[field.key] ?? ""}
            onValueChange={(v) => setMetaValues((prev) => ({ ...prev, [field.key]: v }))}
            disabled={savingNow}
          >
            <SelectTrigger aria-label={field.label}>
              <SelectValue placeholder={`Choose ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <>
            <Input
              aria-label={field.label}
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={metaValues[field.key] ?? ""}
              onChange={(e) => setMetaValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.type === "text" ? field.label : undefined}
              disabled={savingNow}
            />
            <p className="text-xs text-muted-foreground">Optional. Leave blank and tap Next to skip.</p>
          </>
        ),
    });
  });
  if (!pdfFile) {
    detailSteps.push({
      key: "look",
      title: "Brightness and contrast",
      body: (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Sun className="h-4 w-4" /> Brightness
              </Label>
              <span className="font-mono text-xs text-muted-foreground">{brightness}%</span>
            </div>
            <Slider value={[brightness]} min={50} max={150} step={1} onValueChange={(v) => setBrightness(v?.[0] ?? 100)} disabled={savingNow} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Contrast className="h-4 w-4" /> Contrast
              </Label>
              <span className="font-mono text-xs text-muted-foreground">{contrast}%</span>
            </div>
            <Slider value={[contrast]} min={50} max={150} step={1} onValueChange={(v) => setContrast(v?.[0] ?? 100)} disabled={savingNow} />
          </div>
        </>
      ),
    });
    detailSteps.push({
      key: "finish",
      title: "Save options",
      body: (
        <>
          <button
            type="button"
            disabled={totalPages > 1 || savingNow}
            onClick={() => setSaveAsPdf((v) => !v)}
            className="flex w-full items-center justify-between rounded-[var(--radius)] border border-border px-3 py-2.5 text-left disabled:opacity-70"
          >
            <span className="text-sm">
              Save as PDF
              {totalPages > 1 && <span className="ml-1 text-xs text-muted-foreground">(multi-page)</span>}
            </span>
            <span className={`flex h-5 w-9 items-center rounded-full px-0.5 transition ${willBePdf ? "justify-end bg-primary" : "justify-start bg-muted"}`}>
              <span className="h-4 w-4 rounded-full bg-white shadow" />
            </span>
          </button>
          <div className="flex items-center justify-between rounded-[var(--radius)] border border-border px-3 py-2.5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-9 items-center justify-center overflow-hidden rounded border border-border bg-muted">
                {thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbUrl} alt="Preview thumbnail" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm">Preview thumbnail</p>
                <p className="text-xs text-muted-foreground">{thumbUrl ? "Custom preview set" : "Whole page used by default"}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={openThumbDialog}
              disabled={savingNow || thumbBusy}
              className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
            >
              {thumbUrl ? "Change" : "Set preview thumbnail"}
            </button>
          </div>
        </>
      ),
    });
  }
  const stepIndex = Math.min(detailStep, Math.max(0, detailSteps.length - 1));
  const currentStep = detailSteps[stepIndex];
  const isLastStep = stepIndex === detailSteps.length - 1;
  const goNextStep = () => {
    if (currentStep?.key === "vault" && !folderId) {
      toast.error("Please choose a vault.");
      return;
    }
    if (!isLastStep) setDetailStep(stepIndex + 1);
  };

  const topTitle =
    stage === "choose"
      ? "Add a document"
      : stage === "edit" || stage === "saving"
        ? pdfFile
          ? "Review file"
          : cropping
            ? "Crop"
            : "Review scan"
        : "Scan document";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Top bar */}
      <div className="safe-top flex items-center justify-between px-4 py-3">
        <button
          type="button"
          onClick={() => requestExit(close)}
          aria-label="Close scanner"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white active:scale-95 no-select"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-medium text-white/90">{topTitle}</p>
        <div className="flex h-10 min-w-10 items-center justify-center">
          {pages.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white">
              <Files className="h-3.5 w-3.5" /> {pages.length}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        {stage === "choose" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-xs space-y-3">
              <p className="mb-2 text-center text-sm text-white/70">
                How would you like to add your document?
              </p>
              <button
                type="button"
                onClick={startCamera}
                className="flex w-full items-center gap-4 rounded-[var(--radius-lg)] bg-white/10 px-5 py-4 text-left text-white active:scale-[0.98] no-select"
              >
                <span className="gold-surface flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-primary-foreground">
                  <Camera className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-base font-semibold">Scan with camera</span>
                  <span className="block text-xs text-white/60">Capture a document with your camera</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="flex w-full items-center gap-4 rounded-[var(--radius-lg)] bg-white/10 px-5 py-4 text-left text-white active:scale-[0.98] no-select"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
                  <FileUp className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-base font-semibold">Upload a file or photo</span>
                  <span className="block text-xs text-white/60">Choose a PDF or photo from your files or gallery</span>
                </span>
              </button>
            </div>
          </div>
        )}

        {(stage === "loading" || stage === "camera") && (
          <div className="absolute inset-0">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="h-full w-full object-cover"
            />
            {/* Manual framing guide, only with automatic detection switched
                off. Shaped like a page rather than a square box, so it reads as
                "put the document here". */}
            {stage === "camera" && !autoDetect && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                <div className="aspect-[1/1.414] h-[68%] max-w-[80%] rounded-[var(--radius-lg)] border-2 border-white/70" />
              </div>
            )}
            {/* Searching state. With automatic detection on there is no box at
                all: just breathing corner brackets at page proportions and a
                line sweeping the area. Both vanish the instant real edges are
                found and the live outline takes over. */}
            {stage === "camera" && autoDetect && !overlay && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
                <div className="relative aspect-[1/1.414] h-[68%] max-w-[80%] overflow-hidden">
                  <span className="scan-breathe absolute left-0 top-0 h-10 w-10 rounded-tl-[var(--radius-lg)] border-l-[3px] border-t-[3px] border-primary" />
                  <span className="scan-breathe absolute right-0 top-0 h-10 w-10 rounded-tr-[var(--radius-lg)] border-r-[3px] border-t-[3px] border-primary" />
                  <span className="scan-breathe absolute bottom-0 left-0 h-10 w-10 rounded-bl-[var(--radius-lg)] border-b-[3px] border-l-[3px] border-primary" />
                  <span className="scan-breathe absolute bottom-0 right-0 h-10 w-10 rounded-br-[var(--radius-lg)] border-b-[3px] border-r-[3px] border-primary" />
                  <span className="scan-sweep absolute inset-x-3 h-0.5 rounded-full bg-primary/80" />
                </div>
              </div>
            )}
            {/* Live detected document edges. Gold and filled once the framing
                is good, so the user can see it is about to auto-capture. */}
            {stage === "camera" && autoDetect && overlay && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                <polygon
                  points={overlay.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  className={
                    overlay.good
                      ? "fill-primary/20 stroke-primary"
                      : "fill-white/5 stroke-white/80"
                  }
                  strokeWidth={3}
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {/* Detection hint pill, with a hold progress bar so the countdown to
                an automatic capture is visible rather than a surprise. */}
            {stage === "camera" && autoDetect && (
              <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-6">
                <span className="flex flex-col items-center gap-1.5 rounded-full bg-black/55 px-4 py-1.5 text-center text-xs font-medium text-white backdrop-blur">
                  <span>
                    {struggling
                      ? "Hold steady, move back if blurry, or tap the shutter"
                      : overlay?.good
                        ? "Document found, hold steady..."
                        : overlay
                          ? "Line up the whole document"
                          : "Searching for document edges..."}
                  </span>
                  {overlay && overlay.progress > 0 && (
                    <span className="block h-1 w-24 overflow-hidden rounded-full bg-white/25">
                      <span
                        className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                        style={{ width: `${Math.round(overlay.progress * 100)}%` }}
                      />
                    </span>
                  )}
                </span>
              </div>
            )}
            {stage === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
            {/* Field diagnostics, only with ?debug=1 on the scan URL. Shows how
                fast this device is actually detecting and why a hold ended, so
                a slow device can be told apart from a shaky hand. */}
            {stage === "camera" && debug && diag && (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded bg-black/70 px-2 py-1.5 font-mono text-[10px] leading-tight text-white">
                <div>
                  video {diag.video} / detect {diag.detect}
                </div>
                <div>
                  det {diag.rate.toFixed(1)}/s, {diag.avgMs.toFixed(0)}ms avg, found{" "}
                  {diag.foundPct.toFixed(0)}%
                </div>
                <div>
                  frames {diag.frames}/6, drift{" "}
                  {diag.drift < 0 ? "n/a" : diag.drift.toFixed(3)}, total{" "}
                  {diag.totalDrift < 0 ? "n/a" : diag.totalDrift.toFixed(3)}
                </div>
                <div>
                  reason {diag.reason}, breaks {diag.breaks}
                </div>
                <div className="max-w-[220px] truncate">cam {diag.cam}</div>
              </div>
            )}
            {/* Capture confirmation. A white shutter flash and a tick over the
                frozen frame, so an automatic scan is clearly felt to land
                before the details step opens. */}
            {captureFlash && (
              <div className="absolute inset-0 z-20">
                <img
                  src={captureFlash}
                  alt="Captured document"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 px-8 text-center">
                  <span className="gold-surface flex h-16 w-16 items-center justify-center rounded-full text-primary-foreground">
                    <Check className="h-8 w-8" />
                  </span>
                  <span className="font-display text-lg font-semibold text-white">
                    Scan captured
                  </span>
                  <span className="text-xs text-white/70">
                    Preparing your document...
                  </span>
                </div>
                <div
                  className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-500 ${
                    flashOn ? "opacity-100" : "opacity-0"
                  }`}
                />
              </div>
            )}
          </div>
        )}

        {stage === "nocamera" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/15">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <p className="mb-1 font-display text-lg font-semibold">Camera unavailable</p>
            <p className="mb-6 max-w-xs text-sm text-white/70">
              We could not access your camera. You can upload a file of your document instead.
            </p>
            <Button onClick={() => uploadInputRef.current?.click()} size="lg">
              <FileUp className="mr-2 h-5 w-5" /> Upload a file
            </Button>
            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={startCamera}
                className="text-sm text-white/70 underline"
              >
                Try the camera again
              </button>
              <button
                type="button"
                onClick={() => setStage("choose")}
                className="text-sm text-white/70 underline"
              >
                Back to options
              </button>
            </div>
          </div>
        )}

        {(stage === "edit" || stage === "saving") && (
          <div className="absolute inset-0 flex items-center justify-center bg-black p-3">
            {pdfFile ? (
              <div className="flex flex-col items-center text-center text-white">
                <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-[var(--radius-lg)] bg-white/10">
                  <FileText className="h-12 w-12 text-white/80" />
                </div>
                <p className="max-w-[16rem] break-words text-sm font-medium text-white/90">
                  {pdfFile.name}
                </p>
                <p className="mt-1 text-xs text-white/50">PDF ready to save</p>
              </div>
            ) : (
              <div className="relative inline-block max-h-full max-w-full">
                <canvas
                  ref={previewCanvasRef}
                  className="block max-h-full max-w-full rounded-[var(--radius)] object-contain"
                />
                {cropping && cropRect && (
                  <div
                    ref={cropLayerRef}
                    className="absolute inset-0 touch-none"
                    onPointerMove={onCropPointerMove}
                    onPointerUp={onCropPointerUp}
                    onPointerLeave={onCropPointerUp}
                  >
                    <div
                      className="absolute border-2 border-primary"
                      style={{
                        left: `${cropRect.x * 100}%`,
                        top: `${cropRect.y * 100}%`,
                        width: `${cropRect.w * 100}%`,
                        height: `${cropRect.h * 100}%`,
                        boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                        touchAction: "none",
                      }}
                      onPointerDown={startDrag("move")}
                    >
                      {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                        <span
                          key={corner}
                          onPointerDown={startDrag(corner)}
                          className="absolute h-6 w-6 rounded-full border-2 border-primary bg-white/90"
                          style={{
                            left: corner.includes("w") ? -12 : undefined,
                            right: corner.includes("e") ? -12 : undefined,
                            top: corner.includes("n") ? -12 : undefined,
                            bottom: corner.includes("s") ? -12 : undefined,
                            touchAction: "none",
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Camera controls */}
      {stage === "camera" && (
        <div className="safe-bottom flex items-center justify-center gap-10 bg-black px-6 pb-8 pt-5">
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            aria-label="Choose from gallery"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white active:scale-95 no-select"
          >
            <Images className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={capture}
            aria-label="Capture"
            className="flex items-center justify-center rounded-full bg-white p-1 active:scale-95 no-select"
            style={{ height: 72, width: 72 }}
          >
            <span className="flex h-full w-full items-center justify-center rounded-full border-4 border-black/80">
              <Camera className="h-6 w-6 text-black" />
            </span>
          </button>
          {/*
            Auto-detect toggle. When on, the app watches the live feed for a
            document, draws its edges, and captures automatically once the
            framing is good. Turning it off gives a plain manual shutter.
          */}
          <button
            type="button"
            onClick={() => setAutoDetect((v) => !v)}
            aria-label={autoDetect ? "Turn off auto detect" : "Turn on auto detect"}
            aria-pressed={autoDetect}
            className={`flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-full active:scale-95 no-select ${
              autoDetect ? "gold-surface text-primary-foreground" : "bg-white/15 text-white"
            }`}
          >
            <ScanLine className="h-5 w-5" />
            <span className="text-[10px] font-semibold leading-none">
              {autoDetect ? "Auto" : "Off"}
            </span>
          </button>
        </div>
      )}

      {/* Crop action bar */}
      {stage === "edit" && cropping && (
        <div className="safe-bottom flex items-center justify-between gap-3 bg-card px-5 pb-6 pt-4">
          <Button variant="outline" className="flex-1" onClick={cancelCrop}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={applyCrop}>
            <Check className="mr-2 h-4 w-4" /> Apply crop
          </Button>
        </div>
      )}

      {/* Details card: one question per step with Back and Next, kept short so
          the scan above stays in view. The last step's button saves. */}
      {(stage === "edit" || stage === "saving") && !cropping && currentStep && (
        <div className="relative z-10 shrink-0 rounded-t-[var(--radius-lg)] bg-card px-5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-4 shadow-[0_-6px_16px_rgba(0,0,0,0.25)]">
          <div className="mb-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="truncate text-base font-semibold text-foreground">{currentStep.title}</h2>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                Step {stepIndex + 1} of {detailSteps.length}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="gold-surface h-full rounded-full transition-all duration-300"
                style={{ width: `${((stepIndex + 1) / detailSteps.length) * 100}%` }}
              />
            </div>
          </div>
          <div
            key={currentStep.key}
            className="max-h-[34vh] min-h-[4.5rem] space-y-3 overflow-y-auto overscroll-contain px-0.5 py-1.5"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
                e.preventDefault();
                goNextStep();
              }
            }}
          >
            {currentStep.body}
          </div>
          <div className="mt-4 grid grid-cols-[auto_1fr] gap-3">
            <Button
              variant="outline"
              className="h-12 px-4"
              onClick={() => setDetailStep(Math.max(0, stepIndex - 1))}
              disabled={stepIndex === 0 || stage === "saving"}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {isLastStep ? (
              <button
                type="button"
                onClick={save}
                disabled={stage === "saving"}
                className="gold-surface flex h-12 w-full items-center justify-center rounded-[var(--radius)] text-base font-semibold text-primary-foreground shadow-md transition active:scale-[0.99] disabled:opacity-70 no-select"
              >
                {stage === "saving" ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-5 w-5" /> Save document
                  </>
                )}
              </button>
            ) : (
              <Button className="h-12" onClick={goNextStep} disabled={stage === "saving"}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {preparing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 text-white">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="mt-3 text-sm text-white/80">Preparing your photo...</p>
        </div>
      )}

      {/* Preview thumbnail framing dialog */}
      <Dialog open={thumbOpen} onOpenChange={(o) => !thumbBusy && setThumbOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set preview thumbnail</DialogTitle>
            <DialogDescription>
              Pinch to zoom and drag to choose the part of the document shown on
              its vault tile.
            </DialogDescription>
          </DialogHeader>

          {thumbImgUrl && (
            <ThumbFramer src={thumbImgUrl} rectRef={thumbRectRef} resetRef={thumbResetRef} />
          )}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => thumbResetRef.current?.()}
              disabled={thumbBusy}
              className="text-xs text-muted-foreground underline"
            >
              Reset framing
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button variant="outline" onClick={useWholePageThumb} disabled={thumbBusy}>
              Use whole page
            </Button>
            <Button onClick={applyThumbFrame} disabled={thumbBusy}>
              {thumbBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set thumbnail"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leaving with an unsaved scan */}
      <AlertDialog
        open={exitOpen}
        onOpenChange={(o) => {
          if (!o) {
            setExitOpen(false);
            pendingExitRef.current = null;
          }
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to exit?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved changes will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmExit}
            >
              Exit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/*
        Accept lists are plain MIME types with no bare file extensions. On
        Android, a bare extension (such as .heic) that the system cannot map to
        a MIME type makes the browser fall back to a generic "any file" chooser,
        which is what hid the photo gallery. Image-only accept is what makes
        Android offer the gallery; HEIC photos still come through because the
        system reports them as an image type, and they are converted after
        selection.
      */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleGalleryPick}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleUploadPick}
      />
    </div>
  );
}
