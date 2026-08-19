import { describe, expect, it } from 'vitest';
import { deriveAnchors, deriveExpression, NEUTRAL_EXPRESSION } from './anchors';
import {
  lerp,
  smoothExpression,
  smoothLandmarks,
  timeAdjustedAlpha,
  LANDMARK_SMOOTHING,
} from './smoothing';
import type { Landmark } from './types';

function mesh(fill: (i: number) => Landmark, count = 478): Landmark[] {
  return Array.from({ length: count }, (_, i) => fill(i));
}

const flat = (v: number) => mesh(() => ({ x: v, y: v, z: v }));

describe('deriveAnchors', () => {
  it('produces every named anchor from a full mesh', () => {
    const anchors = deriveAnchors(mesh((i) => ({ x: i / 478, y: i / 478, z: 0 })));
    expect(anchors).not.toBeNull();
    expect(Object.values(anchors!).every((p: Landmark) => Number.isFinite(p.x))).toBe(true);
  });

  it('refuses a truncated mesh instead of silently reading zeros', () => {
    // A half-decoded result must not produce anchors clustered at the origin — that
    // would draw the whole face into the top-left corner rather than drawing nothing.
    expect(deriveAnchors(flat(0.5).slice(0, 100))).toBeNull();
    expect(deriveAnchors([])).toBeNull();
  });

  it('places eyes between their corner landmarks', () => {
    const points = flat(0);
    points[33] = { x: 0.2, y: 0.4, z: 0 };
    points[133] = { x: 0.3, y: 0.4, z: 0 };
    const anchors = deriveAnchors(points)!;
    expect(anchors.leftEye.x).toBeCloseTo(0.25, 6);
    expect(anchors.leftEye.y).toBeCloseTo(0.4, 6);
  });

  it('keeps the visitor left/right convention distinct', () => {
    const points = flat(0);
    points[33] = { x: 0.2, y: 0.4, z: 0 };
    points[133] = { x: 0.3, y: 0.4, z: 0 };
    points[263] = { x: 0.8, y: 0.4, z: 0 };
    points[362] = { x: 0.7, y: 0.4, z: 0 };
    const a = deriveAnchors(points)!;
    expect(a.leftEye.x).toBeLessThan(a.rightEye.x);
  });
});

describe('deriveExpression', () => {
  it('is neutral without blendshapes', () => {
    expect(deriveExpression(null)).toEqual(NEUTRAL_EXPRESSION);
  });

  it('averages the two sides so a crooked smile still counts', () => {
    const e = deriveExpression({ mouthSmileLeft: 0.8, mouthSmileRight: 0.2 });
    expect(e.smile).toBeCloseTo(0.5, 6);
  });

  it('inverts blink into openness', () => {
    expect(deriveExpression({ eyeBlinkLeft: 1, eyeBlinkRight: 1 }).eyeOpen).toBe(0);
    expect(deriveExpression({ eyeBlinkLeft: 0, eyeBlinkRight: 0 }).eyeOpen).toBe(1);
  });

  it('tolerates a blendshape set missing keys', () => {
    const e = deriveExpression({ jawOpen: 0.5 });
    expect(e.mouthOpen).toBe(0.5);
    expect(e.smile).toBe(0);
  });
});

describe('smoothing', () => {
  it('adopts the first result outright instead of sliding in from nowhere', () => {
    const next = flat(0.7);
    expect(smoothLandmarks(null, next, 16)).toBe(next);
  });

  it('moves toward the target without overshooting', () => {
    const smoothed = smoothLandmarks(flat(0), flat(1), 16);
    const p = smoothed[0]!;
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(1);
  });

  it('converges to the target when the target holds still', () => {
    let current = flat(0);
    for (let i = 0; i < 200; i++) current = smoothLandmarks(current, flat(1), 16);
    expect(current[0]!.x).toBeCloseTo(1, 4);
  });

  // Without dt-scaling, a 30fps device would feel twice as sluggish as a 60fps one for
  // identical code — the artwork would visibly trail the face on slower machines only.
  it('smooths by the same amount per unit of time at any frame rate', () => {
    const oneStepAt30 = smoothLandmarks(flat(0), flat(1), 33.33)[0]!.x;

    let at60 = flat(0);
    at60 = smoothLandmarks(at60, flat(1), 16.67);
    at60 = smoothLandmarks(at60, flat(1), 16.67);

    expect(at60[0]!.x).toBeCloseTo(oneStepAt30, 3);
  });

  it('snaps rather than crawls after a long stall', () => {
    // Tab was in the background for two seconds; the face is somewhere else entirely.
    const t = timeAdjustedAlpha(LANDMARK_SMOOTHING, 2000);
    expect(t).toBeGreaterThan(0.99);
    expect(t).toBeLessThanOrEqual(1);
  });

  it('restarts cleanly when the landmark count changes', () => {
    const next = flat(0.4).slice(0, 100);
    expect(smoothLandmarks(flat(0.9), next, 16)).toBe(next);
  });

  it('smooths expressions more slowly than geometry', () => {
    const geometry = smoothLandmarks(flat(0), flat(1), 16)[0]!.x;
    const expression = smoothExpression(
      { smile: 0, mouthOpen: 0, browLift: 0, eyeOpen: 0 },
      { smile: 1, mouthOpen: 1, browLift: 1, eyeOpen: 1 },
      16,
    ).smile;
    expect(expression).toBeLessThan(geometry);
  });

  it('lerp is exact at both ends', () => {
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
  });
});
