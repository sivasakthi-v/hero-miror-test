import type { ArtMode } from '@/content/art-modes';
import type { Viewport } from '@/engine/transform/viewport';
import type { ExpressionState } from '@/engine/vision/expression';
import type { ParticleField } from './particles';

/**
 * Decides *when* effects fire. The particle field knows how to draw; this knows restraint.
 *
 * Restraint is the whole job. An effect that fires continuously stops being a reaction
 * and becomes wallpaper — the visitor learns it means nothing. So: a burst on entering a
 * state, a slow trickle while it holds, a cooldown before it can burst again, and hearts
 * on a long random timer so they feel like a gift rather than a feature.
 */

export interface ReactionState {
  previous: ExpressionState;
  /** Timestamp of the last burst per state, for cooldowns. */
  lastBurst: Partial<Record<ExpressionState, number>>;
  nextHeartAt: number;
  /** 0..1, drives the frame's specular sweep. */
  shine: number;
}

export function createReactionState(now: number): ReactionState {
  return {
    previous: 'neutral',
    lastBurst: {},
    nextHeartAt: now + 6000 + Math.random() * 8000,
    shine: 0,
  };
}

const BURST_COOLDOWN_MS = 2600;
const HEART_MIN_GAP_MS = 12000;
const HEART_JITTER_MS = 16000;

export interface ReactionOptions {
  state: ReactionState;
  expression: ExpressionState;
  mode: ArtMode;
  field: ParticleField;
  viewport: Viewport;
  now: number;
  dtMs: number;
  reducedMotion: boolean;
}

export function updateReactions(options: ReactionOptions): void {
  const { state, expression, mode, field, viewport, now, dtMs } = options;

  // The frame shine decays on its own; a smile re-lights it.
  state.shine = Math.max(0, state.shine - dtMs / 900);

  const entered = expression !== state.previous;
  const cooled = (now - (state.lastBurst[expression] ?? -Infinity)) > BURST_COOLDOWN_MS;

  if (entered && cooled) {
    state.lastBurst[expression] = now;

    switch (expression) {
      case 'smiling':
        // Quick shine plus glitter — the reward for smiling, and the reason to do it again.
        state.shine = 1;
        field.emit('glitter', options.reducedMotion ? 8 : 26, viewport, mode.accent);
        break;
      case 'sad':
        field.emit('rain', options.reducedMotion ? 10 : 40, viewport, 'rgba(180, 205, 255, 0.8)');
        break;
      case 'surprised':
        field.emit('confetti', options.reducedMotion ? 10 : 40, viewport, mode.accent);
        break;
      case 'neutral':
        break;
    }
  }

  // A trickle while the state holds, so it does not die the instant the burst ends.
  if (!options.reducedMotion) {
    if (expression === 'smiling' && Math.random() < dtMs / 700) {
      field.emit('glitter', 1, viewport, mode.accent);
    }
    if (expression === 'sad' && Math.random() < dtMs / 90) {
      field.emit('rain', 1, viewport, 'rgba(180, 205, 255, 0.75)');
    }
  }

  // Hearts arrive on their own schedule, unrelated to anything the visitor did. That is
  // what makes them feel like a gift rather than a mechanic to be gamed.
  if (now >= state.nextHeartAt) {
    if (!options.reducedMotion) field.emit('heart', 3, viewport, mode.accent);
    state.nextHeartAt = now + HEART_MIN_GAP_MS + Math.random() * HEART_JITTER_MS;
  }

  state.previous = expression;
  field.update(dtMs, viewport);
}
