import { jsPDF } from "jspdf";

export interface CropRect {
  // Normalised (0..1) relative to the rotated image.
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageEdit {
  rotation: number; // degrees: 0, 90, 180, 270
  crop: CropRect | null;
  brightness: number; // percent
  contrast: number; // percent
}

export interface ProcessedPage {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

/**
 * Applies rotation, filters and crop to a source image and returns a JPEG.
 */
export async function renderProcessedPage(
  img: HTMLImageElement,
  edit: PageEdit,
  quality = 0.9,
): Promise<ProcessedPage> {
  const rot = (((edit.rotation ?? 0) % 360) + 360) % 360;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const swap = rot === 90 || rot === 270;
  const rotated = document.createElement("canvas");
  rotated.width = swap ? ih : iw;
  rotated.height = swap ? iw : ih;
  const rctx = rotated.getContext("2d");
  if (!rctx) throw new Error("Canvas not supported");
  rctx.filter = `brightness(${edit.brightness}%) contrast(${edit.contrast}%)`;
  rctx.translate(rotated.width / 2, rotated.height / 2);
  rctx.rotate((rot * Math.PI) / 180);
  rctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);

  let out: HTMLCanvasElement = rotated;
  if (edit.crop) {
    const cx = Math.max(0, Math.round(edit.crop.x * rotated.width));
    const cy = Math.max(0, Math.round(edit.crop.y * rotated.height));
    const cw = Math.min(rotated.width - cx, Math.round(edit.crop.w * rotated.width));
    const ch = Math.min(rotated.height - cy, Math.round(edit.crop.h * rotated.height));
    if (cw > 16 && ch > 16) {
      const cropped = document.createElement("canvas");
      cropped.width = cw;
      cropped.height = ch;
      const cctx = cropped.getContext("2d");
      if (!cctx) throw new Error("Canvas not supported");
      cctx.drawImage(rotated, cx, cy, cw, ch, 0, 0, cw, ch);
      out = cropped;
    }
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not encode image");
  const dataUrl = out.toDataURL("image/jpeg", quality);
  return { dataUrl, blob, width: out.width, height: out.height };
}

/**
 * Combines one or more images into a single PDF (A4, one image per page).
 */
export function buildPdfFromImages(
  pages: { dataUrl: string; width: number; height: number }[],
): Blob {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  pages.forEach((im, i) => {
    if (i > 0) pdf.addPage();
    const ratio = Math.min(maxW / im.width, maxH / im.height);
    const w = im.width * ratio;
    const h = im.height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(im.dataUrl, "JPEG", x, y, w, h, undefined, "FAST");
  });

  return pdf.output("blob");
}

// ---------------------------------------------------------------------------
// Preview thumbnails
//
// The vault grid shows each document as a tile with a fixed portrait aspect
// ratio. Rather than CSS-cropping the full document (which squashes or trims
// landscape scans and cannot preview a PDF at all), we bake a small dedicated
// thumbnail JPEG at save time and store it alongside the document. Two framing
// modes are offered: "contain" keeps the whole page visible on a white card
// (nothing is ever cut off), and "cover" fills the tile from a user-chosen
// region of the page.
// ---------------------------------------------------------------------------

// Portrait tile ratio (width / height) used by the vault grid cards.
export const THUMB_ASPECT = 3 / 4;

export interface Thumbnail {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

// Whole page, letterboxed onto a white card of the target aspect ratio. Nothing
// is trimmed, so a landscape document is shown in full with padding above and
// below.
export async function renderThumbnailContain(
  img: HTMLImageElement,
  opts?: { aspect?: number; maxWidth?: number; quality?: number },
): Promise<Thumbnail> {
  const aspect = opts?.aspect ?? THUMB_ASPECT;
  const maxW = opts?.maxWidth ?? 600;
  const quality = opts?.quality ?? 0.82;
  const outW = maxW;
  const outH = Math.round(outW / aspect);

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);

  const ratio = Math.min(outW / iw, outH / ih);
  const w = Math.round(iw * ratio);
  const h = Math.round(ih * ratio);
  const x = Math.round((outW - w) / 2);
  const y = Math.round((outH - h) / 2);
  ctx.drawImage(img, x, y, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not encode thumbnail");
  return { blob, dataUrl: canvas.toDataURL("image/jpeg", quality), width: outW, height: outH };
}

// Fill the tile from a chosen region of the page. `frame` is a normalized rect
// (0..1) describing which part of the source image to keep; when omitted a
// centered, maximum-area region matching the target aspect is used.
export async function renderThumbnailCover(
  img: HTMLImageElement,
  opts?: { frame?: CropRect | null; aspect?: number; maxWidth?: number; quality?: number },
): Promise<Thumbnail> {
  const aspect = opts?.aspect ?? THUMB_ASPECT;
  const maxW = opts?.maxWidth ?? 600;
  const quality = opts?.quality ?? 0.82;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;
  const frame = opts?.frame ?? null;
  if (frame) {
    sx = Math.round(frame.x * iw);
    sy = Math.round(frame.y * ih);
    sw = Math.round(frame.w * iw);
    sh = Math.round(frame.h * ih);
  } else if (iw / ih > aspect) {
    sh = ih;
    sw = Math.round(ih * aspect);
    sx = Math.round((iw - sw) / 2);
    sy = 0;
  } else {
    sw = iw;
    sh = Math.round(iw / aspect);
    sx = 0;
    sy = Math.round((ih - sh) / 2);
  }
  sx = Math.max(0, Math.min(sx, iw - 1));
  sy = Math.max(0, Math.min(sy, ih - 1));
  sw = Math.max(1, Math.min(sw, iw - sx));
  sh = Math.max(1, Math.min(sh, ih - sy));

  const outW = Math.min(maxW, sw);
  const outH = Math.round(outW / aspect);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
  );
  if (!blob) throw new Error("Could not encode thumbnail");
  return { blob, dataUrl: canvas.toDataURL("image/jpeg", quality), width: outW, height: outH };
}

// Centered, maximum-area region matching `aspect`, scaled by `size` (0..1) and
// expressed as a normalized rect. Used to seed and resize the framing overlay.
export function centeredFrame(
  imgWidth: number,
  imgHeight: number,
  aspect = THUMB_ASPECT,
  size = 1,
): CropRect {
  let wN: number;
  let hN: number;
  if (imgWidth / imgHeight > aspect) {
    hN = 1;
    wN = (imgHeight * aspect) / imgWidth;
  } else {
    wN = 1;
    hN = imgWidth / aspect / imgHeight;
  }
  const s = Math.max(0.2, Math.min(1, size));
  wN = Math.min(1, wN * s);
  hN = Math.min(1, hN * s);
  return { x: (1 - wN) / 2, y: (1 - hN) / 2, w: wN, h: hN };
}
