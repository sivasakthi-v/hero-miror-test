import type { Viewport } from '@/engine/transform/viewport';
import { mulberry32 } from '@/lib/rng';

/**
 * Film damage: burns, dust, scratches, and the warm bleed real film gets around bright
 * edges.
 *
 * Two rules keep this from looking like a broken video rather than a treatment:
 *
 *  1. Nothing strobes. Every artifact moves on its own slow clock — burns drift over
 *     seconds, scratches appear for a few frames and are gone for several more. Random
 *     per-frame noise reads as a decoding fault, not as film.
 *  2. Nothing lands on the face. The caller composites a clean face back afterwards
 *     (see faceClarity), because damage across someone's eyes is the fastest way to make
 *     a person feel the effect is doing something *to* them.
 */

interface Burn {
  x: number;
  y: number;
  radius: number;
  drift: number;
  phase: number;
}

/** Fixed per session: the same roll of film for the whole visit. */
let burns: Burn[] | null = null;
let dust: { x: number; y: number; r: number; phase: number }[] | null = null;

function ensureFilm(): void {
  if (burns && dust) return;
  const random = mulberry32(0xf11a);
  burns = Array.from({ length: 3 }, () => ({
    x: random(),
    y: random(),
    radius: 0.18 + random() * 0.3,
    drift: 0.4 + random() * 0.8,
    phase: random() * Math.PI * 2,
  }));
  dust = Array.from({ length: 26 }, () => ({
    x: random(),
    y: random(),
    r: 0.5 + random() * 1.6,
    phase: random() * 100,
  }));
}

/**
 * Warm bleed around highlights. Real film halation is light scattering back off the
 * base layer, so it comes from the *bright* parts of the image — hence the brightness
 * threshold before the blur rather than a flat glow over everything.
 */
let halationCanvas: HTMLCanvasElement | null = null;

export function drawHalation(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  strength: number,
): void {
  if (strength <= 0) return;
  const w = Math.max(1, Math.round(viewport.width / 3));
  const h = Math.max(1, Math.round(viewport.height / 3));

  halationCanvas ??= document.createElement('canvas');
  if (halationCanvas.width !== w || halationCanvas.height !== h) {
    halationCanvas.width = w;
    halationCanvas.height = h;
  }
  const hctx = halationCanvas.getContext('2d');
  if (!hctx) return;

  hctx.clearRect(0, 0, w, h);
  // Isolate highlights, then bleed them.
  hctx.filter = 'brightness(1.5) contrast(2.4) saturate(0.6) blur(7px)';
  hctx.drawImage(ctx.canvas, 0, 0, w, h);
  hctx.filter = 'none';

  // Tint the bleed warm — halation on colour stock is orange-red, never neutral.
  hctx.globalCompositeOperation = 'multiply';
  hctx.fillStyle = 'rgb(255, 150, 90)';
  hctx.fillRect(0, 0, w, h);
  hctx.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = strength * 0.7;
  ctx.drawImage(halationCanvas, 0, 0, viewport.width, viewport.height);
  ctx.restore();
}

export function drawFilmArtifacts(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  strength: number,
  time: number,
): void {
  if (strength <= 0) return;
  ensureFilm();
  const { width, height } = viewport;

  // ---- burns: soft warm blooms that drift and breathe -------------------------
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const burn of burns!) {
    // Two different periods per burn, so they never pulse in unison.
    const t = time / 1000;
    const x = (burn.x + Math.sin(t * 0.11 * burn.drift + burn.phase) * 0.06) * width;
    const y = (burn.y + Math.cos(t * 0.09 * burn.drift + burn.phase) * 0.05) * height;
    const radius = burn.radius * Math.max(width, height) * (0.9 + Math.sin(t * 0.2 + burn.phase) * 0.1);
    const breath = 0.16 + 0.1 * Math.sin(t * 0.27 + burn.phase);

    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(255, 176, 92, ${breath * strength})`);
    gradient.addColorStop(0.45, `rgba(220, 110, 50, ${breath * strength * 0.35})`);
    gradient.addColorStop(1, 'rgba(180, 60, 20, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();

  // ---- scratch: a single vertical line, present only occasionally ---------------
  // Quantised to ~1.5s blocks so a scratch persists for a moment instead of flickering
  // on and off every frame, which is what makes it read as a scratch at all.
  const block = Math.floor(time / 1500);
  const scratchRandom = mulberry32(block);
  if (scratchRandom() < 0.35) {
    const x = scratchRandom() * width;
    const wobble = Math.sin(time / 120) * 0.6;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.13 * strength;
    ctx.strokeStyle = 'rgb(255, 235, 200)';
    ctx.lineWidth = 0.8 + scratchRandom();
    ctx.beginPath();
    ctx.moveTo(x + wobble, 0);
    ctx.lineTo(x - wobble, height);
    ctx.stroke();
    ctx.restore();
  }

  // ---- dust: specks that hold for a few frames, then move ----------------------
  const dustBlock = Math.floor(time / 220);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = 'rgba(255, 245, 225, 0.5)';
  for (const speck of dust!) {
    // Each speck is visible only in some blocks, so the field keeps changing shape.
    if ((dustBlock + Math.floor(speck.phase)) % 7 > 2) continue;
    ctx.globalAlpha = 0.4 * strength;
    ctx.beginPath();
    ctx.arc(speck.x * width, speck.y * height, speck.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Gate weave: the tiny vertical drift of film through a projector. A couple of pixels,
 * applied to the whole frame — invisible as an effect, but its absence is what makes
 * digital footage feel locked to the screen.
 */
export function gateWeave(time: number, strength: number): { x: number; y: number } {
  if (strength <= 0) return { x: 0, y: 0 };
  return {
    x: Math.sin(time / 700) * 0.7 * strength,
    y: Math.cos(time / 530) * 1.1 * strength,
  };
}
