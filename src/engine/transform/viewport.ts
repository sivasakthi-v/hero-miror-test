/**
 * The one coordinate transform. docs/PLAN.md R3.
 *
 * Everything that draws — the live compositor, the capture renderer, the debug overlay —
 * goes through this module. If two of them ever compute the mapping separately, the
 * artwork drifts off the face on one aspect ratio only, and that bug is miserable to
 * find because it looks correct on the machine you developed on.
 *
 * The chain, in order:
 *
 *     source frame (e.g. 1920×1080)
 *        │  cover-crop into the aperture's aspect (3:2 desktop, 4:5 mobile)
 *        ▼
 *     crop rect in source pixels
 *        │  normalise to 0..1 within the crop
 *        ▼
 *        │  mirror, because the visitor expects a mirror
 *        ▼
 *     aperture pixels
 *
 * MediaPipe reports landmarks normalised against the *full* source frame, not the crop,
 * so `projectNormalized` starts from that and applies the whole chain.
 */

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface Viewport {
  /** Natural size of the video frame. */
  sourceWidth: number;
  sourceHeight: number;
  /** The part of the source that survives the cover-crop. */
  crop: CropRect;
  /** Aperture size in CSS pixels. */
  width: number;
  height: number;
  /** Backing-store scale, capped — see createViewport. */
  dpr: number;
  mirrored: boolean;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * The largest centred rectangle of `target`'s aspect ratio that fits inside the source.
 * Identical in behaviour to CSS `object-fit: cover`, which is what the <video> element
 * uses in P1 — so the DOM preview and the canvas renderer agree by construction.
 */
export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CropRect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(sourceWidth, 0), sh: Math.max(sourceHeight, 0) };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (sourceAspect > targetAspect) {
    // Source is wider: trim the sides.
    const sw = sourceHeight * targetAspect;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }
  // Source is taller: trim top and bottom.
  const sh = sourceWidth / targetAspect;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}

/**
 * `maxDpr` is capped rather than trusted: a 3× phone would otherwise ask us to composite
 * nine times the pixels of a 1× display every frame, for a difference nobody can see
 * through a pencil texture (docs/PLAN.md §5).
 */
export function createViewport(options: {
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  devicePixelRatio?: number;
  maxDpr?: number;
  mirrored?: boolean;
}): Viewport {
  const { sourceWidth, sourceHeight, width, height } = options;
  const dpr = Math.min(options.devicePixelRatio ?? 1, options.maxDpr ?? 2);
  return {
    sourceWidth,
    sourceHeight,
    crop: coverCrop(sourceWidth, sourceHeight, width, height),
    width,
    height,
    dpr: Math.max(dpr, 1),
    mirrored: options.mirrored ?? true,
  };
}

/**
 * A landmark normalised against the full source frame → aperture CSS pixels.
 * Points cropped out of frame come back outside [0, width] on purpose; callers decide
 * whether to clamp, and silently clamping here would hide a genuine tracking problem.
 */
export function projectNormalized(point: Point, viewport: Viewport): Point {
  const { crop, sourceWidth, sourceHeight } = viewport;
  const sourceX = point.x * sourceWidth;
  const sourceY = point.y * sourceHeight;

  const u = crop.sw === 0 ? 0 : (sourceX - crop.sx) / crop.sw;
  const v = crop.sh === 0 ? 0 : (sourceY - crop.sy) / crop.sh;

  return {
    x: (viewport.mirrored ? 1 - u : u) * viewport.width,
    y: v * viewport.height,
  };
}

/** Backing-store size for a canvas covering this viewport. */
export function backingSize(viewport: Viewport): { width: number; height: number } {
  return {
    width: Math.round(viewport.width * viewport.dpr),
    height: Math.round(viewport.height * viewport.dpr),
  };
}
