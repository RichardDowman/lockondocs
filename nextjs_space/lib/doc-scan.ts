// ---------------------------------------------------------------------------
// On-device document detection and perspective correction.
//
// Everything here runs entirely in the visitor's browser: no image ever leaves
// the device for detection, and there are no per-scan fees. It layers OpenCV.js
// (WASM computer-vision runtime) and jscanify (a tiny document-boundary helper
// built on OpenCV) on top of the existing manual scanner.
//
// Both libraries are loaded lazily from a CDN the first time the scanner needs
// them, so the roughly 8 MB OpenCV runtime is never bundled into the app and is
// only fetched when a user actually opens the camera or uploads a photo. If the
// CDN is unreachable (for example a locked-down in-app browser), every function
// here fails soft and the caller falls back to the existing manual flow, so the
// scanner always keeps working.
// ---------------------------------------------------------------------------

// Pinned versions so a future CDN change can never silently alter behaviour.
const OPENCV_URL = "https://docs.opencv.org/4.7.0/opencv.js";
const JSCANIFY_URL = "https://cdn.jsdelivr.net/npm/jscanify@1.4.3/src/jscanify.min.js";

// --- Detection tuning -------------------------------------------------------
// These thresholds decide what counts as "a document". They are deliberately
// tight: a missed frame just means the user waits another moment, whereas a
// loose gate means the scanner fires at a desk, a hand or the frame border.
// Share of the frame the document must cover (rejects noise and full-frame).
const MIN_AREA_RATIO = 0.22;
const MAX_AREA_RATIO = 0.9;
// Clearance every corner must keep from the frame edge, as a share of the
// shorter frame side.
const EDGE_MARGIN = 0.02;
// Shortest allowed side, as a share of the shorter frame side.
const MIN_SIDE = 0.18;
// How similar opposite sides and the two diagonals must be.
const MIN_SIDE_RATIO = 0.7;
const MIN_DIAGONAL_RATIO = 0.8;
// Allowed corner angles in degrees (a rectangle seen at an angle stays near 90).
const MIN_CORNER_ANGLE = 62;
const MAX_CORNER_ANGLE = 118;
// Allowed width-to-height range, from a wide landscape sheet to a long receipt.
const MIN_ASPECT = 0.2;
const MAX_ASPECT = 5;
// How completely the traced outline must fill its own four-cornered
// approximation, which is what separates paper from a ragged blob.
const MIN_SOLIDITY = 0.85;
const MAX_SOLIDITY = 1.15;

export interface Point {
  x: number;
  y: number;
}

export interface Corners {
  topLeftCorner: Point;
  topRightCorner: Point;
  bottomLeftCorner: Point;
  bottomRightCorner: Point;
}

// jscanify instance shape we rely on (kept loose on purpose).
interface JscanifyInstance {
  findPaperContour: (mat: any) => any | null;
  getCornerPoints: (contour: any) => Partial<Corners>;
  extractPaper: (
    image: HTMLCanvasElement | HTMLImageElement,
    width: number,
    height: number,
    corners?: Corners,
  ) => HTMLCanvasElement | null;
}

let scannerInstance: JscanifyInstance | null = null;
let loadingPromise: Promise<JscanifyInstance> | null = null;

function w(): any {
  return typeof window === "undefined" ? undefined : (window as any);
}

// True once both OpenCV's WASM runtime and jscanify are ready to use. Callers
// use this to decide whether to attempt correction without forcing a load.
export function isScannerReady(): boolean {
  const g = w();
  return !!(g && g.cv && typeof g.cv.Mat === "function" && scannerInstance);
}

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const g = w();
    if (!g || typeof document === "undefined") {
      reject(new Error("no-window"));
      return;
    }
    const existing = document.querySelector(
      `script[data-docscan="${src}"]`,
    ) as HTMLScriptElement | null;
    if (existing) {
      if (existing.getAttribute("data-loaded") === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("script-error")), {
        once: true,
      });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.setAttribute("data-docscan", src);
    s.addEventListener(
      "load",
      () => {
        s.setAttribute("data-loaded", "1");
        resolve();
      },
      { once: true },
    );
    s.addEventListener("error", () => reject(new Error("script-error")), {
      once: true,
    });
    document.head.appendChild(s);
  });
}

function waitFor(check: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (check()) {
      resolve();
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      if (check()) {
        window.clearInterval(id);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(id);
        reject(new Error("timeout"));
      }
    }, 100);
  });
}

async function ensureOpenCv(): Promise<void> {
  const g = w();
  if (g && g.cv && typeof g.cv.Mat === "function") return;
  await injectScript(OPENCV_URL);
  // The script's load event fires when the JS is downloaded, but the WASM
  // runtime initialises a moment later. cv.Mat only exists once it is ready.
  await waitFor(() => {
    const gg = w();
    return !!(gg && gg.cv && typeof gg.cv.Mat === "function");
  }, 25000);
}

async function ensureJscanify(): Promise<void> {
  const g = w();
  if (g && g.jscanify) return;
  await injectScript(JSCANIFY_URL);
  await waitFor(() => !!w()?.jscanify, 15000);
}

// Loads OpenCV + jscanify (idempotent) and returns a shared scanner instance.
// Rejects if either library cannot be loaded within the timeouts.
export async function loadDocScanner(): Promise<JscanifyInstance> {
  if (scannerInstance) return scannerInstance;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    await ensureOpenCv();
    await ensureJscanify();
    const g = w();
    scannerInstance = new g.jscanify() as JscanifyInstance;
    return scannerInstance;
  })();
  try {
    return await loadingPromise;
  } catch (err) {
    // Allow a later retry if the first attempt failed (e.g. transient network).
    loadingPromise = null;
    throw err;
  }
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Signed-area (shoelace) of a quad given in tl -> tr -> br -> bl order.
function quadArea(c: Corners): number {
  const { topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl } = c;
  return (
    Math.abs(
      tl.x * tr.y -
        tr.x * tl.y +
        tr.x * br.y -
        br.x * tr.y +
        br.x * bl.y -
        bl.x * br.y +
        bl.x * tl.y -
        tl.x * bl.y,
    ) / 2
  );
}

// Puts four unordered polygon vertices into tl / tr / bl / br order.
// Returns null when the points are degenerate (duplicates or collinear).
function orderQuad(points: Point[]): Corners | null {
  if (points.length !== 4) return null;
  const bySum = [...points].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => a.x - a.y - (b.x - b.y));
  const c: Corners = {
    topLeftCorner: bySum[0],
    bottomRightCorner: bySum[3],
    bottomLeftCorner: byDiff[0],
    topRightCorner: byDiff[3],
  };
  const picked = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  // Every original vertex must have been used exactly once.
  for (const p of points) {
    if (picked.filter((q) => q.x === p.x && q.y === p.y).length !== 1) return null;
  }
  if (quadArea(c) <= 0) return null;
  return c;
}

// Reduces a contour to a four-sided convex polygon, or null when the contour is
// not shaped like a sheet of paper. This is the check jscanify itself does NOT
// do: findPaperContour simply returns the largest edge blob in the frame, and
// getCornerPoints will happily turn a hand, a keyboard or a shadow into a
// "quad". Insisting on a genuine convex quadrilateral is what stops the scanner
// latching onto arbitrary shapes.
function quadFromContour(cv: any, contour: any): Corners | null {
  const peri = cv.arcLength(contour, true);
  if (!(peri > 0)) return null;
  const rawArea = Math.abs(cv.contourArea(contour));
  if (!(rawArea > 0)) return null;
  const approx = new cv.Mat();
  try {
    // Sweep the simplification tolerance, but only over tight values. A sheet
    // of paper has straight edges, so its outline collapses to four points
    // almost immediately. Rounded or ragged shapes only fold into a quad once
    // the tolerance is loose, so keeping the ceiling low is what stops a blob,
    // a bag or a shadow being mistaken for a page.
    for (const eps of [0.01, 0.015, 0.02, 0.025]) {
      cv.approxPolyDP(contour, approx, eps * peri, true);
      if (approx.rows !== 4) continue;
      if (!cv.isContourConvex(approx)) continue;
      const pts: Point[] = [];
      for (let i = 0; i < 4; i += 1) {
        pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
      }
      const ordered = orderQuad(pts);
      if (!ordered) continue;
      // The contour must actually fill its own quadrilateral. A ragged or
      // concave outline (clutter, a hand, overlapping papers) does not.
      const solidity = rawArea / quadArea(ordered);
      if (solidity < MIN_SOLIDITY || solidity > MAX_SOLIDITY) continue;
      return ordered;
    }
    return null;
  } finally {
    try {
      approx.delete();
    } catch {
      /* ignore */
    }
  }
}

// Detects a document-shaped quadrilateral in a canvas. Returns corner points in
// the canvas's own pixel coordinates, or null when nothing convincing is there.
// Never throws: any OpenCV error resolves to null so the camera keeps running.
export function detectCorners(
  canvas: HTMLCanvasElement,
  scanner: JscanifyInstance,
): Corners | null {
  const g = w();
  if (!g || !g.cv) return null;
  const cv = g.cv;
  let src: any = null;
  let contour: any = null;
  try {
    src = cv.imread(canvas);
    contour = scanner.findPaperContour(src);
    if (!contour) return null;
    return quadFromContour(cv, contour);
  } catch {
    return null;
  } finally {
    try {
      if (contour) contour.delete();
    } catch {
      /* ignore */
    }
    try {
      if (src) src.delete();
    } catch {
      /* ignore */
    }
  }
}

// Heuristic that decides whether a detected quad is a plausible, well-framed
// document. It has to be strict: the underlying contour finder returns the
// largest edge blob in the frame whether or not it is paper, so this is the
// last line of defence against the scanner grabbing a desk, a shadow or the
// camera frame itself. Used both to gate auto-capture and to decide whether a
// still image is worth straightening.
export function cornersAreGood(
  c: Corners,
  width: number,
  height: number,
): boolean {
  const tl = c.topLeftCorner;
  const tr = c.topRightCorner;
  const bl = c.bottomLeftCorner;
  const br = c.bottomRightCorner;

  const frameArea = width * height;
  if (frameArea <= 0) return false;

  const ratio = quadArea(c) / frameArea;
  // Too small = noise; too large = the detector grabbed the whole frame edge.
  if (ratio < MIN_AREA_RATIO || ratio > MAX_AREA_RATIO) return false;

  // Every corner must sit clear of the frame edge. A document running off the
  // edge is not worth capturing, and this is what rejects the very common
  // false positive where the "document" found is the camera frame border.
  const margin = EDGE_MARGIN * Math.min(width, height);
  for (const p of [tl, tr, bl, br]) {
    if (
      p.x < margin ||
      p.y < margin ||
      p.x > width - margin ||
      p.y > height - margin
    ) {
      return false;
    }
  }

  // Each side must be a meaningful length so slivers are rejected.
  const minSide = MIN_SIDE * Math.min(width, height);
  const top = dist(tl, tr);
  const bottom = dist(bl, br);
  const left = dist(tl, bl);
  const right = dist(tr, br);
  if (top < minSide || bottom < minSide || left < minSide || right < minSide) {
    return false;
  }

  // Opposite sides should be similar: a real sheet stays roughly a rectangle
  // even when viewed at an angle, whereas clutter is wildly lopsided.
  const wRatio = Math.min(top, bottom) / Math.max(top, bottom);
  const hRatio = Math.min(left, right) / Math.max(left, right);
  if (wRatio < MIN_SIDE_RATIO || hRatio < MIN_SIDE_RATIO) return false;

  // The two diagonals of a rectangle stay close in length under perspective.
  const d1 = dist(tl, br);
  const d2 = dist(tr, bl);
  const dRatio = Math.min(d1, d2) / Math.max(d1, d2);
  if (dRatio < MIN_DIAGONAL_RATIO) return false;

  // Corners must be roughly square. This rejects rhombus-shaped blobs that
  // pass every length test but are plainly not a sheet of paper.
  const corners: [Point, Point, Point][] = [
    [bl, tl, tr],
    [tl, tr, br],
    [tr, br, bl],
    [br, bl, tl],
  ];
  for (const [prev, here, next] of corners) {
    const a = { x: prev.x - here.x, y: prev.y - here.y };
    const b = { x: next.x - here.x, y: next.y - here.y };
    const la = Math.hypot(a.x, a.y);
    const lb = Math.hypot(b.x, b.y);
    if (la <= 0 || lb <= 0) return false;
    const cos = (a.x * b.x + a.y * b.y) / (la * lb);
    const deg = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (deg < MIN_CORNER_ANGLE || deg > MAX_CORNER_ANGLE) return false;
  }

  // Sanity bound on shape: from a wide landscape sheet to a long receipt.
  const aspect = ((top + bottom) / 2) / ((left + right) / 2);
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return false;

  return true;
}

// How far a quad moved between two frames, as a fraction of the frame diagonal.
// The live loop uses this to tell a document being held still from the detector
// jumping between different shapes. Returns 1 (i.e. "moved everywhere") when
// the frame size is unusable.
export function cornersDrift(
  a: Corners,
  b: Corners,
  width: number,
  height: number,
): number {
  const diag = Math.hypot(width, height);
  if (!(diag > 0)) return 1;
  const pairs: [Point, Point][] = [
    [a.topLeftCorner, b.topLeftCorner],
    [a.topRightCorner, b.topRightCorner],
    [a.bottomRightCorner, b.bottomRightCorner],
    [a.bottomLeftCorner, b.bottomLeftCorner],
  ];
  let worst = 0;
  for (const [p, q] of pairs) {
    worst = Math.max(worst, dist(p, q) / diag);
  }
  return worst;
}

// Eases the outline towards the newest detection so the drawn polygon settles
// instead of twitching pixel by pixel. Purely cosmetic.
export function blendCorners(prev: Corners, next: Corners, weight = 0.45): Corners {
  const mix = (p: Point, q: Point): Point => ({
    x: p.x + (q.x - p.x) * weight,
    y: p.y + (q.y - p.y) * weight,
  });
  return {
    topLeftCorner: mix(prev.topLeftCorner, next.topLeftCorner),
    topRightCorner: mix(prev.topRightCorner, next.topRightCorner),
    bottomRightCorner: mix(prev.bottomRightCorner, next.bottomRightCorner),
    bottomLeftCorner: mix(prev.bottomLeftCorner, next.bottomLeftCorner),
  };
}

// Output dimensions for the flattened document, derived from the detected
// edge lengths and clamped to a sensible range.
function outputSize(c: Corners): { width: number; height: number } {
  const top = dist(c.topLeftCorner, c.topRightCorner);
  const bottom = dist(c.bottomLeftCorner, c.bottomRightCorner);
  const left = dist(c.topLeftCorner, c.bottomLeftCorner);
  const right = dist(c.topRightCorner, c.bottomRightCorner);
  const width = Math.round(Math.max(top, bottom));
  const height = Math.round(Math.max(left, right));
  const clamp = (v: number) => Math.max(64, Math.min(2600, v || 64));
  return { width: clamp(width), height: clamp(height) };
}

// Straightens the document in a canvas to a flat rectangle and returns a JPEG
// data URL, or null when no confident document quad is present. Never throws.
export function correctCanvasToDataUrl(
  canvas: HTMLCanvasElement,
  scanner: JscanifyInstance,
  quality = 0.92,
): string | null {
  const corners = detectCorners(canvas, scanner);
  if (!corners) return null;
  if (!cornersAreGood(corners, canvas.width, canvas.height)) return null;
  try {
    const { width, height } = outputSize(corners);
    const out = scanner.extractPaper(canvas, width, height, corners);
    if (!out) return null;
    return out.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}
