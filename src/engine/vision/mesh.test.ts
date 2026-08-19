import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { describe, expect, it } from 'vitest';
import { FACE_OVAL } from './mesh';

/**
 * The library is imported here and nowhere else on the main-thread side. Tests are not
 * shipped, so this costs the bundle nothing while still guaranteeing our copied constant
 * matches the real one — a silent drift after a MediaPipe upgrade would draw the face
 * outline through the wrong points.
 */
describe('FACE_OVAL', () => {
  it('matches the connection list MediaPipe ships', () => {
    const upstream = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL.map((c) => [c.start, c.end]);
    expect(FACE_OVAL.map((pair) => [...pair])).toEqual(upstream);
  });

  it('forms a closed loop', () => {
    for (let i = 0; i < FACE_OVAL.length; i++) {
      const current = FACE_OVAL[i]!;
      const next = FACE_OVAL[(i + 1) % FACE_OVAL.length]!;
      expect(current[1]).toBe(next[0]);
    }
  });
});
