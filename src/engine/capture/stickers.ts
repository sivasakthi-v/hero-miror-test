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
  { x: 0.09, y: 0.07, rotation: -0.22 }, // top-left corner
  { x: 0.91, y: 0.09, rotation: 0.18 }, // top-right corner
  { x: 0.5, y: 0.035, rotation: 0.05 }, // straddling the top edge
  { x: 0.06, y: 0.42, rotation: -0.3 }, // left edge, mid-height
  { x: 0.94, y: 0.5, rotation: 0.26 }, // right edge, mid-height
];

/**
 * Exactly one sticker, placed where it cannot touch the caption.
 *
 * One, because two competed with each other and with the words; the print is a picture
 * with a message on it, not a scrapbook page. The caption band is passed in and treated
 * as forbidden rather than merely avoided — a lovely line half-covered by lettering is
 * worse than no lettering at all.
 */
export async function pickSticker(
  layout: PosterLayout,
  forbidden: { x: number; y: number; width: number; height: number },
  random: () => number,
): Promise<StickerPlacement | null> {
  const names = [...STICKERS];
  const anchors = [...ANCHORS];

  // Try anchors until one clears the caption; the list is ordered so this almost always
  // succeeds first time, and giving up is better than printing over the words.
  while (anchors.length > 0) {
    const anchor = anchors.splice(Math.floor(random() * anchors.length), 1)[0];
    const name = names[Math.floor(random() * names.length)];
    if (!anchor || !name) break;

    const image = await loadSticker(name);
    if (!image) continue;

    // Sized against the poster, so a sticker carries the same visual weight at any
    // capture resolution. Aspect preserved — this is lettering, and stretched lettering
    // is immediately obvious.
    const width = layout.width * (0.26 + random() * 0.12);
    const aspect = image.naturalHeight / image.naturalWidth || 0.56;
    const height = width * aspect;
    const x = layout.width * anchor.x - width / 2;
    const y = layout.height * anchor.y - height / 2;

    const clearsCaption =
      y + height < forbidden.y + forbidden.height * 0.1 ||
      x + width < forbidden.x ||
      x > forbidden.x + forbidden.width;

    if (!clearsCaption) continue;

    return {
      image,
      x,
      y,
      width,
      height,
      rotation: anchor.rotation + (random() - 0.5) * 0.1,
    };
  }

  return null;
}

export function drawSticker(
  ctx: CanvasRenderingContext2D,
  sticker: StickerPlacement,
  offset: { x: number; y: number },
): void {
  {
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
