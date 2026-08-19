import type { Expression } from './types';

/**
 * Blendshapes → a handful of states the art can react to (blueprint §47).
 *
 * Deliberately four states, not an emotion taxonomy. Every extra state is another thing
 * that can fire at the wrong moment, and a portfolio that guesses "sad" at a neutral
 * face is worse than one that stays quiet.
 */
export type ExpressionState = 'neutral' | 'smiling' | 'sad' | 'surprised';

/**
 * Values are far lower than they look like they should be. MediaPipe blendshape scores
 * for a clear, natural smile land around 0.3-0.5, not near 1 — thresholds set by
 * intuition (0.42) meant a real person could smile broadly and trigger nothing at all.
 *
 * Entering needs a clear signal; leaving uses a lower bar, so a state that has been
 * earned holds steady through the small dips that happen while someone holds it.
 */
const ENTER = { smile: 0.22, sad: 0.24, surprise: 0.3 };
const EXIT = { smile: 0.13, sad: 0.14, surprise: 0.18 };

/**
 * Hysteresis, so an expression that sits near its threshold does not strobe the effect
 * it drives. Rain that flickers on and off is worse than no rain.
 *
 * The signals themselves are derived in `anchors.deriveExpression` and smoothed before
 * they get here, which is what makes a reaction arrive a beat after the expression —
 * like someone noticing, rather than a switch.
 */
export function nextExpressionState(
  current: ExpressionState,
  signals: Pick<Expression, 'smile' | 'sadness' | 'surprise'>,
): ExpressionState {
  const holding = (key: keyof typeof EXIT, value: number): boolean => value > EXIT[key];

  if (current === 'smiling' && holding('smile', signals.smile)) return 'smiling';
  if (current === 'sad' && holding('sad', signals.sadness)) return 'sad';
  if (current === 'surprised' && holding('surprise', signals.surprise)) return 'surprised';

  // A smile wins ties: it is the one people perform on purpose.
  if (signals.smile > ENTER.smile) return 'smiling';
  if (signals.surprise > ENTER.surprise) return 'surprised';
  if (signals.sadness > ENTER.sad) return 'sad';
  return 'neutral';
}
