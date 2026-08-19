import type { ArtMode } from '@/content/art-modes';
import { renderFrame } from '@/engine/render/compositor';
import type { SceneAnalysis } from '@/engine/render/exposure';
import { createParticleField } from '@/engine/render/particles';
import { createViewport } from '@/engine/transform/viewport';
import type { FaceState } from '@/engine/vision/types';
import { drawSeam, drawSignature, drawStock, posterLayout } from './poster';

/**
 * Renders the portrait the visitor takes away.
 *
 * Quality-first rather than realtime: one frame, at the largest size the camera can
 * actually justify, with every pass forced to the high tier. The live view never needs
 * to run at this size, which is the whole reason for having two render paths
 * (docs/PLAN.md §32).
 */

/**
 * The track resolution is a hard ceiling (docs/PLAN.md R1). Upscaling past it does not
 * add detail, it just makes a soft, heavy file — so the poster is sized from the camera,
 * capped for sanity, and never invented.
 */
const MAX_PHOTO_WIDTH = 1800;

export interface CaptureOptions {
  video: HTMLVideoElement;
  face: FaceState;
  mode: ArtMode;
  scene: SceneAnalysis;
  /** The aspect the visitor is actually looking at, so the print matches the screen. */
  aspect: number;
  reducedMotion: boolean;
  /** Same seed as the live view, so the print carries the same words. */
  sessionSeed: number;
}

export interface CapturedPortrait {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export function renderPortrait(options: CaptureOptions): CapturedPortrait {
  const { video, mode, aspect } = options;

  // Size from the camera, not from the screen.
  const sourceLimit = Math.max(video.videoWidth, 640);
  const photoWidth = Math.min(MAX_PHOTO_WIDTH, sourceLimit);
  const photoHeight = Math.round(photoWidth / aspect);

  const layout = posterLayout(photoWidth, photoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, width: layout.width, height: layout.height };

  drawStock(ctx, layout);

  // The photo is rendered into its own canvas, then placed. Rendering straight into the
  // poster would force every pass to reason about the paper margins.
  const photo = document.createElement('canvas');
  const photoCtx = photo.getContext('2d');
  if (photoCtx) {
    const viewport = createViewport({
      sourceWidth: video.videoWidth,
      sourceHeight: video.videoHeight,
      width: photoWidth,
      height: photoHeight,
      // Already at full resolution; a device pixel ratio on top would double it again.
      devicePixelRatio: 1,
      mirrored: true,
    });

    renderFrame(photo, photoCtx, {
      video,
      face: options.face,
      viewport,
      mode,
      // A fresh, empty field: the sparkle in the live view is a reaction to a moment,
      // and freezing whatever happened to be on screen into the print would be noise.
      particles: createParticleField('high'),
      progress: 1,
      // A fixed time, so film burns and dust land in a composed position rather than
      // wherever the animation happened to be at the instant of the click.
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
  drawSignature(ctx, layout);

  return { canvas, width: layout.width, height: layout.height };
}

/**
 * JPEG rather than PNG, deliberately against the blueprint (§63).
 *
 * The identical poster measures 2.45MB as a PNG and 0.19MB as a quality-0.92 JPEG —
 * thirteen times the weight for a photograph nobody will pixel-inspect, on a file whose
 * whole purpose is to be saved and shared from a phone. PNG earns its size on flat
 * graphics; this is a photo with film grain, which is the worst case for it.
 */
export async function toImageBlob(
  canvas: HTMLCanvasElement,
  type = 'image/jpeg',
  quality = 0.92,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}
