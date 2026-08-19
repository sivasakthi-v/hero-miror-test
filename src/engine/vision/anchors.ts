import type { Expression, FaceAnchors, Landmark } from './types';

/**
 * 478 landmarks in, twelve named points out (blueprint §28).
 *
 * The art code must never index into the raw array. `landmarks[159]` tells a reader
 * nothing and breaks silently if the model ever renumbers; `anchors.leftEye` survives
 * both. Drawing all 478 is also exactly how this stops being art and starts being a
 * tech demo.
 *
 * Indices are MediaPipe's canonical face mesh. "Left" here means the visitor's own
 * left, which appears on the right of a mirrored preview — the mirror is applied once,
 * later, in transform/viewport.
 */
const INDEX = {
  leftEyeOuter: 33,
  leftEyeInner: 133,
  rightEyeOuter: 263,
  rightEyeInner: 362,
  leftBrow: 105,
  rightBrow: 334,
  noseTip: 1,
  upperLip: 13,
  lowerLip: 14,
  leftCheek: 205,
  rightCheek: 425,
  forehead: 10,
  chin: 152,
  leftJaw: 234,
  rightJaw: 454,
} as const;

const ORIGIN: Landmark = { x: 0, y: 0, z: 0 };

function at(landmarks: Landmark[], index: number): Landmark {
  return landmarks[index] ?? ORIGIN;
}

function midpoint(a: Landmark, b: Landmark): Landmark {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/** Highest index we read, so a truncated result is rejected rather than half-used. */
const REQUIRED_LANDMARKS = Math.max(...Object.values(INDEX)) + 1;

export function deriveAnchors(landmarks: Landmark[]): FaceAnchors | null {
  if (landmarks.length < REQUIRED_LANDMARKS) return null;

  return {
    leftEye: midpoint(at(landmarks, INDEX.leftEyeOuter), at(landmarks, INDEX.leftEyeInner)),
    rightEye: midpoint(at(landmarks, INDEX.rightEyeOuter), at(landmarks, INDEX.rightEyeInner)),
    leftBrow: at(landmarks, INDEX.leftBrow),
    rightBrow: at(landmarks, INDEX.rightBrow),
    noseTip: at(landmarks, INDEX.noseTip),
    mouthCenter: midpoint(at(landmarks, INDEX.upperLip), at(landmarks, INDEX.lowerLip)),
    leftCheek: at(landmarks, INDEX.leftCheek),
    rightCheek: at(landmarks, INDEX.rightCheek),
    forehead: at(landmarks, INDEX.forehead),
    chin: at(landmarks, INDEX.chin),
    leftJaw: at(landmarks, INDEX.leftJaw),
    rightJaw: at(landmarks, INDEX.rightJaw),
  };
}

export const NEUTRAL_EXPRESSION: Expression = {
  smile: 0,
  mouthOpen: 0,
  browLift: 0,
  eyeOpen: 1,
  sadness: 0,
  surprise: 0,
};

/**
 * Four numbers, not a taxonomy of emotions (blueprint §47). Each is the mean of the
 * left and right blendshape so an asymmetric smile still reads as a smile.
 */
export function deriveExpression(blendshapes: Record<string, number> | null): Expression {
  if (!blendshapes) return NEUTRAL_EXPRESSION;
  const mean = (a: string, b: string): number =>
    ((blendshapes[a] ?? 0) + (blendshapes[b] ?? 0)) / 2;

  const mouthOpen = blendshapes['jawOpen'] ?? 0;
  const browLift = mean('browOuterUpLeft', 'browOuterUpRight');
  const frown = mean('mouthFrownLeft', 'mouthFrownRight');
  const innerBrow = blendshapes['browInnerUp'] ?? 0;

  return {
    smile: mean('mouthSmileLeft', 'mouthSmileRight'),
    mouthOpen,
    browLift,
    // Blendshapes report how *closed* an eye is, so invert to get openness.
    eyeOpen: 1 - mean('eyeBlinkLeft', 'eyeBlinkRight'),
    // A frown on its own is also what concentrating looks like; real sadness carries
    // the inner-brow raise with it, so both are required.
    sadness: Math.min(frown * 0.65 + innerBrow * 0.55, 1),
    // An open jaw alone is a yawn. Lifted brows are what make it surprise.
    surprise: Math.min(mouthOpen * 0.6 + browLift * 0.6, 1),
  };
}
