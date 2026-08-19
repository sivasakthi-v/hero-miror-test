import type { ArtMode } from '@/content/art-modes';
import { backingSize, type Viewport } from '@/engine/transform/viewport';
import type { FaceState } from '@/engine/vision/types';
import { drawDebugFace } from './debug-overlay';
import { drawGrain } from './grain';
import type { ParticleField } from './particles';
import { drawPhoto } from './photo';

/**
 * The layer stack (docs/PLAN.md §3, blueprint §31). One entry point, so the live view and
 * the capture renderer cannot drift apart — capture calls this with a bigger viewport and
 * gets the same picture.
 *
 * The camera is drawn *into* this canvas rather than sitting underneath as a DOM element.
 * That is what makes the whole treatment possible: grade, duotone, bloom, vignette and
 * grain all operate on pixels, and a canvas can only blend with pixels it owns.
 */

export type QualityTier = 'high' | 'balanced' | 'lite';

export interface FrameOptions {
  video: HTMLVideoElement;
  face: FaceState;
  viewport: Viewport;
  mode: ArtMode;
  particles: ParticleField;
  /** 0..1 reveal of the treatment, so the edit arrives rather than snapping on. */
  progress: number;
  time: number;
  reducedMotion: boolean;
  tier: QualityTier;
  debug: boolean;
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

  // Work in CSS pixels from here down; the backing store handles the rest.
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);

  if (options.debug) {
    drawPhoto(ctx, options.video, {
      grade: { ...options.mode.grade, filter: 'none', duotone: null, bloom: 0, tintAlpha: 0, vignette: 0, posterize: 0, grain: 0 },
      viewport,
      tier: options.tier,
    });
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    drawDebugFace(ctx, options.face, viewport);
    return;
  }

  // Layer 01-05: the photograph and its treatment.
  drawPhoto(ctx, options.video, { grade: options.mode.grade, viewport, tier: options.tier });

  // Layer 06: reactions, above the photo but inside the frame.
  ctx.save();
  ctx.globalAlpha = options.progress;
  options.particles.draw(ctx);
  ctx.restore();

  // Layer 07: grain, last, so it sits on the finished image like film rather than under it.
  if (options.tier !== 'lite' && options.mode.grade.grain > 0) {
    drawGrain(ctx, viewport, options.mode.grade.grain);
  }
}
