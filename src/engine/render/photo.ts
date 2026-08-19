import type { ArtMode } from '@/content/art-modes';
import { projectNormalized, type Viewport } from '@/engine/transform/viewport';
import type { FaceState } from '@/engine/vision/types';
import type { QualityTier } from './compositor';
import { safeContrast, type SceneAnalysis } from './exposure';
import { drawFilmArtifacts, drawHalation, gateWeave } from './film';

/**
 * The photo pipeline.
 *
 * Order follows a darkroom: expose → grade → tone → bleed → damage → restore the face.
 *
 * Two decisions carry this file:
 *
 *  1. Everything is relative to an auto-exposed image. The previous version hard-coded
 *     its numbers against a mid-grey test frame; in a bright room the contrast clipped
 *     everything to white and the look collapsed into a flat rectangle.
 *  2. A clean copy of the frame is kept, and the face is composited back from it at the
 *     end. That is what lets the effects be genuinely heavy: the treatment happens
 *     *around* the person rather than to them, and the face never stops being readable.
 */

/** Reused across frames — allocating canvases in a render loop is how you get jank. */
let clean: HTMLCanvasElement | null = null;
let bloomCanvas: HTMLCanvasElement | null = null;
let diffusionCanvas: HTMLCanvasElement | null = null;
// Separate from the diffusion scratch on purpose: sharing one buffer between two passes
// in the same frame means the second silently eats the first.
let faceTile: HTMLCanvasElement | null = null;

function scratchCanvas(
  ref: HTMLCanvasElement | null,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = ref ?? document.createElement('canvas');
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

export interface PhotoOptions {
  mode: ArtMode;
  viewport: Viewport;
  tier: QualityTier;
  scene: SceneAnalysis;
  face: FaceState;
  time: number;
  reducedMotion: boolean;
}

export function drawPhoto(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  options: PhotoOptions,
): void {
  const { viewport, mode, tier, scene, time } = options;
  const { crop, width, height, mirrored } = viewport;
  if (video.videoWidth === 0 || width === 0) return;

  const { grade, passes } = mode;
  const pixelW = Math.round(width * viewport.dpr);
  const pixelH = Math.round(height * viewport.dpr);

  // ---- 1. clean pass: exposure-corrected, otherwise untouched --------------------
  // Everything downstream reads from this, including the face restore, so the correction
  // is applied exactly once.
  clean = scratchCanvas(clean, pixelW, pixelH);
  const cctx = clean.getContext('2d');
  if (!cctx) return;
  cctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  cctx.clearRect(0, 0, width, height);
  cctx.save();
  if (mirrored) {
    cctx.translate(width, 0);
    cctx.scale(-1, 1);
  }
  cctx.filter = `brightness(${scene.gain.toFixed(3)})`;
  cctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  cctx.filter = 'none';
  cctx.restore();

  // ---- 2. graded pass onto the target -------------------------------------------
  const contrast = safeContrast(grade.contrast, scene);
  const weave = options.reducedMotion ? { x: 0, y: 0 } : gateWeave(time, passes.film);

  ctx.save();
  ctx.translate(weave.x, weave.y);
  ctx.filter = [
    `contrast(${contrast.toFixed(3)})`,
    `saturate(${grade.saturate})`,
    `brightness(${grade.brightness})`,
    grade.hueRotate ? `hue-rotate(${grade.hueRotate}deg)` : '',
  ]
    .filter(Boolean)
    .join(' ');
  ctx.drawImage(clean, 0, 0, width, height);
  ctx.filter = 'none';
  ctx.restore();

  // ---- 3. lifted blacks: the faded-print look -----------------------------------
  if (grade.lift > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighten';
    ctx.globalAlpha = grade.lift;
    ctx.fillStyle = grade.liftColor;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // ---- 4. tone ------------------------------------------------------------------
  if (passes.duotone) drawDuotone(ctx, viewport, passes.duotone);

  // ---- 5. optical: diffusion, bloom, halation ------------------------------------
  if (passes.diffusion > 0 && tier !== 'lite') drawDiffusion(ctx, viewport, passes.diffusion);
  if (passes.bloom > 0 && tier !== 'lite') drawBloom(ctx, viewport, passes.bloom);
  if (passes.halation > 0 && tier === 'high') drawHalation(ctx, viewport, passes.halation);

  // ---- 6. tint + vignette --------------------------------------------------------
  if (passes.tintAlpha > 0) {
    ctx.save();
    ctx.globalCompositeOperation = passes.tintMode;
    ctx.globalAlpha = passes.tintAlpha;
    ctx.fillStyle = passes.tint;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  if (passes.vignette > 0) drawVignette(ctx, viewport, passes.vignette);

  // ---- 7. film damage ------------------------------------------------------------
  if (passes.film > 0 && tier !== 'lite') {
    drawFilmArtifacts(ctx, viewport, passes.film, options.reducedMotion ? 0 : time);
  }

  // ---- 8. give the face back -----------------------------------------------------
  if (passes.faceClarity > 0) restoreFace(ctx, clean, options);
}

/**
 * Composites the clean face back through a soft elliptical mask.
 *
 * The mask is built from the face anchors, so it tracks and scales with the person. Its
 * edge is feathered over a wide band — a hard edge would look like a cut-out sticker,
 * which is far worse than no protection at all.
 */
function restoreFace(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  options: PhotoOptions,
): void {
  const { face, viewport, mode } = options;
  const anchors = face.anchors;
  if (!face.present || !anchors) return;

  const forehead = projectNormalized(anchors.forehead, viewport);
  const chin = projectNormalized(anchors.chin, viewport);
  const leftJaw = projectNormalized(anchors.leftJaw, viewport);
  const rightJaw = projectNormalized(anchors.rightJaw, viewport);

  const cx = (forehead.x + chin.x) / 2;
  const cy = (forehead.y + chin.y) / 2;
  const rx = Math.abs(rightJaw.x - leftJaw.x) * 0.85;
  const ry = Math.hypot(chin.x - forehead.x, chin.y - forehead.y) * 0.8;
  if (rx <= 0 || ry <= 0) return;

  ctx.save();
  // A radial gradient used as the alpha of the restored patch: fully clean at the
  // centre, fading to nothing well before the edge.
  const gradient = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.25, cx, cy, Math.max(rx, ry));
  gradient.addColorStop(0, `rgba(255,255,255,${mode.passes.faceClarity})`);
  gradient.addColorStop(0.6, `rgba(255,255,255,${mode.passes.faceClarity * 0.55})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  // Draw the clean face into an offscreen tile masked by that gradient, then composite.
  const tile = scratchCanvas(faceTile, ctx.canvas.width, ctx.canvas.height);
  faceTile = tile;
  const tctx = tile.getContext('2d');
  if (!tctx) {
    ctx.restore();
    return;
  }
  tctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  tctx.clearRect(0, 0, viewport.width, viewport.height);
  tctx.drawImage(source, 0, 0, viewport.width, viewport.height);
  tctx.globalCompositeOperation = 'destination-in';
  tctx.fillStyle = gradient;
  tctx.fillRect(0, 0, viewport.width, viewport.height);
  tctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(tile, 0, 0, viewport.width, viewport.height);
  ctx.restore();
}

/**
 * Two-tone mapping: shadows toward one colour, highlights toward another, using
 * composite operations rather than per-pixel maths.
 */
function drawDuotone(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  [shadow, highlight]: [string, string],
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'color';
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = highlight;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.restore();
}

/** Soft-focus: the sharp image with a blurred copy laid over it, never instead of it. */
function drawDiffusion(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  strength: number,
): void {
  const w = Math.max(1, Math.round(viewport.width / 2));
  const h = Math.max(1, Math.round(viewport.height / 2));
  diffusionCanvas = scratchCanvas(diffusionCanvas, w, h);
  const canvas = diffusionCanvas;
  const dctx = canvas.getContext('2d');
  if (!dctx) return;

  dctx.clearRect(0, 0, w, h);
  dctx.filter = 'blur(8px)';
  dctx.drawImage(ctx.canvas, 0, 0, w, h);
  dctx.filter = 'none';

  ctx.save();
  // Lighten keeps the diffusion from muddying the shadows — real diffusion filters
  // bloom the highlights outward and leave the blacks alone.
  ctx.globalCompositeOperation = 'lighten';
  ctx.globalAlpha = strength * 0.85;
  ctx.drawImage(canvas, 0, 0, viewport.width, viewport.height);
  ctx.restore();
}

function drawBloom(ctx: CanvasRenderingContext2D, viewport: Viewport, strength: number): void {
  const w = Math.max(1, Math.round(viewport.width / 4));
  const h = Math.max(1, Math.round(viewport.height / 4));
  bloomCanvas = scratchCanvas(bloomCanvas, w, h);
  const bctx = bloomCanvas.getContext('2d');
  if (!bctx) return;

  bctx.clearRect(0, 0, w, h);
  bctx.filter = 'brightness(1.3) contrast(1.25) blur(6px)';
  bctx.drawImage(ctx.canvas, 0, 0, w, h);
  bctx.filter = 'none';

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = strength;
  ctx.drawImage(bloomCanvas, 0, 0, viewport.width, viewport.height);
  ctx.restore();
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  strength: number,
): void {
  const { width, height } = viewport;
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.3,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.8,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
