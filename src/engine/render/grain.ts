import type { Viewport } from '@/engine/transform/viewport';
import { mulberry32 } from '@/lib/rng';

/**
 * Film grain, drawn once into an offscreen tile and then tiled.
 *
 * Generating noise per frame at full canvas size means writing a million pixels 60 times
 * a second on the main thread — it is the single most expensive naive thing this
 * renderer could do. A 128px tile costs that once, and tiling it is a GPU blit.
 *
 * Grain matters more than it sounds: it is what stops crisp vector strokes from floating
 * above a noisy camera image like a sticker. It puts both on the same paper.
 */

const TILE = 128;
let tile: HTMLCanvasElement | null = null;

function grainTile(): HTMLCanvasElement {
  if (tile) return tile;

  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const image = ctx.createImageData(TILE, TILE);
  const random = mulberry32(0x5eed);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 128 + (random() * 2 - 1) * 127;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  tile = canvas;
  return canvas;
}

export function drawGrain(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  strength: number,
): void {
  if (strength <= 0) return;
  const pattern = ctx.createPattern(grainTile(), 'repeat');
  if (!pattern) return;

  ctx.save();
  ctx.globalAlpha = strength;
  // Overlay keeps mid-grey neutral, so grain adds texture without washing the image out.
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.restore();
}
