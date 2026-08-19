import type { PhotoGrade } from '@/content/art-modes';
import type { Viewport } from '@/engine/transform/viewport';
import type { QualityTier } from './compositor';
import { posterizeFilterId, supportsSvgCanvasFilter } from './svg-filters';

/**
 * The photo treatment — the layer that makes this look like an edit rather than a webcam.
 *
 * This is why the video moved *into* the canvas. While it was a DOM element underneath,
 * nothing here was possible: canvas composite operations only blend within their own
 * canvas, so grade, duotone, bloom and grain all had nothing to act on.
 *
 * Order matters, and mirrors a darkroom: expose → grade → duotone → bloom → tint →
 * vignette → grain. Grain last, so it sits on the finished image like film, not under it.
 */

/** Reused between frames — allocating canvases in a render loop is how you get jank. */
let scratch: HTMLCanvasElement | null = null;
let bloomCanvas: HTMLCanvasElement | null = null;

function getScratch(width: number, height: number): HTMLCanvasElement {
  scratch ??= document.createElement('canvas');
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  return scratch;
}

function getBloom(width: number, height: number): HTMLCanvasElement {
  bloomCanvas ??= document.createElement('canvas');
  if (bloomCanvas.width !== width || bloomCanvas.height !== height) {
    bloomCanvas.width = width;
    bloomCanvas.height = height;
  }
  return bloomCanvas;
}

export interface PhotoOptions {
  grade: PhotoGrade;
  viewport: Viewport;
  tier: QualityTier;
}

/**
 * Draws the video through the viewport's cover-crop and mirror, then grades it.
 * The crop comes from the same transform the face art uses, so marks stay registered to
 * the face no matter which crop is active.
 */
export function drawPhoto(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  options: PhotoOptions,
): void {
  const { viewport, grade, tier } = options;
  const { crop, width, height, mirrored } = viewport;
  if (video.videoWidth === 0) return;

  ctx.save();

  // The mirror is applied here, once, for the photo. Landmarks get mirrored separately
  // by projectNormalized — both from the same `mirrored` flag, so they cannot disagree.
  if (mirrored) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  // A cheap, GPU-accelerated grade. Doing this per-pixel in JS would cost 30x more.
  // Posterisation rides along in the same filter string when the engine supports SVG
  // filters on a canvas — see svg-filters.ts for why that matters so much here.
  const posterizeOnGpu = grade.posterize > 0 && supportsSvgCanvasFilter();
  ctx.filter = posterizeOnGpu
    ? `${grade.filter} url(#${posterizeFilterId(grade.posterize)})`
    : grade.filter;
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
  ctx.filter = 'none';
  ctx.restore();

  if (grade.duotone) drawDuotone(ctx, viewport, grade.duotone);
  // Only reached where the GPU path is unavailable, and only on the strongest devices —
  // it is the most expensive operation in the renderer by an order of magnitude.
  if (grade.posterize > 0 && !posterizeOnGpu && tier === 'high') {
    drawPosterize(ctx, viewport, grade.posterize);
  }
  if (grade.bloom > 0 && tier !== 'lite') drawBloom(ctx, viewport, grade.bloom);

  if (grade.tintAlpha > 0) {
    ctx.save();
    ctx.globalCompositeOperation = grade.tintMode;
    ctx.globalAlpha = grade.tintAlpha;
    ctx.fillStyle = grade.tint;
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    ctx.restore();
  }

  if (grade.vignette > 0) drawVignette(ctx, viewport, grade.vignette);
}

/**
 * Two-tone mapping: shadows toward one colour, highlights toward another. Done with
 * composite operations rather than per-pixel maths — `multiply` pulls the darks, `screen`
 * lifts the lights, and the luminance of the photo decides how much of each lands.
 */
function drawDuotone(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  [shadow, highlight]: [string, string],
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'color';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = highlight;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.restore();
}

/**
 * Bloom: take the image, blur it hard, screen it back on. The blur runs on a quarter-size
 * canvas — a full-resolution blur every frame is the single most expensive thing here,
 * and at this radius nobody can tell the difference.
 */
function drawBloom(ctx: CanvasRenderingContext2D, viewport: Viewport, strength: number): void {
  const w = Math.max(1, Math.round(viewport.width / 4));
  const h = Math.max(1, Math.round(viewport.height / 4));
  const canvas = getBloom(w, h);
  const bctx = canvas.getContext('2d');
  if (!bctx) return;

  bctx.clearRect(0, 0, w, h);
  bctx.filter = 'brightness(1.35) contrast(1.2) blur(6px)';
  bctx.drawImage(ctx.canvas, 0, 0, w, h);
  bctx.filter = 'none';

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = strength;
  ctx.drawImage(canvas, 0, 0, viewport.width, viewport.height);
  ctx.restore();
}

/**
 * Screen-print posterisation. This one *is* per-pixel — there is no composite trick for
 * quantising levels — so it is gated to the high tier and to the aperture only.
 */
function drawPosterize(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  levels: number,
): void {
  const w = Math.round(viewport.width * viewport.dpr);
  const h = Math.round(viewport.height * viewport.dpr);
  if (w === 0 || h === 0) return;

  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(Math.round(data[i]! / step) * step);
    data[i + 1] = Math.round(Math.round(data[i + 1]! / step) * step);
    data[i + 2] = Math.round(Math.round(data[i + 2]! / step) * step);
  }
  ctx.putImageData(image, 0, 0);
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
    Math.min(width, height) * 0.28,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.78,
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * Average colour of the live frame, in a few big blocks.
 *
 * Feeds the ambient backdrop, so the light behind the frame belongs to the same room as
 * the person in it. Sampled at 8×8 — anything larger is wasted, since the result is
 * immediately blurred into a wash.
 */
export function sampleAmbient(video: HTMLVideoElement): string[] {
  if (video.videoWidth === 0) return [];
  const size = 8;
  const canvas = getScratch(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.drawImage(video, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Four quadrant averages: enough for a directional wash, cheap to compute.
  const quadrants = [0, 0, 0, 0].map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const q = (y < size / 2 ? 0 : 2) + (x < size / 2 ? 0 : 1);
      const i = (y * size + x) * 4;
      const target = quadrants[q]!;
      target.r += data[i]!;
      target.g += data[i + 1]!;
      target.b += data[i + 2]!;
      target.n++;
    }
  }

  return quadrants.map(({ r, g, b, n }) =>
    n === 0 ? 'rgb(0,0,0)' : `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`,
  );
}
