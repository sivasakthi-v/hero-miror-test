import type { Viewport } from '@/engine/transform/viewport';
import type { QualityTier } from './compositor';

/**
 * A whisper of dither and ASCII over every look.
 *
 * Both are deliberately near-invisible. Full ordered dithering or a real ASCII render
 * would destroy a face, and the face is the one thing the whole pipeline protects. At
 * these strengths they do something subtler and more useful: they put a fine, regular
 * structure across the image that reads as *process* — the sense that the picture has
 * been through something — without costing any of the detail.
 *
 * Both layers are drawn once into small tiles and then repeated. Regenerating either
 * per frame would mean writing hundreds of thousands of pixels on the main thread every
 * frame; tiling is a blit.
 */

const DITHER_TILE = 8;
const ASCII_CELL = 7;

let ditherTile: HTMLCanvasElement | null = null;
let asciiTile: HTMLCanvasElement | null = null;

/**
 * A 4×4 Bayer matrix, the classic ordered-dither threshold pattern. Rendered as a
 * gentle light/dark grid rather than used to quantise, so it modulates the image
 * instead of posterising it.
 */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function getDitherTile(): HTMLCanvasElement {
  if (ditherTile) return ditherTile;
  const canvas = document.createElement('canvas');
  canvas.width = DITHER_TILE;
  canvas.height = DITHER_TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const image = ctx.createImageData(DITHER_TILE, DITHER_TILE);
  for (let y = 0; y < DITHER_TILE; y++) {
    for (let x = 0; x < DITHER_TILE; x++) {
      const value = (BAYER[y % 4]![x % 4]! / 15) * 255;
      const i = (y * DITHER_TILE + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  ditherTile = canvas;
  return canvas;
}

/**
 * The ASCII layer is a grid of glyphs, not a per-pixel character map. A true ASCII
 * render samples luminance and picks a character per cell — that means reading the
 * whole frame back from the GPU every frame, which is the single most expensive thing
 * this renderer could do (measured at 68ms elsewhere). This gets the texture of
 * characters for the cost of one repeating tile.
 */
function getAsciiTile(): HTMLCanvasElement {
  if (asciiTile) return asciiTile;
  const size = ASCII_CELL * 6;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const glyphs = ['.', ':', '-', '=', '+', '*', '#', '%', '@', ' ', '/', '\\'];
  ctx.font = `${ASCII_CELL - 1}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

  let index = 0;
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const glyph = glyphs[index % glyphs.length]!;
      index += 1;
      ctx.fillText(glyph, x * ASCII_CELL + ASCII_CELL / 2, y * ASCII_CELL + ASCII_CELL / 2);
    }
  }
  asciiTile = canvas;
  return canvas;
}

export interface DitherOptions {
  dither: number;
  ascii: number;
  tier: QualityTier;
}

export function drawDitherAscii(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  options: DitherOptions,
): void {
  if (options.tier === 'lite') return;
  const { width, height } = viewport;

  if (options.dither > 0) {
    const pattern = ctx.createPattern(getDitherTile(), 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = options.dither;
      // Overlay keeps mid-grey neutral, so the pattern modulates light and shadow
      // rather than veiling the whole image.
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  if (options.ascii > 0) {
    const pattern = ctx.createPattern(getAsciiTile(), 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalAlpha = options.ascii;
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
}
