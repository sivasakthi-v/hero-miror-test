import type { ArtMode } from '@/content/art-modes';
import { backingSize, type Viewport } from '@/engine/transform/viewport';
import type { FaceState } from '@/engine/vision/types';
import { drawDebugFace } from './debug-overlay';
import type { SceneAnalysis } from './exposure';
import { drawDitherAscii } from './dither';
import { drawGraffiti } from './graffiti';
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
  scene: SceneAnalysis;
  /** Keeps graffiti wording stable for a visit. */
  sessionSeed: number;
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
    // Debug shows the exposure-corrected photo with no look applied, so the overlay is
    // read against the true image rather than a graded one.
    drawPhoto(ctx, options.video, {
      mode: {
        ...options.mode,
        grade: { contrast: 1, saturate: 1, brightness: 1, hueRotate: 0, lift: 0, liftColor: '#000' },
        passes: {
          ...options.mode.passes,
          bloom: 0, halation: 0, duotone: null, tintAlpha: 0,
          diffusion: 0, film: 0, vignette: 0, grain: 0, faceClarity: 0,
        },
      },
      viewport,
      tier: options.tier,
      scene: options.scene,
      face: options.face,
      time: options.time,
      reducedMotion: options.reducedMotion,
    });
    ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
    drawDebugFace(ctx, options.face, viewport);
    return;
  }

  // Layer 01-05: the photograph and its treatment.
  drawPhoto(ctx, options.video, {
    mode: options.mode,
    viewport,
    tier: options.tier,
    scene: options.scene,
    face: options.face,
    time: options.time,
    reducedMotion: options.reducedMotion,
  });

  // Layer 06: graffiti. Inside the canvas on purpose — anything drawn in HTML around
  // the frame would be missing from the portrait the visitor keeps.
  drawGraffiti(ctx, viewport, options.mode, options.face, {
    progress: options.progress,
    time: options.time,
    sessionSeed: options.sessionSeed,
    reducedMotion: options.reducedMotion,
  });

  // Layer 07: reactions, above the photo but inside the frame.
  ctx.save();
  ctx.globalAlpha = options.progress;
  options.particles.draw(ctx);
  ctx.restore();

  // Layer 08: surface texture, last, so it sits on the finished image rather than under
  // it — grain first, then the dither and character grids over everything.
  if (options.tier !== 'lite' && options.mode.passes.grain > 0) {
    drawGrain(ctx, viewport, options.mode.passes.grain);
  }
  drawDitherAscii(ctx, viewport, {
    dither: options.mode.passes.dither,
    ascii: options.mode.passes.ascii,
    tier: options.tier,
  });
}
