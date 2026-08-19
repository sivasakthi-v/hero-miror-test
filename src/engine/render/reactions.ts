import type { ArtMode } from '@/content/art-modes';
import type { Viewport } from '@/engine/transform/viewport';
import type { ParticleField, ParticleKind } from './particles';

/**
 * The effect loop.
 *
 * Effects used to be driven by facial expression. That is gone: reading emotion from
 * blendshapes was unreliable enough that most visitors never saw a single reaction, and
 * an effect nobody triggers may as well not exist. A timed cycle fires reliably for
 * everyone, and the visitor still gets a picture that keeps changing while they watch.
 *
 * The design constraint is unchanged: restraint. One effect at a time, with quiet gaps
 * between them, so each arrival is noticed instead of becoming wallpaper.
 */

interface Beat {
  kind: ParticleKind;
  /** How many arrive at the start of the beat. */
  burst: number;
  /** Chance per 16ms of another one during the beat. Trickle, not a firehose. */
  trickle: number;
  /** How long the beat lasts. */
  durationMs: number;
  /** Colour override; falls back to the look's accent. */
  color?: string;
  /** Lights the frame sheen when the beat opens. */
  shine?: boolean;
}

/**
 * Ordered rather than random: a sequence has a rhythm a visitor can feel, where random
 * picks tend to clump and leave long dead stretches.
 */
const LOOP: Beat[] = [
  { kind: 'glitter', burst: 22, trickle: 0.02, durationMs: 4200, shine: true },
  { kind: 'heart', burst: 4, trickle: 0.008, durationMs: 5200, color: 'rgba(255, 138, 170, 0.95)' },
  { kind: 'confetti', burst: 30, trickle: 0.01, durationMs: 5000 },
  { kind: 'rain', burst: 26, trickle: 0.05, durationMs: 5600, color: 'rgba(186, 210, 255, 0.8)' },
  { kind: 'glitter', burst: 16, trickle: 0.015, durationMs: 4000, shine: true },
];

/** Silence between beats. Without it the frame is never allowed to just be a picture. */
const GAP_MS = 2600;

export interface ReactionState {
  index: number;
  /** When the current beat started. */
  beatStartedAt: number;
  inGap: boolean;
  /** 0..1, drives the frame's specular sweep. */
  shine: number;
}

export function createReactionState(now: number): ReactionState {
  return { index: 0, beatStartedAt: now, inGap: true, shine: 0 };
}

export interface ReactionOptions {
  state: ReactionState;
  mode: ArtMode;
  field: ParticleField;
  viewport: Viewport;
  now: number;
  dtMs: number;
  reducedMotion: boolean;
}

export function updateReactions(options: ReactionOptions): void {
  const { state, mode, field, viewport, now, dtMs, reducedMotion } = options;

  // The sheen decays on its own; the start of a glitter beat re-lights it.
  state.shine = Math.max(0, state.shine - dtMs / 900);

  const beat = LOOP[state.index % LOOP.length]!;
  const elapsed = now - state.beatStartedAt;

  if (state.inGap) {
    if (elapsed >= GAP_MS) {
      state.inGap = false;
      state.beatStartedAt = now;
      if (beat.shine) state.shine = 1;
      field.emit(
        beat.kind,
        reducedMotion ? Math.ceil(beat.burst / 3) : beat.burst,
        viewport,
        beat.color ?? mode.accent,
      );
    }
  } else {
    if (!reducedMotion && Math.random() < beat.trickle * (dtMs / 16)) {
      field.emit(beat.kind, 1, viewport, beat.color ?? mode.accent);
    }
    if (elapsed >= beat.durationMs) {
      state.inGap = true;
      state.beatStartedAt = now;
      state.index = (state.index + 1) % LOOP.length;
    }
  }

  field.update(dtMs, viewport);
}
