import type { Expression, Landmark } from './types';

/**
 * Raw landmarks jitter by a pixel or two every frame. Drawn directly, the artwork
 * shivers and reads as a tracking system pointed at a face. Smoothed, it reads as
 * something attached to the face (blueprint §27).
 *
 * The smoothing is frame-rate independent: a fixed per-frame lerp would smooth twice as
 * hard at 30fps as at 60fps, so the same code would feel different on different
 * machines. Converting the factor through dt keeps the *time* constant instead.
 */

export const LANDMARK_SMOOTHING = 0.18;
/** Expressions lag deliberately — a smile that snaps on looks like a switch, not a face. */
export const EXPRESSION_SMOOTHING = 0.12;

const REFERENCE_FRAME_MS = 1000 / 60;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * `alpha` is expressed per 60fps frame; `dt` scales it to whatever the real interval was.
 * Clamped to 1 so a long stall (tab in the background, GC pause) snaps to the truth
 * instead of drifting there over the next second.
 */
export function timeAdjustedAlpha(alpha: number, dtMs: number): number {
  if (dtMs <= 0) return alpha;
  return 1 - Math.pow(1 - alpha, dtMs / REFERENCE_FRAME_MS);
}

export function smoothLandmarks(
  previous: Landmark[] | null,
  next: Landmark[],
  dtMs: number,
  alpha = LANDMARK_SMOOTHING,
): Landmark[] {
  // First sighting, or the face changed shape (it did not — the model restarted):
  // adopt the new points wholesale rather than sliding in from a stale position.
  if (!previous || previous.length !== next.length) return next;

  const t = timeAdjustedAlpha(alpha, dtMs);
  const out: Landmark[] = new Array<Landmark>(next.length);
  for (let i = 0; i < next.length; i++) {
    const p = previous[i];
    const n = next[i];
    if (!p || !n) continue;
    out[i] = { x: lerp(p.x, n.x, t), y: lerp(p.y, n.y, t), z: lerp(p.z, n.z, t) };
  }
  return out;
}

export function smoothExpression(
  previous: Expression,
  next: Expression,
  dtMs: number,
  alpha = EXPRESSION_SMOOTHING,
): Expression {
  const t = timeAdjustedAlpha(alpha, dtMs);
  return {
    smile: lerp(previous.smile, next.smile, t),
    mouthOpen: lerp(previous.mouthOpen, next.mouthOpen, t),
    browLift: lerp(previous.browLift, next.browLift, t),
    eyeOpen: lerp(previous.eyeOpen, next.eyeOpen, t),
    sadness: lerp(previous.sadness, next.sadness, t),
    surprise: lerp(previous.surprise, next.surprise, t),
  };
}
