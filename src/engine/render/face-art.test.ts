import { describe, expect, it } from 'vitest';
import { ART_MODES, ART_MODE_IDS, randomArtMode } from '@/content/art-modes';
import { hashSeed, jitterTable, mulberry32 } from '@/lib/rng';

describe('art modes', () => {
  it('defines every mode the picker offers', () => {
    expect(ART_MODE_IDS).toHaveLength(4);
    for (const id of ART_MODE_IDS) {
      const mode = ART_MODES[id];
      expect(mode.id).toBe(id);
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.passes).toBeGreaterThanOrEqual(1);
      expect(mode.strokeWidth).toBeGreaterThan(0);
      expect(mode.passAlpha).toBeGreaterThan(0);
      expect(mode.passAlpha).toBeLessThanOrEqual(1);
    }
  });

  it('keeps overdrawn modes translucent, so passes build rather than blot', () => {
    for (const id of ART_MODE_IDS) {
      const mode = ART_MODES[id];
      if (mode.passes > 1) expect(mode.passAlpha).toBeLessThan(0.5);
    }
  });

  it('can return any of the four', () => {
    const seen = new Set(
      Array.from({ length: 400 }, (_, i) => randomArtMode(mulberry32(i))),
    );
    expect(seen.size).toBe(4);
  });

  it('never returns undefined at the top of the random range', () => {
    // Math.random() can return values arbitrarily close to 1; an unguarded
    // floor(r * length) index would fall off the end and crash the first frame.
    expect(randomArtMode(() => 0.999999999)).toBeDefined();
    expect(randomArtMode(() => 0)).toBeDefined();
  });
});

describe('stroke jitter', () => {
  it('is identical for the same seed, so a line does not strobe between frames', () => {
    const a = jitterTable('contour:0:x', 40, 1.5);
    const b = jitterTable('contour:0:x', 40, 1.5);
    expect(a).toEqual(b);
  });

  it('differs between passes, so overdrawing separates like a real hand', () => {
    expect(jitterTable('contour:0:x', 40, 1.5)).not.toEqual(jitterTable('contour:1:x', 40, 1.5));
  });

  it('stays inside the requested spread', () => {
    for (const value of jitterTable('cheek', 500, 2)) {
      expect(Math.abs(value)).toBeLessThanOrEqual(2);
    }
  });

  it('hashes distinct keys to distinct seeds', () => {
    expect(hashSeed('brow-l')).not.toBe(hashSeed('brow-r'));
  });

  it('produces numbers in [0, 1)', () => {
    const random = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
