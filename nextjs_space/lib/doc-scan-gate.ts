// ---------------------------------------------------------------------------
// Auto-capture gate.
//
// Deciding that a frame contains a document is not enough to fire the shutter:
// even a strict detector can latch onto a plausible-looking rectangle for a
// moment. A capture is only allowed once the SAME quad has been held, barely
// moving, for a sustained stretch of frames, and never during the first moment
// after the camera opens while exposure and focus are still settling.
//
// The hold is deliberately forgiving of the odd missed frame. iOS Safari
// refocuses and re-exposes far more aggressively than Android, so a document
// that is genuinely being held still still produces the occasional frame the
// detector cannot use. Throwing the whole hold away on one of those is what
// made the capture "find it, then drop out, then start again". A miss now
// hands back one earned frame instead of resetting to zero, so a blip costs a
// moment and a genuinely unstable scene still never accumulates enough.
//
// The same forgiveness applies to a frame that is found but lands in a
// slightly different place. Two separate things can cause that: detector noise
// on a document that is being held still, and a document that is genuinely on
// the move. They are told apart by where the quad sits relative to the start
// of the hold, not by one frame in isolation. A jumpy frame costs progress and
// leaves the hold standing; movement away from where the hold began, or a run
// of jumpy frames, ends it. That keeps a slow pan out while letting a shaky
// hand finish.
//
// The rule lives here, apart from the React component, so the exact logic that
// ships can be exercised directly.
// ---------------------------------------------------------------------------

import { blendCorners, cornersAreGood, cornersDrift, type Corners } from "./doc-scan";

// How often the live loop is allowed to run the detector.
export const DETECT_INTERVAL_MS = 200;
// Quiet period after the camera opens during which nothing is counted or
// captured, while exposure and focus settle.
export const WARMUP_MS = 1200;
// How long a document must then be held steady before the shutter fires.
export const HOLD_MS = 1400;
// ...and the minimum number of detections making up that stretch, so a couple
// of lucky frames can never be enough on their own.
export const MIN_STEADY_FRAMES = 6;
// Largest corner movement between frames, as a share of the frame diagonal,
// that still counts as the same document being held still. Measured against a
// smoothed reference, so detector jitter is not mistaken for a moving hand.
// Handheld phones are never still, so this is deliberately generous; the
// cumulative figure below is what actually keeps a moving document out.
export const MAX_DRIFT = 0.065;
// ...and the largest movement allowed across the whole hold, so a document
// slowly panning out of position cannot creep past the per-frame check. A
// shaky hand wanders around one spot and stays inside this; a pan does not.
export const MAX_TOTAL_DRIFT = 0.07;
// A gap longer than this breaks the run: the document was lost in between.
export const STALE_MS = 1100;
// How many earned frames a missed detection hands back. At one for one, a feed
// that only finds the document every other frame can never make progress,
// while an occasional blip in an otherwise steady hold costs almost nothing.
export const MISS_PENALTY = 1;
// Consecutive misses that end the hold outright, whatever the timings say.
export const MAX_MISS_STREAK = 4;
// What a frame that lands outside either of those tolerances costs, and how
// many of them in a row are treated as a wobble before the hold is abandoned
// as genuine movement.
export const UNSTEADY_PENALTY = 1;
export const MAX_UNSTEADY_STREAK = 2;

// Why the gate is in its current state. Surfaced for the on-screen hint and
// the diagnostics overlay, so a hold that keeps breaking can be explained
// instead of guessed at.
export type GateReason =
  | "warmup"
  | "searching"
  | "unsteady"
  | "holding"
  | "ready";

export interface GateFeedback {
  // The current frame holds a well-framed document.
  good: boolean;
  // How far through the hold we are, 0 to 1. Drives the on-screen progress.
  progress: number;
  // The shutter should fire now.
  shouldCapture: boolean;
  // What the gate is doing, for the hint pill and the diagnostics overlay.
  reason: GateReason;
  // True on the frame where an in-progress hold was abandoned, so the caller
  // can tell a scene that keeps slipping from one that is simply empty.
  broke: boolean;
  // Earned frames so far in the current hold.
  frames: number;
  // How long the current hold has been running, in ms.
  heldMs: number;
  // Movement since the previous detection, and since the hold began, both as a
  // share of the frame diagonal. -1 when there is nothing to compare against.
  drift: number;
  totalDrift: number;
}

export interface CaptureGate {
  push(
    corners: Corners | null,
    width: number,
    height: number,
    now: number,
  ): GateFeedback;
  reset(): void;
}

export function createCaptureGate(startedAt: number): CaptureGate {
  // A smoothed version of the recent detections. Comparing against this rather
  // than the last raw quad keeps per-frame detector noise out of the movement
  // measurement.
  let last: Corners | null = null;
  // Where the document sat when the current hold began, so cumulative movement
  // can be measured against it and not just frame to frame.
  let anchor: Corners | null = null;
  let lastAt = 0;
  let streakStart = 0;
  let frames = 0;
  let misses = 0;
  let unsteady = 0;

  const reset = () => {
    last = null;
    anchor = null;
    lastAt = 0;
    streakStart = 0;
    frames = 0;
    misses = 0;
    unsteady = 0;
  };

  const feedback = (
    reason: GateReason,
    opts: Partial<GateFeedback> = {},
  ): GateFeedback => ({
    good: false,
    progress: 0,
    shouldCapture: false,
    reason,
    broke: false,
    frames,
    heldMs: 0,
    drift: -1,
    totalDrift: -1,
    ...opts,
  });

  const progressOf = (heldMs: number) =>
    Math.max(
      0,
      Math.min(1, Math.min(heldMs / HOLD_MS, frames / MIN_STEADY_FRAMES)),
    );

  return {
    reset,
    push(corners, width, height, now) {
      const usable = !!corners && cornersAreGood(corners, width, height);

      // Nothing counts until the camera has settled: a usable frame is still
      // reported so the outline shows, but no hold accumulates and nothing
      // fires.
      if (now - startedAt < WARMUP_MS) {
        reset();
        return feedback("warmup", { good: usable });
      }

      if (!usable || !corners) {
        // No document this frame. A brief blip should cost a little progress,
        // not the whole hold; a real loss should end it.
        const hadHold = frames > 0;
        misses += 1;
        if (!anchor || misses > MAX_MISS_STREAK || now - lastAt > STALE_MS) {
          reset();
          return feedback("searching", { broke: hadHold });
        }
        frames = Math.max(0, frames - MISS_PENALTY);
        const heldMs = now - streakStart;
        return feedback("searching", {
          progress: progressOf(heldMs),
          heldMs,
        });
      }

      misses = 0;

      // Continuing the same hold, or starting a fresh one? The quad is measured
      // twice: against the recent average, which catches a jumpy frame, and
      // against where the hold began, which is what stops a slow pan from
      // creeping through one small step at a time.
      const drift = last ? cornersDrift(last, corners, width, height) : -1;
      const totalDrift = anchor
        ? cornersDrift(anchor, corners, width, height)
        : -1;
      // No hold to continue: nothing to compare against, or the document was
      // last seen too long ago.
      const fresh = !last || !anchor || now - lastAt > STALE_MS;
      // This frame is not where the document has been sitting: either wide of
      // the recent average, or too far from where the hold began.
      const displaced =
        !fresh && (drift > MAX_DRIFT || totalDrift > MAX_TOTAL_DRIFT);
      // One of those is a wobble or a noisy detection. A run of them is the
      // document genuinely going somewhere, and ends the hold.
      const givenUp = displaced && unsteady + 1 > MAX_UNSTEADY_STREAK;

      let broke = false;
      if (fresh || givenUp) {
        broke = frames > 0;
        frames = 1;
        streakStart = now;
        anchor = corners;
        unsteady = 0;
        // Start the reference again from this frame.
        last = corners;
      } else if (displaced) {
        // Hand back progress but keep the hold, and leave both the anchor and
        // the reference where the document was settled, so a frame that comes
        // back to that spot simply carries on.
        unsteady += 1;
        frames = Math.max(0, frames - UNSTEADY_PENALTY);
      } else {
        unsteady = 0;
        frames += 1;
        // Smooth the reference so the next frame is compared against the recent
        // average rather than one possibly noisy detection.
        last = last ? blendCorners(last, corners) : corners;
      }
      lastAt = now;

      const heldMs = now - streakStart;
      // The shutter only ever fires on a settled frame, so a capture always
      // lands on a document the detector has just seen sitting still, in the
      // place it has been held.
      const shouldCapture =
        !displaced && heldMs >= HOLD_MS && frames >= MIN_STEADY_FRAMES;
      return {
        good: true,
        progress: progressOf(heldMs),
        shouldCapture,
        reason: shouldCapture
          ? "ready"
          : displaced || broke
            ? "unsteady"
            : "holding",
        broke,
        frames,
        heldMs,
        drift,
        totalDrift,
      };
    },
  };
}
