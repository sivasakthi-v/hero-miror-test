import type { ArtMode } from '@/content/art-modes';
import { backingSize, type Viewport } from '@/engine/transform/viewport';
import type { FaceState } from '@/engine/vision/types';
import { drawDebugFace } from './debug-overlay';
import { drawFaceArt } from './face-art';
import { drawGrain } from './grain';

/**
 * The layer stack (docs/PLAN.md §3, blueprint §31). One entry point, so the live view and
 * the capture renderer cannot drift apart — capture calls this with a bigger viewport and
 * gets the same picture.
 *
 * The camera itself is not drawn here in the live path: it is a <video> underneath, which
 * the browser composites for free. Capture will draw it in explicitly.
 */

export type QualityTier = 'high' | 'balanced' | 'lite';

export interface FrameOptions {
  face: FaceState;
  viewport: Viewport;
  mode: ArtMode;
  /** 0..1 reveal of the whole drawing. */
  progress: number;
  time: number;
  reducedMotion: boolean;
  tier: QualityTier;
  debug: boolean;
  /**
   * True only for capture, where the photo is drawn into this canvas.
   *
   * Grain has to blend *with the photo*, and canvas composite operations only blend
   * within their own canvas — live, the video is a separate DOM layer underneath, so
   * "overlay" grain there is not overlaying anything. It just lays translucent grey
   * haze across the whole aperture and dulls the image. So the live path skips it and
   * capture, which owns the pixels, gets the real thing.
   */
  photoInCanvas?: boolean;
}

export function renderFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  options: FrameOptions,
): void {
  const { viewport } = options;
  const { width, height } = backingSize(viewport);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (options.debug) {
    drawDebugFace(ctx, options.face, viewport);
    return;
  }

  // Work in CSS pixels from here down; the backing store handles the rest.
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);

  drawFaceArt(ctx, options.face, viewport, {
    mode: options.mode,
    progress: options.progress,
    time: options.time,
    reducedMotion: options.reducedMotion,
    tier: options.tier,
  });

  // Grain sits above the drawing so it unifies the marks with the photo underneath —
  // which only means anything when the photo is in this canvas. See `photoInCanvas`.
  if (options.photoInCanvas && options.tier !== 'lite' && options.mode.grain > 0) {
    drawGrain(ctx, viewport, options.mode.grain);
  }
}
