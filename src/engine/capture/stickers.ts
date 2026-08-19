import { mulberry32 } from '@/lib/rng';
import type { PosterLayout } from './poster';

/**
 * Siva's graffiti, stuck onto the polaroid at the moment of capture.
 *
 * They are placed on the *frame*, overhanging its edge, rather than over the photograph.
 * A word across someone's face is vandalism of the person; a sticker slapped on the
 * white border is what people actually do to a polaroid. The overhang is the detail that
 * sells it — a sticker that stops neatly at the edge looks printed on.
 *
 * Only ever applied to the captured print, never to the live view. Watching stickers
 * appear and disappear while you move would be noise; finding them on the picture you
 * just took is a small gift.
 */

const STICKERS = ['art', 'damn', 'fire', 'slay'] as const;

const cache = new Map<string, HTMLImageElement>();

function url(name: string): string {
  return `${import.meta.env.BASE_URL}stickers/${name}.svg`;
}

/**
 * SVG has to be decoded into an <img> before canvas will draw it, and that is async.
 * Preloading at idle means the shutter never waits on a network round trip.
 */
export async function loadSticker(name: string): Promise<HTMLImageElement | null> {
  const cached = cache.get(name);
  if (cached) return cached;

  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      cache.set(name, image);
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = url(name);
  });
}

export function preloadStickers(): void {
  for (const name of STICKERS) void loadSticker(name);
}

export interface StickerPlacement {
  image: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/**
 * Anchors on the polaroid's edges. Each is a point the sticker straddles, so part of it
 * lands on the stock and part hangs into the transparent margin.
 */
const ANCHORS = [
  { x: 0.08, y: 0.06, rotation: -0.22 }, // top-left corner
  { x: 0.92, y: 0.08, rotation: 0.18 }, // top-right corner
  { x: 0.9, y: 0.9, rotation: -0.12 }, // bottom-right, over the wide band
  { x: 0.12, y: 0.93, rotation: 0.14 }, // bottom-left, over the wide band
  { x: 0.5, y: 0.03, rotation: 0.05 }, // straddling the top edge
];

/**
 * One or two, never more. Three starts to look like a sticker sheet rather than a
 * decision, and the photograph stops being the subject.
 */
export async function pickStickers(
  layout: PosterLayout,
  seed: number,
): Promise<StickerPlacement[]> {
  const random = mulberry32(seed);
  const count = random() < 0.45 ? 1 : 2;

  const names = [...STICKERS];
  const anchors = [...ANCHORS];
  const placements: StickerPlacement[] = [];

  for (let i = 0; i < count; i++) {
    const name = names.splice(Math.floor(random() * names.length), 1)[0];
    const anchor = anchors.splice(Math.floor(random() * anchors.length), 1)[0];
    if (!name || !anchor) break;

    const image = await loadSticker(name);
    if (!image) continue;

    // Sized against the poster, so a sticker is the same visual weight at any capture
    // resolution. The natural aspect is preserved — these are lettering, and stretching
    // lettering is immediately obvious.
    const width = layout.width * (0.3 + random() * 0.16);
    const aspect = image.naturalHeight / image.naturalWidth || 0.56;
    const height = width * aspect;

    placements.push({
      image,
      x: layout.width * anchor.x - width / 2,
      y: layout.height * anchor.y - height / 2,
      width,
      height,
      rotation: anchor.rotation + (random() - 0.5) * 0.1,
    });
  }

  return placements;
}

export function drawStickers(
  ctx: CanvasRenderingContext2D,
  placements: StickerPlacement[],
  offset: { x: number; y: number },
): void {
  for (const sticker of placements) {
    ctx.save();
    const cx = offset.x + sticker.x + sticker.width / 2;
    const cy = offset.y + sticker.y + sticker.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(sticker.rotation);

    // A soft drop shadow: the sticker sits on top of the print, not inside it.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = sticker.width * 0.03;
    ctx.shadowOffsetY = sticker.width * 0.012;

    ctx.drawImage(
      sticker.image,
      -sticker.width / 2,
      -sticker.height / 2,
      sticker.width,
      sticker.height,
    );
    ctx.restore();
  }
}
