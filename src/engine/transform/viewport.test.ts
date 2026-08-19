import { describe, expect, it } from 'vitest';
import { backingSize, coverCrop, createViewport, projectNormalized } from './viewport';

const HD = { w: 1920, h: 1080 };
const HD_ARGS = { sourceWidth: HD.w, sourceHeight: HD.h, width: 600, height: 400 };

describe('coverCrop', () => {
  it('trims the sides of a 16:9 source shown at 3:2', () => {
    const crop = coverCrop(HD.w, HD.h, 3, 2);
    expect(crop.sh).toBe(1080);
    expect(crop.sw).toBeCloseTo(1620, 6); // 1080 * 1.5
    expect(crop.sx).toBeCloseTo(150, 6); // centred
    expect(crop.sy).toBe(0);
  });

  it('trims much harder at 4:5 portrait', () => {
    const crop = coverCrop(HD.w, HD.h, 4, 5);
    expect(crop.sh).toBe(1080);
    expect(crop.sw).toBeCloseTo(864, 6); // 1080 * 0.8
    expect(crop.sx).toBeCloseTo(528, 6);
  });

  it('trims top and bottom when the source is taller than the target', () => {
    const crop = coverCrop(1080, 1920, 3, 2);
    expect(crop.sw).toBe(1080);
    expect(crop.sh).toBeCloseTo(720, 6);
    expect(crop.sy).toBeCloseTo(600, 6);
  });

  it('crops nothing when the aspects already match', () => {
    expect(coverCrop(1280, 720, 16, 9)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 });
  });

  it('always keeps the crop inside the source', () => {
    const cases: [number, number, number, number][] = [
      [1920, 1080, 3, 2],
      [1920, 1080, 4, 5],
      [640, 480, 3, 2],
      [1280, 720, 1, 1],
      [720, 1280, 4, 5],
    ];
    for (const [sw, sh, tw, th] of cases) {
      const c = coverCrop(sw, sh, tw, th);
      expect(c.sx).toBeGreaterThanOrEqual(0);
      expect(c.sy).toBeGreaterThanOrEqual(0);
      expect(c.sx + c.sw).toBeLessThanOrEqual(sw + 1e-9);
      expect(c.sy + c.sh).toBeLessThanOrEqual(sh + 1e-9);
      expect(c.sw / c.sh).toBeCloseTo(tw / th, 6);
    }
  });

  it('does not divide by zero before the video has dimensions', () => {
    expect(() => coverCrop(0, 0, 3, 2)).not.toThrow();
    expect(coverCrop(0, 0, 3, 2)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
});

describe('projectNormalized', () => {
  const desktop = createViewport({
    sourceWidth: HD.w,
    sourceHeight: HD.h,
    width: 600,
    height: 400,
  });
  const mobile = createViewport({
    sourceWidth: HD.w,
    sourceHeight: HD.h,
    width: 320,
    height: 400,
  });

  it('puts the centre of the frame at the centre of the aperture, in both crops', () => {
    for (const vp of [desktop, mobile]) {
      const p = projectNormalized({ x: 0.5, y: 0.5 }, vp);
      expect(p.x).toBeCloseTo(vp.width / 2, 6);
      expect(p.y).toBeCloseTo(vp.height / 2, 6);
    }
  });

  it('mirrors horizontally and never vertically', () => {
    const left = projectNormalized({ x: 0.25, y: 0.5 }, desktop);
    const right = projectNormalized({ x: 0.75, y: 0.5 }, desktop);
    // A point on the visitor's left appears on the right of a mirror.
    expect(left.x).toBeGreaterThan(desktop.width / 2);
    expect(right.x).toBeLessThan(desktop.width / 2);
    expect(left.x + right.x).toBeCloseTo(desktop.width, 6);
    expect(left.y).toBeCloseTo(right.y, 6);
  });

  it('is its own inverse under mirroring — no double-mirror drift', () => {
    // The exact bug docs/PLAN.md §26 warns about: mirroring in two places cancels or
    // doubles, and the artwork ends up on the wrong side of the face.
    const unmirrored = createViewport({ ...HD_ARGS, mirrored: false });
    const mirrored = createViewport({ ...HD_ARGS, mirrored: true });
    const a = projectNormalized({ x: 0.3, y: 0.4 }, unmirrored);
    const b = projectNormalized({ x: 0.3, y: 0.4 }, mirrored);
    expect(a.x + b.x).toBeCloseTo(unmirrored.width, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });

  it('reports points cropped out of frame as outside the aperture', () => {
    // x=0.02 is in the strip that the 4:5 crop discards.
    const p = projectNormalized({ x: 0.02, y: 0.5 }, mobile);
    expect(p.x).toBeGreaterThan(mobile.width);
  });

  it('maps the crop edges exactly to the aperture edges', () => {
    const { crop, sourceWidth } = desktop;
    const leftEdge = crop.sx / sourceWidth;
    const rightEdge = (crop.sx + crop.sw) / sourceWidth;
    expect(projectNormalized({ x: leftEdge, y: 0 }, desktop).x).toBeCloseTo(desktop.width, 6);
    expect(projectNormalized({ x: rightEdge, y: 0 }, desktop).x).toBeCloseTo(0, 6);
  });

  it('keeps the face in the same place regardless of aperture size', () => {
    const small = createViewport({ ...HD_ARGS, width: 300, height: 200 });
    const large = createViewport({ ...HD_ARGS, width: 1200, height: 800 });
    const a = projectNormalized({ x: 0.42, y: 0.31 }, small);
    const b = projectNormalized({ x: 0.42, y: 0.31 }, large);
    expect(a.x / small.width).toBeCloseTo(b.x / large.width, 9);
    expect(a.y / small.height).toBeCloseTo(b.y / large.height, 9);
  });
});

describe('createViewport', () => {
  it('caps the pixel ratio so a 3x phone does not composite 9x the pixels', () => {
    const vp = createViewport({ ...HD_ARGS, devicePixelRatio: 3 });
    expect(vp.dpr).toBe(2);
    expect(backingSize(vp)).toEqual({ width: 1200, height: 800 });
  });

  it('never drops below 1x', () => {
    expect(createViewport({ ...HD_ARGS, devicePixelRatio: 0.5 }).dpr).toBe(1);
  });

  it('mirrors by default, because a visitor expects a mirror', () => {
    expect(createViewport(HD_ARGS).mirrored).toBe(true);
  });
});
