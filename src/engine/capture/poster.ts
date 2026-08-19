import { SIGNATURE } from '@/content/copy';

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
 * The signature, in the bottom band.
 *
 * Set in an italic serif and rotated very slightly: a real hand does not write level, and
 * a perfectly horizontal line here immediately reads as a watermark rather than an
 * autograph. A proper hand-drawn SVG signature replaces this once Siva draws one — the
 * blueprint asks for it, and no web font is loaded for this route on purpose.
 */
export function drawSignature(ctx: CanvasRenderingContext2D, layout: PosterLayout): void {
  const { photo, height, width } = layout;
  const bandTop = photo.y + photo.height;
  const bandHeight = height - bandTop;
  const size = Math.round(bandHeight * 0.28);

  ctx.save();
  ctx.translate(photo.x, bandTop + bandHeight * 0.58);
  ctx.rotate(-0.018);
  ctx.fillStyle = 'rgba(42, 36, 28, 0.86)';
  ctx.font = `italic ${size}px "Segoe Script", "Bradley Hand", "Snell Roundhand", Georgia, serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(SIGNATURE, 0, 0);
  ctx.restore();

  // A faint pencil rule under the signature, as if the stock were lightly scored.
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#4a4034';
  ctx.lineWidth = Math.max(1, width * 0.001);
  ctx.beginPath();
  ctx.moveTo(photo.x, bandTop + bandHeight * 0.78);
  ctx.lineTo(photo.x + photo.width * 0.42, bandTop + bandHeight * 0.78);
  ctx.stroke();
  ctx.restore();
}
