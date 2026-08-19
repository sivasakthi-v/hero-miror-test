import { captionText, type Caption } from '@/content/copy';

/**
 * The polaroid the visitor keeps.
 *
 * The frame on screen is CSS; this redraws it in canvas pixels, because a downloaded PNG
 * has to carry the object with it. They are two implementations of one design, so the
 * proportions live here as named constants and both were tuned to match.
 *
 * The deep bottom border is the whole point — it is what makes a white rectangle read as
 * a polaroid, and it is where the signature goes, exactly where someone would write on a
 * real one.
 */

/** Border widths as a fraction of the photo's width. */
const SIDE = 0.075;
const TOP = 0.075;
const BOTTOM = 0.235;

export interface PosterLayout {
  width: number;
  height: number;
  photo: { x: number; y: number; width: number; height: number };
}

export function posterLayout(photoWidth: number, photoHeight: number): PosterLayout {
  const side = Math.round(photoWidth * SIDE);
  const top = Math.round(photoWidth * TOP);
  const bottom = Math.round(photoWidth * BOTTOM);
  return {
    width: photoWidth + side * 2,
    height: photoHeight + top + bottom,
    photo: { x: side, y: top, width: photoWidth, height: photoHeight },
  };
}

/** The stock, drawn behind the photo. */
export function drawStock(ctx: CanvasRenderingContext2D, layout: PosterLayout): void {
  const { width, height } = layout;

  // Warm, unevenly lit paper rather than flat white — flat white reads as a PNG border.
  const gradient = ctx.createLinearGradient(0, 0, width * 0.6, height);
  gradient.addColorStop(0, '#fffdf7');
  gradient.addColorStop(0.55, '#f6f1e6');
  gradient.addColorStop(1, '#eae3d5');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** The seam where the emulsion sits below the surface of the stock. */
export function drawSeam(ctx: CanvasRenderingContext2D, layout: PosterLayout): void {
  const { photo } = layout;
  ctx.save();
  ctx.strokeStyle = 'rgba(60, 52, 38, 0.5)';
  ctx.lineWidth = Math.max(1, layout.width * 0.0015);
  ctx.strokeRect(photo.x - 1, photo.y - 1, photo.width + 2, photo.height + 2);

  // A soft inner shadow along the top edge, where the stock overhangs the picture.
  const shadow = ctx.createLinearGradient(0, photo.y, 0, photo.y + photo.height * 0.06);
  shadow.addColorStop(0, 'rgba(0,0,0,0.35)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(photo.x, photo.y, photo.width, photo.height * 0.06);
  ctx.restore();
}


/**
 * The band below the photo, where the caption lives. Exported because the sticker
 * placement needs to know exactly where not to go.
 */
export function captionBand(layout: PosterLayout): { x: number; y: number; width: number; height: number } {
  const top = layout.photo.y + layout.photo.height;
  return { x: layout.photo.x, y: top, width: layout.photo.width, height: layout.height - top };
}

/**
 * The caption, centred in the bottom band.
 *
 * The size is *measured down* until the line fits rather than set and hoped for. These
 * lines vary from 18 to 46 characters, and a fixed size that suits the shortest one runs
 * off the edge of the longest — which does not just look bad, it breaks the illusion of
 * a physical object.
 */
export function drawCaption(
  ctx: CanvasRenderingContext2D,
  layout: PosterLayout,
  caption: Caption,
): void {
  const band = captionBand(layout);
  const text = captionText(caption);

  // Never wider than the photo, with real breathing room at both ends.
  const maxWidth = band.width * 0.88;
  let size = Math.round(band.height * 0.3);
  const minSize = Math.round(band.height * 0.12);

  const measure = (px: number): number => {
    ctx.font = `${px}px "Instrument Sans", system-ui, sans-serif`;
    return ctx.measureText(text).width;
  };

  while (size > minSize && measure(size) > maxWidth) size -= 1;

  // One weight throughout. Setting the name bold pulled the eye to the sender when the
  // whole point of the line is the message.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${size}px "Instrument Sans", system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(38, 32, 24, 0.9)';
  ctx.fillText(text, band.x + band.width / 2, band.y + band.height * 0.44);
  ctx.restore();

  // The credit: caps, tracked, and darker than it was. It is the only permanent mark on
  // the print, and set quietly in lowercase italic it read as a printing artefact.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(size * 0.5)}px "Instrument Sans", system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(52, 44, 34, 0.85)';
  // letterSpacing is not in every canvas implementation yet; the line simply sets
  // untracked where it is missing rather than failing.
  ctx.letterSpacing = `${(size * 0.06).toFixed(1)}px`;
  ctx.fillText('SIVA SERAFINO · 2026', band.x + band.width / 2, band.y + band.height * 0.76);
  ctx.letterSpacing = '0px';
  ctx.restore();
}
