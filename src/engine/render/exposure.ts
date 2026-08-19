/**
 * Scene analysis: how bright is the room, and what colour is it?
 *
 * This exists because the first version of the treatments had no idea what it was
 * looking at. Values were tuned against a mid-grey test image, so in a bright room with
 * white walls `contrast(1.7)` clipped everything to white, posterisation collapsed that
 * to a single level, and a multiply tint painted the flat result solid orange. The look
 * was not broken — it was tuned for a scene the visitor did not have.
 *
 * One small `getImageData` per sample feeds both the exposure gain and the ambient
 * backdrop, because reading pixels back from the GPU is the expensive part and doing it
 * twice for two features would be twice the cost for no reason.
 */

/** Where we want the average scene to sit. Slightly below mid so highlights survive. */
const TARGET_LUMA = 0.46;

/** Gain limits: enough to rescue a dim or blown room, not enough to invent noise. */
const MIN_GAIN = 0.55;
const MAX_GAIN = 1.9;

/** How fast exposure adapts. Slow, so a passing shadow does not pump the whole image. */
const ADAPT = 0.08;

export interface SceneAnalysis {
  /** Multiplier to apply as brightness before any look-specific grading. */
  gain: number;
  /** 0..1 mean luminance of the raw frame. */
  luma: number;
  /** How much of the frame is clipped to white. Drives contrast pull-back. */
  clipped: number;
  /** Four quadrant averages, for the ambient backdrop. */
  quadrants: string[];
}

export interface SceneSampler {
  sample(video: HTMLVideoElement): SceneAnalysis;
  readonly current: SceneAnalysis;
}

const NEUTRAL: SceneAnalysis = { gain: 1, luma: 0.5, clipped: 0, quadrants: [] };

export function createSceneSampler(): SceneSampler {
  const canvas = document.createElement('canvas');
  const size = 16;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  let current: SceneAnalysis = { ...NEUTRAL };

  return {
    get current() {
      return current;
    },

    sample(video) {
      if (!ctx || video.videoWidth === 0) return current;

      ctx.drawImage(video, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      let total = 0;
      let clipped = 0;
      const quads = [0, 1, 2, 3].map(() => ({ r: 0, g: 0, b: 0, n: 0 }));

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          // Rec. 709 luma: green carries most of perceived brightness.
          const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          total += luma;
          if (luma > 0.96) clipped++;

          const q = (y < size / 2 ? 0 : 2) + (x < size / 2 ? 0 : 1);
          const target = quads[q]!;
          target.r += r;
          target.g += g;
          target.b += b;
          target.n++;
        }
      }

      const pixels = size * size;
      const luma = total / pixels;
      const clippedRatio = clipped / pixels;

      // Aim the scene at the target, then adapt toward it rather than snapping — a hard
      // cut in exposure looks like a fault, a slow one looks like a camera.
      const wanted = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET_LUMA / Math.max(luma, 0.04)));
      const gain = current.gain + (wanted - current.gain) * ADAPT;

      current = {
        gain,
        luma,
        clipped: clippedRatio,
        quadrants: quads.map(
          ({ r, g, b, n }) =>
            `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`,
        ),
      };
      return current;
    },
  };
}

/**
 * Contrast has to back off in a blown-out room, or the highlights fuse into one flat
 * shape and every subsequent operation is working on a solid colour. This is the exact
 * failure that turned one look into a brown rectangle.
 */
export function safeContrast(base: number, scene: SceneAnalysis): number {
  const pullback = 1 - Math.min(scene.clipped * 1.6, 0.55);
  return 1 + (base - 1) * pullback;
}
