/**
 * The four art personalities (blueprint §46, DECISIONS.md D7).
 *
 * A mode is a parameter set, not a folder of drawings — that is the only reason four of
 * them is affordable. Everything visual about a mode lives in this file, so tuning one
 * never means touching render code.
 */

export type ArtModeId = 'graphite' | 'sunny' | 'dream' | 'marker';

export interface ArtMode {
  id: ArtModeId;
  /** Shown in the style picker. Lowercase on purpose — it is a whisper, not a menu. */
  label: string;
  /** Main drawing colour. */
  ink: string;
  /** Second colour, used for accents and sparks. */
  accent: string;
  /** Warm wash on the cheeks. */
  blush: string;
  /** Halo behind the head. */
  glow: string;
  glowStrength: number;
  /** Base stroke width in CSS px at a 600px-wide aperture; scaled with the frame. */
  strokeWidth: number;
  /** How far marks wander from the true landmark path. Higher = sketchier. */
  jitter: number;
  /** Times each line is redrawn. Overdrawing is what makes a line look hand-made. */
  passes: number;
  /** Per-pass opacity. Low values let the overdraw build up gently. */
  passAlpha: number;
  /** Film grain over everything. */
  grain: number;
}

export const ART_MODES: Record<ArtModeId, ArtMode> = {
  // The default: soft pencil on near-black. Quiet, editorial, hard to dislike.
  graphite: {
    id: 'graphite',
    label: 'graphite',
    ink: 'rgba(226, 232, 240, 0.82)',
    accent: 'rgba(147, 154, 164, 0.9)',
    blush: 'rgba(255, 122, 69, 0.10)',
    glow: 'rgba(120, 140, 180, 0.30)',
    glowStrength: 0.55,
    strokeWidth: 1.6,
    jitter: 1.1,
    passes: 3,
    passAlpha: 0.34,
    grain: 0.05,
  },
  // Warm, awake, a little louder. The "good morning" of the four.
  sunny: {
    id: 'sunny',
    label: 'sunny',
    ink: 'rgba(255, 214, 170, 0.88)',
    accent: 'rgba(255, 160, 90, 0.95)',
    blush: 'rgba(255, 138, 76, 0.16)',
    glow: 'rgba(255, 168, 92, 0.34)',
    glowStrength: 0.8,
    strokeWidth: 1.9,
    jitter: 1.5,
    passes: 3,
    passAlpha: 0.32,
    grain: 0.04,
  },
  // Cool, soft-focus, fewer and slower marks. The quietest mode.
  dream: {
    id: 'dream',
    label: 'dream',
    ink: 'rgba(186, 205, 255, 0.72)',
    accent: 'rgba(120, 160, 255, 0.85)',
    blush: 'rgba(150, 130, 255, 0.14)',
    glow: 'rgba(95, 141, 255, 0.40)',
    glowStrength: 1.05,
    strokeWidth: 2.4,
    jitter: 0.7,
    passes: 4,
    passAlpha: 0.22,
    grain: 0.07,
  },
  // Confident, opaque, single-pass. Feels like a marker on paper rather than pencil.
  marker: {
    id: 'marker',
    label: 'marker',
    ink: 'rgba(244, 240, 232, 0.95)',
    accent: 'rgba(47, 107, 255, 0.95)',
    blush: 'rgba(47, 107, 255, 0.12)',
    glow: 'rgba(47, 107, 255, 0.26)',
    glowStrength: 0.5,
    strokeWidth: 3.4,
    jitter: 2.0,
    passes: 1,
    passAlpha: 0.95,
    grain: 0.03,
  },
};

export const ART_MODE_IDS = Object.keys(ART_MODES) as ArtModeId[];

/**
 * One mode per page load, then fixed for the visit (DECISIONS.md D7). Re-rolling while
 * someone is looking at themselves would read as a glitch, not as variety — the picker
 * is how they change it deliberately.
 */
export function randomArtMode(random: () => number = Math.random): ArtModeId {
  const index = Math.min(ART_MODE_IDS.length - 1, Math.floor(random() * ART_MODE_IDS.length));
  return ART_MODE_IDS[index] as ArtModeId;
}
