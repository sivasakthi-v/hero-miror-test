/**
 * The four looks (DECISIONS.md D7, revised).
 *
 * These are *photo treatments*, not line styles: each one grades the camera image into a
 * different photograph, then decorates it. A look is still only a parameter set, which is
 * why four of them stays affordable.
 *
 * Coverage is deliberate — two bold, one editorial, one soft — so reloading gives a
 * genuinely different picture rather than a different accent colour.
 */

export type ArtModeId = 'neon' | 'editorial' | 'poster' | 'dream';

export interface PhotoGrade {
  /** CSS filter applied while drawing the video. Cheap, GPU-accelerated, huge effect. */
  filter: string;
  /** Colour washed over the photo, and how. */
  tint: string;
  tintMode: GlobalCompositeOperation;
  tintAlpha: number;
  /** Duotone: shadows and highlights get pushed toward these. Empty = off. */
  duotone: [string, string] | null;
  /** Blurred bright pass screened back on top. 0 = off. */
  bloom: number;
  /** Darkened edges, keeping attention on the face. */
  vignette: number;
  /** Film grain, now that the photo is actually in the canvas. */
  grain: number;
  /** Posterise the image into N levels. 0 = off. Expensive; high tier only. */
  posterize: number;
}

export interface ArtMode {
  id: ArtModeId;
  label: string;
  grade: PhotoGrade;
  /** Ambient wash behind the frame; blended with colours sampled from the live image. */
  ambient: [string, string];
  /** Particles, frame shine, and any remaining marks. */
  accent: string;
  glow: string;
}

export const ART_MODES: Record<ArtModeId, ArtMode> = {
  // Bold. Graffiti wall at night: crushed blacks, electric split-tone, heavy bloom.
  neon: {
    id: 'neon',
    label: 'neon',
    grade: {
      filter: 'contrast(1.35) saturate(1.6) brightness(0.95)',
      tint: 'rgba(120, 40, 200, 0.30)',
      tintMode: 'overlay',
      tintAlpha: 0.85,
      duotone: ['#12002e', '#ff4fd8'],
      bloom: 0.55,
      vignette: 0.55,
      grain: 0.12,
      posterize: 0,
    },
    ambient: ['#2a0b4a', '#ff2d9b'],
    accent: 'rgba(255, 90, 200, 0.95)',
    glow: 'rgba(255, 60, 190, 0.35)',
  },

  // Editorial. Still recognisably you, but lit like a magazine: filmic curve, warm
  // highlights against cool shadows, fine grain.
  editorial: {
    id: 'editorial',
    label: 'editorial',
    grade: {
      filter: 'contrast(1.18) saturate(0.85) sepia(0.18) brightness(1.02)',
      tint: 'rgba(255, 196, 140, 0.14)',
      tintMode: 'soft-light',
      tintAlpha: 1,
      duotone: null,
      bloom: 0.18,
      vignette: 0.62,
      grain: 0.07,
      posterize: 0,
    },
    ambient: ['#1b1512', '#c98f5a'],
    accent: 'rgba(244, 226, 198, 0.9)',
    glow: 'rgba(220, 170, 110, 0.28)',
  },

  // Expressive. Screen-print: few tones, hard edges, one loud ink.
  poster: {
    id: 'poster',
    label: 'poster',
    grade: {
      filter: 'contrast(1.7) saturate(0.4) brightness(1.05)',
      tint: 'rgba(255, 72, 40, 0.35)',
      tintMode: 'multiply',
      tintAlpha: 0.9,
      duotone: ['#0d0d12', '#ffd23f'],
      bloom: 0.1,
      vignette: 0.4,
      grain: 0.15,
      posterize: 5,
    },
    ambient: ['#12121a', '#ff5a2e'],
    accent: 'rgba(255, 210, 63, 0.95)',
    glow: 'rgba(255, 120, 40, 0.3)',
  },

  // Soft. Overexposed film, pastel bloom, almost no contrast. The quiet one.
  dream: {
    id: 'dream',
    label: 'dream',
    grade: {
      filter: 'contrast(0.92) saturate(1.15) brightness(1.12) blur(0.3px)',
      tint: 'rgba(150, 190, 255, 0.22)',
      tintMode: 'screen',
      tintAlpha: 0.9,
      duotone: null,
      bloom: 0.75,
      vignette: 0.3,
      grain: 0.05,
      posterize: 0,
    },
    ambient: ['#141a35', '#8fb7ff'],
    accent: 'rgba(190, 215, 255, 0.95)',
    glow: 'rgba(120, 165, 255, 0.35)',
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
