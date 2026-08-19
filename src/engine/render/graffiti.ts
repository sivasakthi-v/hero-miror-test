import { ambient as AMBIENT_LINES } from '@/content/copy';
import type { ArtMode } from '@/content/art-modes';
import { projectNormalized, type Viewport } from '@/engine/transform/viewport';
import type { FaceState } from '@/engine/vision/types';
import { hashSeed, mulberry32 } from '@/lib/rng';

/**
 * Graffiti: bold hand-set words around the edges of the picture (blueprint §35).
 *
 * Drawn *into* the canvas rather than as DOM around it, for one decisive reason: it has
 * to be in the photograph the visitor keeps. Anything positioned in HTML outside the
 * frame is invisible to the capture renderer, and a keepsake missing half the artwork is
 * the wrong artefact.
 *
 * Two rules make it read as graffiti rather than as a caption:
 *  - It sits at the edges and never over the face. A word across someone's eyes is
 *    vandalism of the person, not decoration of the picture.
 *  - It is set heavy and rotated, with a knocked-out shadow behind it, so it reads as
 *    paint on the surface rather than a label floating above it.
 */

export interface GraffitiPiece {
  text: string;
  /** Normalised position in the aperture, 0..1. */
  x: number;
  y: number;
  rotation: number;
  /** Size as a fraction of the aperture width. */
  scale: number;
  align: CanvasTextAlign;
}

/**
 * Layout per aspect. Landscape has room down both sides; portrait has to work top and
 * bottom, because the sides are where the person is.
 */
function layoutFor(viewport: Viewport, seed: number): GraffitiPiece[] {
  const random = mulberry32(seed);
  const lines = [...AMBIENT_LINES];
  const pick = (): string => {
    const index = Math.floor(random() * lines.length) % lines.length;
    return lines.splice(index, 1)[0] ?? 'THERE YOU ARE';
  };

  const landscape = viewport.width / viewport.height > 1.15;

  if (landscape) {
    return [
      { text: pick(), x: 0.045, y: 0.16, rotation: -0.05, scale: 0.075, align: 'left' },
      { text: pick(), x: 0.955, y: 0.44, rotation: 0.04, scale: 0.062, align: 'right' },
      { text: pick(), x: 0.05, y: 0.82, rotation: -0.03, scale: 0.055, align: 'left' },
    ];
  }

  return [
    { text: pick(), x: 0.5, y: 0.085, rotation: -0.03, scale: 0.085, align: 'center' },
    { text: pick(), x: 0.5, y: 0.93, rotation: 0.025, scale: 0.07, align: 'center' },
  ];
}

/** Cached per aperture shape, so words do not reshuffle every frame. */
let cache: { key: string; pieces: GraffitiPiece[] } | null = null;

function pieces(viewport: Viewport, sessionSeed: number): GraffitiPiece[] {
  const key = `${Math.round(viewport.width)}x${Math.round(viewport.height)}:${sessionSeed}`;
  if (cache?.key === key) return cache.pieces;
  cache = { key, pieces: layoutFor(viewport, sessionSeed + hashSeed(key)) };
  return cache.pieces;
}

/**
 * A soft box around the face, in aperture pixels. Graffiti that would overlap it is
 * skipped rather than moved — a word that jumps aside as someone leans is far more
 * distracting than a word that simply is not there.
 */
function faceBox(face: FaceState, viewport: Viewport): { x: number; y: number; w: number; h: number } | null {
  if (!face.present || !face.anchors) return null;
  const forehead = projectNormalized(face.anchors.forehead, viewport);
  const chin = projectNormalized(face.anchors.chin, viewport);
  const left = projectNormalized(face.anchors.leftJaw, viewport);
  const right = projectNormalized(face.anchors.rightJaw, viewport);
  const x = Math.min(left.x, right.x);
  const w = Math.abs(right.x - left.x);
  const y = Math.min(forehead.y, chin.y);
  const h = Math.abs(chin.y - forehead.y);
  // Generous padding: near-misses read as collisions.
  return { x: x - w * 0.35, y: y - h * 0.3, w: w * 1.7, h: h * 1.6 };
}

export function drawGraffiti(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  mode: ArtMode,
  face: FaceState,
  options: { progress: number; time: number; sessionSeed: number; reducedMotion: boolean },
): void {
  const list = pieces(viewport, options.sessionSeed);
  const box = faceBox(face, viewport);
  const { width, height } = viewport;

  ctx.save();
  ctx.globalAlpha = Math.min(options.progress, 1);

  for (const [index, piece] of list.entries()) {
    const size = Math.round(width * piece.scale);
    const x = piece.x * width;
    // Each piece drifts on its own slow period, so the group never moves as a block.
    const bob = options.reducedMotion ? 0 : Math.sin(options.time / (2600 + index * 700)) * size * 0.05;
    const y = piece.y * height + bob;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(piece.rotation);
    ctx.textAlign = piece.align;
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px "Instrument Sans", system-ui, sans-serif`;

    // Skip anything that would land on the face.
    const metrics = ctx.measureText(piece.text);
    if (box) {
      const halfWidth = metrics.width / 2;
      const centreX = piece.align === 'left' ? x + halfWidth : piece.align === 'right' ? x - halfWidth : x;
      const overlaps =
        centreX + halfWidth > box.x &&
        centreX - halfWidth < box.x + box.w &&
        y + size / 2 > box.y &&
        y - size / 2 < box.y + box.h;
      if (overlaps) {
        ctx.restore();
        continue;
      }
    }

    // Knocked-out shadow first: it is what lifts the word off a busy photograph and
    // keeps it legible over both a bright wall and a dark curtain.
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.strokeText(piece.text, 0, 0);

    ctx.fillStyle = mode.accent;
    ctx.fillText(piece.text, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}
