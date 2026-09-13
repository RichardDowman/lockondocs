"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  centeredFrame,
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
import { takePendingUpload } from "@/lib/pending-upload";
import type { FieldDef } from "@/lib/vault-fields";

interface FolderItem {
  id: string;
  name: string;
  fields: FieldDef[];
}

type Stage = "choose" | "loading" | "camera" | "nocamera" | "edit" | "saving";

// Start the crop box at the full frame so an upload is never trimmed until the
// user actively drags the handles inward.
const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

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
  const thumbLayerRef = useRef<HTMLDivElement | null>(null);
  const thumbSourceRef = useRef<HTMLImageElement | null>(null);
  const thumbDragRef = useRef<{ startXn: number; startYn: number; startRect: CropRect } | null>(null);
  const dragRef = useRef<
    | { mode: "move" | "nw" | "ne" | "sw" | "se"; startXn: number; startYn: number; startRect: CropRect }
    | null
  >(null);

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
  const [thumbFrame, setThumbFrame] = useState<CropRect | null>(null);
  const [thumbSize, setThumbSize] = useState(1);
  const [thumbBusy, setThumbBusy] = useState(false);
  // The image shown inside the framing dialog. The overlay layer wraps the
  // rendered <img> (inline-block) so the frame lines up exactly.
  const [thumbImgUrl, setThumbImgUrl] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setStage("loading");
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setStage("nocamera");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
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

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      toast.error("Camera is not ready yet.");
      return;
    }
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = tmp.toDataURL("image/jpeg", 0.92);
    stopStream();
    loadSourceFromDataUrl(dataUrl);
  }, [loadSourceFromDataUrl, stopStream]);

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
            quality: 0.92,
          });
          source = Array.isArray(converted) ? converted[0] : (converted as Blob);
        }
        const dataUrl = await blobToDataUrl(source);
        loadSourceFromDataUrl(dataUrl);
      } catch (err) {
        toast.error("Could not read that photo. Please try a different one.");
      } finally {
        setPreparing(false);
      }
    },
    [loadSourceFromDataUrl],
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
  // open a dialog where the user drags a portrait frame to choose the part of
  // the document shown on the vault tile.
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
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      setThumbImgUrl(baked.dataUrl);
      setThumbSize(1);
      setThumbFrame(centeredFrame(w, h, undefined, 1));
      setThumbOpen(true);
    } catch (err) {
      toast.error("Could not open the thumbnail tool.");
    } finally {
      setThumbBusy(false);
    }
  }, [pages, bakeCurrent]);

  const thumbNormFromEvent = useCallback((e: React.PointerEvent) => {
    const layer = thumbLayerRef.current;
    if (!layer) return { xn: 0, yn: 0 };
    const r = layer.getBoundingClientRect();
    return {
      xn: clamp((e.clientX - r.left) / r.width, 0, 1),
      yn: clamp((e.clientY - r.top) / r.height, 0, 1),
    };
  }, []);

  const startThumbDrag = (e: React.PointerEvent) => {
    if (!thumbFrame) return;
    e.preventDefault();
    e.stopPropagation();
    const { xn, yn } = thumbNormFromEvent(e);
    thumbDragRef.current = { startXn: xn, startYn: yn, startRect: thumbFrame };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onThumbPointerMove = (e: React.PointerEvent) => {
    const d = thumbDragRef.current;
    if (!d) return;
    const { xn, yn } = thumbNormFromEvent(e);
    const s = d.startRect;
    const x = clamp(s.x + (xn - d.startXn), 0, 1 - s.w);
    const y = clamp(s.y + (yn - d.startYn), 0, 1 - s.h);
    setThumbFrame({ x, y, w: s.w, h: s.h });
  };

  const onThumbPointerUp = () => {
    thumbDragRef.current = null;
  };

  const onThumbSizeChange = (val: number) => {
    setThumbSize(val);
    const img = thumbSourceRef.current;
    if (!img) return;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const base = centeredFrame(w, h, undefined, val);
    setThumbFrame((prev) => {
      if (!prev) return base;
      // Keep the frame centred on its current middle while resizing.
      const cx = prev.x + prev.w / 2;
      const cy = prev.y + prev.h / 2;
      const x = clamp(cx - base.w / 2, 0, 1 - base.w);
      const y = clamp(cy - base.h / 2, 0, 1 - base.h);
      return { x, y, w: base.w, h: base.h };
    });
  };

  const applyThumbFrame = async () => {
    const img = thumbSourceRef.current;
    if (!img || !thumbFrame) return;
    try {
      setThumbBusy(true);
      const t = await renderThumbnailCover(img, { frame: thumbFrame });
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
          `Scan ${new Date().toLocaleDateString("en-GB", { timeZone: "UTC" })}`;
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
      router.replace(`/folder/${folderId}`);
    } catch (err) {
      toast.error("Something went wrong while saving.");
      setStage("edit");
    }
  }, [bakeCurrent, docName, folderId, folders, metaValues, pages, router, saveAsPdf, pdfFile, thumbBlob]);

  const close = useCallback(() => {
    stopStream();
    router.replace("/home");
  }, [router, stopStream]);

  const totalPages = pages.length + (stage === "edit" || stage === "saving" ? 1 : 0);
  const willBePdf = totalPages > 1 || saveAsPdf;

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
          onClick={close}
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
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
              <div className="h-full max-h-[70%] w-full rounded-[var(--radius-lg)] border-2 border-white/70" />
            </div>
            {stage === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
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
            Balances the gallery shortcut on the left. There is deliberately no
            second close control here: the only way out of the camera is the X
            in the top bar, which closes straight back to the vaults screen in
            one tap.
          */}
          <div className="h-12 w-12" aria-hidden="true" />
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

      {/* Edit controls */}
      {(stage === "edit" || stage === "saving") && !cropping && (
        <div className="safe-bottom max-h-[56%] overflow-y-auto rounded-t-[var(--radius-lg)] bg-card px-5 pb-6 pt-5">
          <div className="space-y-4">
            {!pdfFile && (
              <>
                {/* Transform tools */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setRotation((r) => r - 90)}
                    disabled={stage === "saving"}
                  >
                    <RotateCcw className="mr-1.5 h-4 w-4" /> Left
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setRotation((r) => r + 90)}
                    disabled={stage === "saving"}
                  >
                    <RotateCw className="mr-1.5 h-4 w-4" /> Right
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={enterCrop}
                    disabled={stage === "saving"}
                  >
                    <CropIcon className="mr-1.5 h-4 w-4" /> Crop
                  </Button>
                </div>

                {/* Added pages strip */}
                {pages.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Pages in this document ({pages.length + 1})
                    </Label>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {pages.map((p, i) => (
                        <div key={i} className="relative shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.dataUrl}
                            alt={`Page ${i + 1}`}
                            className="h-16 w-12 rounded border border-border object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removePage(i)}
                            disabled={stage === "saving"}
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
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="docName">Document name</Label>
              <Input
                id="docName"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="e.g. Passport"
                disabled={stage === "saving"}
              />
            </div>

            <div className="space-y-2">
              <Label>Vault</Label>
              <Select value={folderId} onValueChange={setFolderId} disabled={stage === "saving"}>
                <SelectTrigger>
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
            </div>

            {(folders.find((f) => f.id === folderId)?.fields ?? []).map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                {field.type === "select" ? (
                  <Select
                    value={metaValues[field.key] ?? ""}
                    onValueChange={(v) => setMetaValues((prev) => ({ ...prev, [field.key]: v }))}
                    disabled={stage === "saving"}
                  >
                    <SelectTrigger>
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
                  <Input
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    value={metaValues[field.key] ?? ""}
                    onChange={(e) =>
                      setMetaValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                    }
                    placeholder={field.type === "text" ? field.label : undefined}
                    disabled={stage === "saving"}
                  />
                )}
              </div>
            ))}

            {!pdfFile && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Sun className="h-4 w-4" /> Brightness
                    </Label>
                    <span className="font-mono text-xs text-muted-foreground">{brightness}%</span>
                  </div>
                  <Slider
                    value={[brightness]}
                    min={50}
                    max={150}
                    step={1}
                    onValueChange={(v) => setBrightness(v?.[0] ?? 100)}
                    disabled={stage === "saving"}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5">
                      <Contrast className="h-4 w-4" /> Contrast
                    </Label>
                    <span className="font-mono text-xs text-muted-foreground">{contrast}%</span>
                  </div>
                  <Slider
                    value={[contrast]}
                    min={50}
                    max={150}
                    step={1}
                    onValueChange={(v) => setContrast(v?.[0] ?? 100)}
                    disabled={stage === "saving"}
                  />
                </div>

                {/* Save format */}
                <button
                  type="button"
                  disabled={totalPages > 1 || stage === "saving"}
                  onClick={() => setSaveAsPdf((v) => !v)}
                  className="flex w-full items-center justify-between rounded-[var(--radius)] border border-border px-3 py-2.5 text-left disabled:opacity-70"
                >
                  <span className="text-sm">
                    Save as PDF
                    {totalPages > 1 && (
                      <span className="ml-1 text-xs text-muted-foreground">(multi-page)</span>
                    )}
                  </span>
                  <span
                    className={`flex h-5 w-9 items-center rounded-full px-0.5 transition ${
                      willBePdf ? "justify-end bg-primary" : "justify-start bg-muted"
                    }`}
                  >
                    <span className="h-4 w-4 rounded-full bg-white shadow" />
                  </span>
                </button>

                {/* Preview thumbnail chooser */}
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
                      <p className="text-xs text-muted-foreground">
                        {thumbUrl ? "Custom preview set" : "Whole page used by default"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openThumbDialog}
                    disabled={stage === "saving" || thumbBusy}
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    {thumbUrl ? "Change" : "Set preview thumbnail"}
                  </button>
                </div>
              </>
            )}

            {pdfFile ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={backToChooser}
                disabled={stage === "saving"}
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Choose a different source
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Button variant="outline" onClick={retake} disabled={stage === "saving"}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Retake
                </Button>
                <Button variant="outline" onClick={addPage} disabled={stage === "saving"}>
                  <Plus className="mr-2 h-4 w-4" /> Add page
                </Button>
              </div>
            )}
            <Button className="w-full" size="lg" onClick={save} disabled={stage === "saving"}>
              {stage === "saving" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" /> Save document
                </>
              )}
            </Button>
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
              Drag the frame to choose the part of the document shown on its vault
              tile. Use the slider to change how much is included.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-center">
            <div className="relative inline-block">
              {thumbImgUrl && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbImgUrl}
                    alt="Document to frame"
                    className="block max-h-[50vh] max-w-full rounded-[var(--radius)]"
                  />
                  <div
                    ref={thumbLayerRef}
                    className="absolute inset-0 touch-none"
                    onPointerMove={onThumbPointerMove}
                    onPointerUp={onThumbPointerUp}
                    onPointerLeave={onThumbPointerUp}
                  >
                    {thumbFrame && (
                      <div
                        className="absolute border-2 border-primary"
                        style={{
                          left: `${thumbFrame.x * 100}%`,
                          top: `${thumbFrame.y * 100}%`,
                          width: `${thumbFrame.w * 100}%`,
                          height: `${thumbFrame.h * 100}%`,
                          boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                          touchAction: "none",
                        }}
                        onPointerDown={startThumbDrag}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Frame size</Label>
              <span className="font-mono text-xs text-muted-foreground">
                {Math.round(thumbSize * 100)}%
              </span>
            </div>
            <Slider
              value={[thumbSize]}
              min={0.3}
              max={1}
              step={0.05}
              onValueChange={(v) => onThumbSizeChange(v?.[0] ?? 1)}
              disabled={thumbBusy}
            />
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
