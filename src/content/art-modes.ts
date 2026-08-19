/**
 * The four looks (DECISIONS.md D7, revised again).
 *
 * Each is a *photograph*, not a tint: a base grade, a set of passes, and a promise that
 * the face stays readable no matter how hard the rest is processed. Coverage is
 * deliberate — one honest, one loud, one aged, one soft — so reloading gives a genuinely
 * different picture.
 *
 * Every number here is relative to an auto-exposed image (see render/exposure.ts). The
 * previous version hard-coded values against a mid-grey test frame, which is why a bright
 * room collapsed one look into a flat rectangle.
 */

export type ArtModeId = 'lens' | 'expressive' | 'vintage' | 'soft';

export interface LookGrade {
  /** Applied after auto-exposure. Contrast is pulled back automatically in blown scenes. */
  contrast: number;
  saturate: number;
  /** Extra brightness on top of the exposure gain. 1 = none. */
  brightness: number;
  hueRotate: number;
  /** Lifts blacks toward this colour — the faded-print look. 0 = pure blacks. */
  lift: number;
  liftColor: string;
}

export interface LookPasses {
  /** Blurred highlights screened back on. */
  bloom: number;
  /** Warm glow bleeding from bright edges. Film halation. */
  halation: number;
  /** Shadows/highlights pushed toward two colours. */
  duotone: [string, string] | null;
  /** Colour washed over everything. */
  tint: string;
  tintMode: GlobalCompositeOperation;
  tintAlpha: number;
  /** Whole-image diffusion — the soft-focus filter, not a blur of the face. */
  diffusion: number;
  /** Film burn blobs, dust, scratches, gate weave. */
  film: number;
  vignette: number;
  grain: number;
  /** Ordered-dither grid. Subtle everywhere: it is texture, not a posterise. */
  dither: number;
  /** Character-grid texture. Same idea — process you feel rather than read. */
  ascii: number;
  /**
   * How much of the clean, unprocessed face is composited back at the end. The whole
   * point of the effects is that the person stays clear inside them.
   */
  faceClarity: number;
}

export interface ArtMode {
  id: ArtModeId;
  label: string;
  grade: LookGrade;
  passes: LookPasses;
  /** Ambient wash behind the frame, blended with colours sampled from the live image. */
  ambient: [string, string];
  /** Particles and frame shine. */
  accent: string;
  glow: string;
}

export const ART_MODES: Record<ArtModeId, ArtMode> = {
  // Honest camera. Corrected exposure, gentle contrast, a real lens vignette — what a
  // good camera would have given you. The reference the others are judged against.
  lens: {
    id: 'lens',
    label: 'lens',
    grade: { contrast: 1.08, saturate: 1.06, brightness: 1, hueRotate: 0, lift: 0, liftColor: '#000' },
    passes: {
      bloom: 0.12,
      halation: 0,
      duotone: null,
      tint: 'rgba(255, 240, 225, 0.05)',
      tintMode: 'soft-light',
      tintAlpha: 1,
      diffusion: 0,
      film: 0,
      vignette: 0.42,
      grain: 0.035,
      dither: 0.05,
      ascii: 0.035,
      faceClarity: 0.25,
    },
    ambient: ['#161a22', '#7d8ba3'],
    accent: 'rgba(238, 240, 245, 0.95)',
    glow: 'rgba(150, 175, 210, 0.3)',
  },

  // Loud. Teal shadows against orange skin, heavy bloom, deep vignette. The one that
  // reads as "edited" from across the room.
  expressive: {
    id: 'expressive',
    label: 'expressive',
    grade: { contrast: 1.22, saturate: 1.45, brightness: 1.02, hueRotate: -6, lift: 0.06, liftColor: '#0b2a3a' },
    passes: {
      bloom: 0.5,
      halation: 0.25,
      duotone: ['#06283d', '#ff9a5c'],
      tint: 'rgba(255, 120, 60, 0.18)',
      tintMode: 'overlay',
      tintAlpha: 0.9,
      diffusion: 0.1,
      film: 0,
      vignette: 0.6,
      grain: 0.07,
      dither: 0.09,
      ascii: 0.06,
      faceClarity: 0.5,
    },
    // Hotter and more electric than the grade, so it does not collide with vintage's
    // amber: the two warm looks were near-identical in the backdrop.
    ambient: ['#02202f', '#ff5f9e'],
    accent: 'rgba(255, 154, 92, 0.95)',
    glow: 'rgba(255, 130, 70, 0.32)',
  },

  // Aged. Faded blacks, warm cast, halation around highlights, burns and dust drifting
  // across the frame. The face is protected hardest here, because film damage over a
  // face reads as a broken video rather than a treatment.
  vintage: {
    id: 'vintage',
    label: 'vintage',
    grade: { contrast: 1.05, saturate: 0.72, brightness: 1.02, hueRotate: -8, lift: 0.14, liftColor: '#3a2a18' },
    passes: {
      bloom: 0.2,
      halation: 0.55,
      duotone: ['#2b1d10', '#ffd9a0'],
      tint: 'rgba(214, 158, 90, 0.22)',
      tintMode: 'soft-light',
      tintAlpha: 1,
      diffusion: 0.15,
      film: 0.9,
      vignette: 0.68,
      grain: 0.16,
      dither: 0.11,
      ascii: 0.07,
      faceClarity: 0.62,
    },
    ambient: ['#1d1206', '#b8822f'],
    accent: 'rgba(255, 214, 160, 0.95)',
    glow: 'rgba(220, 160, 90, 0.3)',
  },

  // Soft. Heavy diffusion, lifted shadows, pastel cast — a portrait through a stocking
  // filter. Clarity is kept high so it is flattering rather than smeared.
  soft: {
    id: 'soft',
    label: 'soft',
    grade: { contrast: 0.94, saturate: 1.12, brightness: 1.06, hueRotate: 4, lift: 0.12, liftColor: '#2a2340' },
    passes: {
      bloom: 0.45,
      halation: 0.2,
      duotone: null,
      tint: 'rgba(190, 175, 255, 0.16)',
      tintMode: 'screen',
      tintAlpha: 0.85,
      diffusion: 0.55,
      film: 0,
      vignette: 0.34,
      grain: 0.04,
      dither: 0.04,
      ascii: 0.03,
      faceClarity: 0.45,
    },
    ambient: ['#1a1730', '#c9b6ff'],
    accent: 'rgba(214, 200, 255, 0.95)',
    glow: 'rgba(160, 140, 255, 0.33)',
  },
};

export const ART_MODE_IDS = Object.keys(ART_MODES) as ArtModeId[];

/**
 * One look per page load, then fixed for the visit (DECISIONS.md D7). Re-rolling while
 * someone is looking at themselves would read as a glitch, not as variety — the picker
 * is how they change it deliberately.
 */
export function randomArtMode(random: () => number = Math.random): ArtModeId {
  const index = Math.min(ART_MODE_IDS.length - 1, Math.floor(random() * ART_MODE_IDS.length));
  return ART_MODE_IDS[index] as ArtModeId;
}
