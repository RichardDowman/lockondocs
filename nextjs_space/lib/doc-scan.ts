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

// Pinned versions so a future CDN change can never silently alter behavior.
const OPENCV_URL = "https://docs.opencv.org/4.7.0/opencv.js";
const JSCANIFY_URL = "https://cdn.jsdelivr.net/npm/jscanify@1.4.3/src/jscanify.min.js";

// --- Detection tuning -------------------------------------------------------
// These thresholds decide what counts as "a document". They are deliberately
// tight: a missed frame just means the user waits another moment, whereas a
// loose gate means the scanner fires at a desk, a hand or the frame border.
// Share of the frame the document must cover (rejects noise and full-frame).
// Lowered from 0.22 in Build 38 so an ID card can be captured from far enough
// away for the camera to focus (the iPhone 14 Pro main lens cannot focus
// closer than about 20 cm). The shape tests below still reject clutter.
const MIN_AREA_RATIO = 0.1;
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
  // runtime initializes a moment later. cv.Mat only exists once it is ready.
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

// --- Is it really paper? (Build 40) -----------------------------------------
// jscanify only ever offers the single largest edge blob, so on a busy table
// the document was usually outvoted by the background, and when something did
// pass the shape tests it could be a shape stitched together from the page and
// a bright patch next to it. Build 40 looks at every closed outline from three
// different views of the frame and only accepts a four-sided one whose sides
// are real paper edges.

// Outlines smaller than this share of the frame are not worth testing.
const MIN_CANDIDATE_AREA = 0.06;
// Brightness step (0 to 255) that counts as an edge at a sample point.
const EDGE_STEP = 14;
// Share of the points along EVERY side that must show the paper brighter than
// what lies just outside it.
const MIN_EDGE_SUPPORT = 0.75;
// Share of the points along a side allowed to show the opposite step. A side
// that is bright on the outside belongs to something else (a lit patch, the
// text block inside a page, a keyboard on a pale desk).
const MAX_WRONG_WAY = 0.1;
// The middle of the page must be at least this much brighter than its
// surroundings.
const MIN_PAPER_CONTRAST = 12;
// A page is mostly paper. If more than this share of the inside is very dark
// (keys, a screen, stripes of shadow) it is not a document.
const MAX_DARK_INSIDE = 0.25;
// Sample spacing is tuned on the 360 px live frame and scaled up from there.
const EVIDENCE_BASE_PX = 360;

function pixel(px: Uint8Array, width: number, height: number, x: number, y: number): number {
  const xi = Math.floor(x + 0.5);
  const yi = Math.floor(y + 0.5);
  if (xi < 0 || yi < 0 || xi >= width || yi >= height) return -1;
  return px[yi * width + xi];
}

function percentile(hist: Uint32Array, n: number, p: number): number {
  const target = p * n;
  let acc = 0;
  for (let i = 0; i < 256; i += 1) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

// True when the quad's four sides are genuine paper edges and its inside looks
// like a page. `px` is a lightly blurred grayscale copy of the frame.
function looksLikePaper(
  px: Uint8Array,
  width: number,
  height: number,
  c: Corners,
  k: number,
): boolean {
  const q = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner];
  const off = Math.max(3, Math.round(3 * k));
  const slack = Math.max(2, Math.round(2 * k));
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const ring = new Uint32Array(256);
  let nRing = 0;
  const samples = 28;
  for (let i = 0; i < 4; i += 1) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) return false;
    let nx = -dy / len;
    let ny = dx / len;
    // Point the normal away from the middle of the quad.
    if ((cx - (a.x + b.x) / 2) * nx + (cy - (a.y + b.y) / 2) * ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    let valid = 0;
    let strong = 0;
    let darker = 0;
    for (let j = 0; j < samples; j += 1) {
      const t = 0.08 + (0.84 * j) / (samples - 1);
      const sx = a.x + dx * t;
      const sy = a.y + dy * t;
      let best: number | null = null;
      // Allow the traced line to sit a pixel or two off the true edge.
      for (let s = -slack; s <= slack; s += 1) {
        const ex = sx + nx * s;
        const ey = sy + ny * s;
        const outside = pixel(px, width, height, ex + nx * off, ey + ny * off);
        const further = pixel(px, width, height, ex + nx * off * 2.5, ey + ny * off * 2.5);
        const inside = pixel(px, width, height, ex - nx * off, ey - ny * off);
        if (outside < 0 || further < 0 || inside < 0) continue;
        const c1 = outside - inside;
        const c2 = further - inside;
        // A paper edge is a step: the outside stays darker further out. A thin
        // dark line (tile grout, a seam) does not, so it scores nothing.
        let step: number;
        if (c1 > 0 !== c2 > 0) step = c1 > 0 ? c1 : 0;
        else step = Math.abs(c1) < Math.abs(c2) ? c1 : c2;
        if (best === null || Math.abs(step) > Math.abs(best)) best = step;
      }
      if (best === null) continue;
      valid += 1;
      if (Math.abs(best) >= EDGE_STEP) {
        strong += 1;
        if (best < 0) darker += 1;
      }
      for (let d = 4; d <= 10; d += 1) {
        const v = pixel(px, width, height, sx + nx * d * k, sy + ny * d * k);
        if (v >= 0) {
          ring[v] += 1;
          nRing += 1;
        }
      }
    }
    if (valid < samples * 0.6) return false;
    if (darker / valid < MIN_EDGE_SUPPORT) return false;
    if ((strong - darker) / valid > MAX_WRONG_WAY) return false;
  }

  // The inside of the quad, sampled on a grid that keeps clear of the edges.
  const inner = new Uint32Array(256);
  let nInner = 0;
  const gw = 96;
  const gh = 128;
  for (let yy = 8; yy < 120; yy += 1) {
    const v = (yy + 0.5) / gh;
    for (let xx = 7; xx < 89; xx += 1) {
      const u = (xx + 0.5) / gw;
      const tx = q[0].x + (q[1].x - q[0].x) * u;
      const ty = q[0].y + (q[1].y - q[0].y) * u;
      const bx = q[3].x + (q[2].x - q[3].x) * u;
      const by = q[3].y + (q[2].y - q[3].y) * u;
      const val = pixel(px, width, height, tx + (bx - tx) * v, ty + (by - ty) * v);
      if (val >= 0) {
        inner[val] += 1;
        nInner += 1;
      }
    }
  }
  if (nInner < 100 || nRing < 50) return false;
  if (percentile(inner, nInner, 0.5) - percentile(ring, nRing, 0.5) < MIN_PAPER_CONTRAST) {
    return false;
  }
  const cut = 0.55 * percentile(inner, nInner, 0.9);
  let dark = 0;
  for (let i = 0; i < 256 && i < cut; i += 1) dark += inner[i];
  return dark / nInner <= MAX_DARK_INSIDE;
}

function sameQuad(a: Corners, b: Corners, tolerance: number): boolean {
  return (
    dist(a.topLeftCorner, b.topLeftCorner) < tolerance &&
    dist(a.topRightCorner, b.topRightCorner) < tolerance &&
    dist(a.bottomRightCorner, b.bottomRightCorner) < tolerance &&
    dist(a.bottomLeftCorner, b.bottomLeftCorner) < tolerance
  );
}

// Detects a document-shaped quadrilateral in a canvas. Returns corner points in
// the canvas's own pixel coordinates, or null when nothing convincing is there.
// A returned quad either passes cornersAreGood AND the paper-edge test, or it
// fails cornersAreGood (too small, touching the frame edge and so on) and is
// only used to draw a guide outline: the capture gate never accepts it. A
// well-framed shape that fails the paper-edge test is never returned.
// Never throws: any OpenCV error resolves to null so the camera keeps running.
export function detectCorners(
  canvas: HTMLCanvasElement,
  // Kept so every caller stays unchanged. Build 40 runs jscanify's own edge
  // pass itself, alongside two others, instead of asking for its single best.
  _scanner: JscanifyInstance,
): Corners | null {
  const g = w();
  if (!g || !g.cv) return null;
  const cv = g.cv;
  const mats: any[] = [];
  const keep = (m: any) => {
    mats.push(m);
    return m;
  };
  try {
    const src = keep(cv.imread(canvas));
    const width: number = src.cols;
    const height: number = src.rows;
    if (!width || !height) return null;
    const minArea = MIN_CANDIDATE_AREA * width * height;
    const gray = keep(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const soft = keep(new cv.Mat());
    cv.GaussianBlur(gray, soft, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // View 1: jscanify's own edge map, exactly as findPaperContour builds it.
    const edges = keep(new cv.Mat());
    cv.Canny(src, edges, 50, 200);
    cv.GaussianBlur(edges, edges, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
    cv.threshold(edges, edges, 0, 255, cv.THRESH_OTSU);
    // View 2: light against dark, which finds a pale page on a dark surface
    // even when its printed edges are faint.
    const tone = keep(new cv.Mat());
    cv.threshold(soft, tone, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    // View 3: gentle edges, thickened so a slightly broken outline closes.
    const gentle = keep(new cv.Mat());
    cv.Canny(soft, gentle, 20, 60);
    const kernel = keep(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.dilate(gentle, gentle, kernel, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue());

    const candidates: { contour: any; area: number }[] = [];
    let legacy: any = null;
    for (const view of [edges, tone, gentle]) {
      const contours = keep(new cv.MatVector());
      const hierarchy = keep(new cv.Mat());
      cv.findContours(view, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
      let largest = -1;
      let largestArea = 0;
      for (let i = 0; i < contours.size(); i += 1) {
        const contour = contours.get(i);
        const area = Math.abs(cv.contourArea(contour));
        if (view === edges && area > largestArea) {
          largestArea = area;
          largest = i;
        }
        if (area >= minArea) candidates.push({ contour: keep(contour), area });
        else contour.delete();
      }
      if (view === edges && largest >= 0) legacy = keep(contours.get(largest));
    }
    candidates.sort((a, b) => b.area - a.area);

    // Copy the blurred grayscale frame out of the WASM heap once, so later
    // allocations can never invalidate the view while it is being read.
    const blurred = keep(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
    const px = new Uint8Array(blurred.data);
    const k = Math.max(1, Math.min(width, height) / EVIDENCE_BASE_PX);

    let best: Corners | null = null;
    let bestArea = 0;
    const tested: Corners[] = [];
    for (const cand of candidates) {
      const quad = quadFromContour(cv, cand.contour);
      if (!quad || !cornersAreGood(quad, width, height)) continue;
      if (tested.some((t) => sameQuad(t, quad, 6 * k))) continue;
      tested.push(quad);
      if (!looksLikePaper(px, width, height, quad, k)) continue;
      // Prefer the outermost paper outline, so the text block printed inside a
      // page never wins over the page itself.
      const area = quadArea(quad);
      if (area > bestArea) {
        best = quad;
        bestArea = area;
      }
    }
    if (best) return best;

    // Nothing that passes. Offer the old single-blob outline only when it is
    // NOT well framed, purely so the guide outline can still appear.
    if (legacy) {
      const guide = quadFromContour(cv, legacy);
      if (guide && !cornersAreGood(guide, width, height)) return guide;
    }
    return null;
  } catch {
    return null;
  } finally {
    for (const m of mats) {
      try {
        m.delete();
      } catch {
        /* ignore */
      }
    }
  }
}

// Heuristic that decides whether a detected quad is a plausible, well-framed
// document. It is the shape half of the defense (looksLikePaper is the other
// half) against the scanner grabbing a desk, a shadow or the camera frame
// itself. Used both to gate auto-capture and to decide whether a still image
// is worth straightening.
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

// --- Output resolution (Build 38) -------------------------------------------
// Readability is the top priority, so the straightened page keeps every pixel
// the camera captured. It is never upscaled (upscaling only blurs small print)
// and is only scaled down beyond A4 at 300 dpi, which is ample for fine text.
export const MAX_OUTPUT_LONG_EDGE = 3508;
// Largest canvas we hand to OpenCV or draw a camera still into. iOS Safari
// refuses canvases much above 16.7 million pixels, so stay safely under it.
export const MAX_SOURCE_PIXELS = 16_000_000;
// Detection runs on downscaled copies (faster, and the contour finder's fixed
// blur suits a smaller image), then the corners are scaled back up so the warp
// samples the full-resolution picture. 640 mirrors the live preview loop.
const DETECT_EDGES = [1000, 640];
// Images up to this size are also tried at full size, which is exactly what
// every release before Build 38 did, so detection can only get better.
const FULL_SIZE_DETECT_MAX_EDGE = 2600;

export function scaleCorners(c: Corners, sx: number, sy: number = sx): Corners {
  const s = (p: Point): Point => ({ x: p.x * sx, y: p.y * sy });
  return {
    topLeftCorner: s(c.topLeftCorner),
    topRightCorner: s(c.topRightCorner),
    bottomRightCorner: s(c.bottomRightCorner),
    bottomLeftCorner: s(c.bottomLeftCorner),
  };
}

// Finds a confident document quad in a canvas of any size and returns it in
// that canvas's own pixel coordinates, or null. Never throws.
export function detectCornersScaled(
  canvas: HTMLCanvasElement,
  scanner: JscanifyInstance,
): Corners | null {
  const cw = canvas.width;
  const ch = canvas.height;
  if (!cw || !ch || typeof document === "undefined") return null;
  const longEdge = Math.max(cw, ch);
  const tried = new Set<number>();
  const attempt = (edge: number): Corners | null => {
    const scale = Math.min(1, edge / longEdge);
    const key = Math.round(scale * 1000);
    if (tried.has(key)) return null;
    tried.add(key);
    try {
      let probe = canvas;
      if (scale < 1) {
        probe = document.createElement("canvas");
        probe.width = Math.max(1, Math.round(cw * scale));
        probe.height = Math.max(1, Math.round(ch * scale));
        const ctx = probe.getContext("2d");
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(canvas, 0, 0, probe.width, probe.height);
      }
      const found = detectCorners(probe, scanner);
      if (!found || !cornersAreGood(found, probe.width, probe.height)) return null;
      return scale < 1 ? scaleCorners(found, cw / probe.width, ch / probe.height) : found;
    } catch {
      return null;
    }
  };
  for (const edge of DETECT_EDGES) {
    const hit = attempt(edge);
    if (hit) return hit;
  }
  return longEdge <= FULL_SIZE_DETECT_MAX_EDGE ? attempt(longEdge) : null;
}

// Output dimensions for the flattened document: the longest detected top or
// bottom edge by the longest left or right edge, so nothing is squeezed.
function outputSize(c: Corners): { width: number; height: number } {
  const top = dist(c.topLeftCorner, c.topRightCorner);
  const bottom = dist(c.bottomLeftCorner, c.bottomRightCorner);
  const left = dist(c.topLeftCorner, c.bottomLeftCorner);
  const right = dist(c.topRightCorner, c.bottomRightCorner);
  let width = Math.max(top, bottom) || 64;
  let height = Math.max(left, right) || 64;
  const longEdge = Math.max(width, height);
  if (longEdge > MAX_OUTPUT_LONG_EDGE) {
    const k = MAX_OUTPUT_LONG_EDGE / longEdge;
    width *= k;
    height *= k;
  }
  return {
    width: Math.max(64, Math.round(width)),
    height: Math.max(64, Math.round(height)),
  };
}

// Flattens the quad straight out of the full-resolution canvas with a bicubic
// perspective warp. Returns null on any OpenCV failure so the caller can fall
// back to the library's own (lower quality) extraction.
function warpToCanvas(canvas: HTMLCanvasElement, c: Corners): HTMLCanvasElement | null {
  const g = w();
  if (!g || !g.cv || typeof document === "undefined") return null;
  const cv = g.cv;
  const { width, height } = outputSize(c);
  const mats: any[] = [];
  try {
    const src = cv.imread(canvas);
    mats.push(src);
    const tl = c.topLeftCorner;
    const tr = c.topRightCorner;
    const br = c.bottomRightCorner;
    const bl = c.bottomLeftCorner;
    const from = cv.matFromArray(4, 1, cv.CV_32FC2, [
      tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
    ]);
    mats.push(from);
    const to = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, width - 1, 0, width - 1, height - 1, 0, height - 1,
    ]);
    mats.push(to);
    const m = cv.getPerspectiveTransform(from, to);
    mats.push(m);
    const dst = new cv.Mat();
    mats.push(dst);
    cv.warpPerspective(
      src,
      dst,
      m,
      new cv.Size(width, height),
      cv.INTER_CUBIC,
      cv.BORDER_REPLICATE,
      new cv.Scalar(),
    );
    const out = document.createElement("canvas");
    cv.imshow(out, dst);
    return out.width > 0 && out.height > 0 ? out : null;
  } catch {
    return null;
  } finally {
    for (const mat of mats) {
      try {
        mat.delete();
      } catch {
        /* ignore */
      }
    }
  }
}

// Straightens the document in a canvas to a flat rectangle and returns a JPEG
// data URL, or null when no confident document quad is present. `hint` is an
// already-validated quad in this canvas's coordinates (from the live preview),
// used only when a fresh detection on the full picture finds nothing.
// Never throws.
export function correctCanvasToDataUrl(
  canvas: HTMLCanvasElement,
  scanner: JscanifyInstance,
  quality = 0.95,
  hint?: Corners | null,
): string | null {
  let corners = detectCornersScaled(canvas, scanner);
  if (!corners && hint && cornersAreGood(hint, canvas.width, canvas.height)) {
    corners = hint;
  }
  if (!corners) return null;
  try {
    let out = warpToCanvas(canvas, corners);
    if (!out) {
      const { width, height } = outputSize(corners);
      out = scanner.extractPaper(canvas, width, height, corners);
    }
    if (!out) return null;
    return out.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}
