import type { ArtMode } from '@/content/art-modes';
import { projectNormalized, type Point, type Viewport } from '@/engine/transform/viewport';
import { FACE_OVAL } from '@/engine/vision/mesh';
import type { FaceState } from '@/engine/vision/types';
import { drawStroke, drawWash } from './stroke';

/**
 * The six face effects (blueprint §29): contour, halo, cheeks, brows, eye spark, and a
 * smile reaction. Drawn in that order, from softest to sharpest.
 *
 * Everything reads from `anchors` rather than raw indices, and every position goes
 * through `projectNormalized`, so this file contains no knowledge of crops, mirrors or
 * pixel ratios — and works unchanged at 3:2, 4:5, and at capture resolution.
 */

/**
 * Marks are sized against the face itself, not the canvas. Someone sitting far away gets
 * a smaller drawing, exactly as they should — sizing off the viewport would put a
 * cartoonishly large blush on a distant face.
 */
function faceScale(face: FaceState, viewport: Viewport): number {
  const anchors = face.anchors;
  if (!anchors) return 0;
  const forehead = projectNormalized(anchors.forehead, viewport);
  const chin = projectNormalized(anchors.chin, viewport);
  return Math.hypot(chin.x - forehead.x, chin.y - forehead.y);
}

function ovalPath(face: FaceState, viewport: Viewport): Point[] {
  const path: Point[] = [];
  for (const [start] of FACE_OVAL) {
    const point = face.landmarks[start];
    if (point) path.push(projectNormalized(point, viewport));
  }
  return path;
}

export interface FaceArtOptions {
  mode: ArtMode;
  /** 0..1 reveal, so the drawing arrives rather than appearing (blueprint beat 02). */
  progress: number;
  /** Pulses the halo. Frozen when the visitor prefers reduced motion. */
  time: number;
  reducedMotion: boolean;
  /** Fewer, cheaper marks on weak devices. */
  tier: 'high' | 'balanced' | 'lite';
}

export function drawFaceArt(
  ctx: CanvasRenderingContext2D,
  face: FaceState,
  viewport: Viewport,
  options: FaceArtOptions,
): void {
  const anchors = face.anchors;
  if (!face.present || !anchors) return;

  const { mode, tier } = options;
  const scale = faceScale(face, viewport);
  if (scale <= 0) return;

  // Stroke width tracks face size, with a floor so a distant face is not invisible.
  const width = Math.max(1, mode.strokeWidth * (scale / 220));
  const passes = tier === 'lite' ? 1 : mode.passes;
  const progress = Math.min(Math.max(options.progress, 0), 1);

  const at = (key: keyof typeof anchors): Point => projectNormalized(anchors[key], viewport);

  // ---- halo, behind everything -------------------------------------------------
  if (tier !== 'lite' && mode.glowStrength > 0) {
    const head = at('forehead');
    const chin = at('chin');
    const center = { x: (head.x + chin.x) / 2, y: (head.y + chin.y) / 2 };
    // A slow, shallow breath. Nothing here should ever pulse fast enough to notice.
    const pulse = options.reducedMotion ? 0.34 : 0.3 + 0.04 * Math.sin(options.time / 1400);
    drawWash(ctx, center, scale * 1.5, mode.glow, pulse * mode.glowStrength * progress);
  }

  // ---- cheeks ------------------------------------------------------------------
  if (tier === 'high') {
    for (const key of ['leftCheek', 'rightCheek'] as const) {
      drawWash(ctx, at(key), scale * 0.34, mode.blush, progress);
    }
  }

  const stroke = (
    points: Point[],
    seed: string,
    extra: Partial<Parameters<typeof drawStroke>[2]> = {},
  ) =>
    drawStroke(ctx, points, {
      color: mode.ink,
      width,
      jitter: mode.jitter,
      passes,
      passAlpha: mode.passAlpha,
      seed,
      progress,
      ...extra,
    });

  // ---- contour: the first thing the visitor sees appear --------------------------
  stroke(ovalPath(face, viewport), 'contour', { taper: false, closed: true });

  // ---- brows: one confident mark each, not an outline ---------------------------
  for (const [key, seed] of [
    ['leftBrow', 'brow-l'],
    ['rightBrow', 'brow-r'],
  ] as const) {
    const brow = at(key);
    const eye = at(key === 'leftBrow' ? 'leftEye' : 'rightEye');
    const span = scale * 0.22;
    const lift = (eye.y - brow.y) * 0.35;
    stroke(
      [
        { x: brow.x - span, y: brow.y + lift * 0.4 },
        { x: brow.x, y: brow.y },
        { x: brow.x + span, y: brow.y + lift * 0.2 },
      ],
      seed,
    );
  }

  // ---- eye spark: one eye only. Both would read as a filter -----------------------
  if (tier !== 'lite') {
    const eye = at('rightEye');
    const r = scale * 0.1;
    const twinkle = options.reducedMotion ? 1 : 0.85 + 0.15 * Math.sin(options.time / 700);
    ctx.save();
    ctx.globalAlpha = progress * twinkle;
    drawStroke(
      ctx,
      [
        { x: eye.x - r, y: eye.y - r * 1.4 },
        { x: eye.x + r * 0.6, y: eye.y - r * 2.2 },
      ],
      {
        color: mode.accent,
        width: width * 0.9,
        jitter: mode.jitter * 0.5,
        passes: 1,
        passAlpha: 1,
        seed: 'spark-a',
        progress,
      },
    );
    drawStroke(
      ctx,
      [
        { x: eye.x - r * 0.2, y: eye.y - r * 2.4 },
        { x: eye.x + r * 0.2, y: eye.y - r * 1.2 },
      ],
      {
        color: mode.accent,
        width: width * 0.7,
        jitter: mode.jitter * 0.5,
        passes: 1,
        passAlpha: 1,
        seed: 'spark-b',
        progress,
      },
    );
    ctx.restore();
  }

  // ---- smile reaction: earned, not constant --------------------------------------
  // Threshold plus the slow expression smoothing means this arrives a beat after the
  // smile does, like someone noticing rather than a switch flipping.
  if (face.expression.smile > 0.45) {
    const strength = Math.min((face.expression.smile - 0.45) / 0.35, 1);
    const mouth = at('mouthCenter');
    const r = scale * 0.42;
    ctx.save();
    ctx.globalAlpha = strength * progress;
    for (const [i, side] of [-1, 1].entries()) {
      const center = { x: mouth.x + side * r, y: mouth.y - r * 0.35 };
      const s = scale * 0.05;
      drawStroke(
        ctx,
        [
          { x: center.x - s, y: center.y },
          { x: center.x + s, y: center.y },
        ],
        {
          color: mode.accent,
          width: width * 0.8,
          jitter: 0.4,
          passes: 1,
          passAlpha: 1,
          seed: `smile-h${i}`,
          progress: 1,
        },
      );
      drawStroke(
        ctx,
        [
          { x: center.x, y: center.y - s },
          { x: center.x, y: center.y + s },
        ],
        {
          color: mode.accent,
          width: width * 0.8,
          jitter: 0.4,
          passes: 1,
          passAlpha: 1,
          seed: `smile-v${i}`,
          progress: 1,
        },
      );
    }
    ctx.restore();
  }
}
