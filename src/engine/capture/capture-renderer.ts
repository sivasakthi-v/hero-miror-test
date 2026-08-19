import type { ArtMode } from '@/content/art-modes';
import { createAmbientField } from '@/engine/render/ambient';
import { renderFrame } from '@/engine/render/compositor';
import type { SceneAnalysis } from '@/engine/render/exposure';
import { createParticleField } from '@/engine/render/particles';
import { createViewport } from '@/engine/transform/viewport';
import type { FaceState } from '@/engine/vision/types';
import { captionBand, drawCaption, drawSeam, drawStock, posterLayout } from './poster';
import { drawSticker, pickSticker } from './stickers';
import { pickCaption } from '@/content/copy';
import { mulberry32 } from '@/lib/rng';

/**
 * Two outputs from one capture, because they go to different places.
 *
 * The **download** is the polaroid alone on transparency: a cut-out object the visitor
 * can drop onto anything. Nothing is painted outside the stock, and the margin exists
 * purely so stickers can hang over the edge.
 *
 * The **share card** is that same polaroid resting in the look's own light, sized for
 * where it is going: 16:9 from a landscape frame, 9:16 from a portrait one. No text —
 * the picture and the signature already say everything.
 *
 * Both are quality-first single frames with every pass forced high. The live view never
 * runs at this size, which is the whole reason for a separate render path.
 */

/**
 * The track resolution is a hard ceiling (docs/PLAN.md R1). Upscaling past it adds no
 * detail, only weight.
 */
const MAX_PHOTO_WIDTH = 1600;

/** Room around the polaroid for stickers to overhang into. Transparent in the download. */
const OVERHANG = 0.14;

export interface CaptureOptions {
  video: HTMLVideoElement;
  face: FaceState;
  mode: ArtMode;
  scene: SceneAnalysis;
  /** The aspect the visitor is looking at, so the print matches the screen. */
  aspect: number;
  reducedMotion: boolean;
  sessionSeed: number;
}

export interface CapturedPortrait {
  /** The polaroid on transparency. */
  print: HTMLCanvasElement;
  /** The polaroid on its ambient background, sized for sharing. */
  card: HTMLCanvasElement;
}

export async function renderPortrait(options: CaptureOptions): Promise<CapturedPortrait> {
  const { video, mode, aspect } = options;

  // Size from the camera, never invented.
  const sourceLimit = Math.max(video.videoWidth, 640);
  const photoWidth = Math.min(MAX_PHOTO_WIDTH, sourceLimit);
  const photoHeight = Math.round(photoWidth / aspect);
  const layout = posterLayout(photoWidth, photoHeight);

  // ---- the polaroid itself, on transparency -----------------------------------
  const margin = Math.round(layout.width * OVERHANG);
  const print = document.createElement('canvas');
  print.width = layout.width + margin * 2;
  print.height = layout.height + margin * 2;
  const ctx = print.getContext('2d');
  if (!ctx) return { print, card: print };

  ctx.save();
  ctx.translate(margin, margin);
  drawStock(ctx, layout);

  // The photo is rendered separately, then placed. Rendering into the poster directly
  // would force every pass to reason about the paper margins.
  const photo = document.createElement('canvas');
  const photoCtx = photo.getContext('2d');
  if (photoCtx) {
    const viewport = createViewport({
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
      width: photoWidth,
      height: photoHeight,
      // Already full resolution; a pixel ratio on top would double it again.
      devicePixelRatio: 1,
      mirrored: true,
    });

    renderFrame(photo, photoCtx, {
      video,
      face: options.face,
      viewport,
      mode,
      // Empty on purpose: sparkle is a reaction to a moment, and freezing whatever
      // happened to be on screen into the keepsake is noise.
      particles: createParticleField('high'),
      progress: 1,
      // Fixed, so film burns and dust land composed rather than mid-animation.
      time: 2400,
      reducedMotion: options.reducedMotion,
      tier: 'high',
      scene: options.scene,
      sessionSeed: options.sessionSeed,
      debug: false,
    });

    ctx.drawImage(photo, layout.photo.x, layout.photo.y, layout.photo.width, layout.photo.height);
  }

  drawSeam(ctx, layout);

  // A different line each capture, chosen from the seed so the same shot is repeatable.
  const random = mulberry32(options.sessionSeed + Math.floor(Date.now() / 997));
  drawCaption(ctx, layout, pickCaption(random));
  ctx.restore();

  // Stickers last, outside the translate, so they can hang past the stock into the
  // transparent margin — which is the entire point of the margin.
  // Exactly one, and never over the caption band — the words are the point of the print.
  const sticker = await pickSticker(layout, captionBand(layout), random);
  if (sticker) drawSticker(ctx, sticker, { x: margin, y: margin });

  return { print, card: renderShareCard(print, aspect, mode, options.scene) };
}

/**
 * The share card: the print resting in the look's own light.
 *
 * Aspect follows the frame, because the two go to different places — a landscape polaroid
 * belongs in a 16:9 post, a portrait one in a 9:16 story. Getting this wrong means the
 * platform crops the signature off.
 */
function renderShareCard(
  print: HTMLCanvasElement,
  aspect: number,
  mode: ArtMode,
  scene: SceneAnalysis,
): HTMLCanvasElement {
  const portraitFrame = aspect < 1.15;
  const width = portraitFrame ? 1080 : 1920;
  const height = portraitFrame ? 1920 : 1080;

  const card = document.createElement('canvas');
  card.width = width;
  card.height = height;
  const ctx = card.getContext('2d');
  if (!ctx) return card;

  // The same ambient field the page uses, settled, so the card is lit like the moment.
  const ambient = createAmbientField();
  for (let i = 0; i < 90; i++) ambient.update(scene.quadrants, mode, 125);

  ctx.fillStyle = '#08090a';
  ctx.fillRect(0, 0, width, height);

  // Drawn small and scaled up with a blur, so it reads as light rather than as four
  // coloured circles. The page gets this free from a CSS filter; a canvas must ask.
  const wash = document.createElement('canvas');
  wash.width = Math.max(1, Math.round(width / 6));
  wash.height = Math.max(1, Math.round(height / 6));
  const wctx = wash.getContext('2d');
  if (wctx) {
    ambient.draw(wctx, wash.width, wash.height, 1400);
    ctx.save();
    ctx.filter = 'blur(26px) saturate(1.4)';
    ctx.drawImage(wash, 0, 0, width, height);
    ctx.restore();
  }

  // Fit with generous air, so the print sits *in* the light rather than filling it.
  const scale = Math.min((width * 0.74) / print.width, (height * 0.74) / print.height);
  const w = print.width * scale;
  const h = print.height * scale;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = w * 0.06;
  ctx.shadowOffsetY = w * 0.02;
  ctx.drawImage(print, (width - w) / 2, (height - h) / 2, w, h);
  ctx.restore();

  return card;
}

/**
 * Encoding, chosen per output.
 *
 * The download needs alpha, which rules JPEG out — it would fill the transparent
 * overhang with black. That left PNG at 3.6MB for a grainy photograph, which is a lot to
 * hand someone on a phone. WebP keeps the alpha and encodes the same print at a fraction
 * of the size, so it is tried first and PNG is the fallback where the browser cannot
 * encode it. The returned type tells the caller which extension to use.
 */
export async function encodePrint(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const webp = await toBlob(canvas, 'image/webp', 0.94);
  // A browser that cannot encode WebP silently hands back a PNG, so check what arrived
  // rather than trusting the request.
  if (webp && webp.type === 'image/webp') return webp;
  return toBlob(canvas, 'image/png');
}

export async function toBlob(
  canvas: HTMLCanvasElement,
  type: 'image/png' | 'image/jpeg' | 'image/webp',
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}
