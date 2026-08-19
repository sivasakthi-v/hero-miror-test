import { jitterTable } from '@/lib/rng';
import type { Point } from '@/engine/transform/viewport';

/**
 * The hand-drawn line primitive. Everything in the face art is built from this.
 *
 * Three things separate a drawn line from a computed one:
 *
 *  1. It does not sit exactly on the path. Each point is nudged by a *fixed* offset —
 *     fixed, because jitter re-rolled every frame is a strobe, not a texture. The same
 *     wobble rides along with the face.
 *  2. It is drawn more than once, faintly. Overdrawing is what gives a pencil its grain
 *     and its darker corners, and it is why `passes` exists per art mode.
 *  3. It is thinner at the ends. Real strokes start and finish light, because a hand
 *     lifts. This is the single cheapest thing that stops a line looking like SVG.
 */

export interface StrokeOptions {
  color: string;
  width: number;
  jitter: number;
  passes: number;
  passAlpha: number;
  /** Stable identity for this stroke's wobble. Same key = same hand. */
  seed: string;
  /** 0..1 — how much of the stroke to draw, for the reveal animation. */
  progress?: number;
  /** Taper the ends. Off for closed shapes, where it would leave a gap. */
  taper?: boolean;
  closed?: boolean;
}

/** Catmull-Rom through the points, so a sparse path still reads as one continuous line. */
function smoothPath(ctx: CanvasRenderingContext2D, points: Point[], closed: boolean): void {
  if (points.length < 2) return;
  ctx.moveTo(points[0]!.x, points[0]!.y);

  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = points[Math.max(i - 1, 0)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(i + 2, last)]!;
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
  if (closed) ctx.closePath();
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  options: StrokeOptions,
): void {
  if (points.length < 2) return;

  const progress = options.progress ?? 1;
  if (progress <= 0) return;

  const visible = Math.max(2, Math.round(points.length * Math.min(progress, 1)));
  const path = points.slice(0, visible);
  const taper = options.taper ?? true;

  // Multiply, never replace. Callers fade whole effects in and out by setting
  // globalAlpha before calling — overwriting it here silently discards that, and the
  // effect pops on at full strength instead of arriving. (It did exactly that: the
  // smile reaction and the eye-spark twinkle were both hard switches until this line.)
  const inherited = ctx.globalAlpha;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = options.color;
  ctx.globalAlpha = inherited * options.passAlpha;

  for (let pass = 0; pass < options.passes; pass++) {
    // Each pass gets its own offsets, so passes separate slightly the way real
    // overdrawing does instead of stacking into one thick line.
    const dx = jitterTable(`${options.seed}:${pass}:x`, path.length, options.jitter);
    const dy = jitterTable(`${options.seed}:${pass}:y`, path.length, options.jitter);

    if (taper) {
      // Width varies along the stroke, so it is drawn in short segments.
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const t = i / (path.length - 1);
        // Thin at both ends, fullest in the middle.
        const ease = Math.sin(Math.PI * t);
        ctx.beginPath();
        ctx.lineWidth = options.width * (0.35 + 0.65 * ease);
        ctx.moveTo(a.x + (dx[i - 1] ?? 0), a.y + (dy[i - 1] ?? 0));
        ctx.lineTo(b.x + (dx[i] ?? 0), b.y + (dy[i] ?? 0));
        ctx.stroke();
      }
      continue;
    }

    ctx.beginPath();
    ctx.lineWidth = options.width;
    smoothPath(
      ctx,
      path.map((p, i) => ({ x: p.x + (dx[i] ?? 0), y: p.y + (dy[i] ?? 0) })),
      options.closed ?? false,
    );
    ctx.stroke();
  }

  ctx.restore();
}

/** A soft radial wash — cheeks, glow, anything that should have no edge at all. */
export function drawWash(
  ctx: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  color: string,
  strength = 1,
): void {
  if (radius <= 0) return;
  const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  ctx.save();
  // Multiplied for the same reason as drawStroke.
  ctx.globalAlpha = ctx.globalAlpha * strength;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
