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
