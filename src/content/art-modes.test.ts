import { describe, expect, it } from 'vitest';
import { ART_MODES, ART_MODE_IDS, randomArtMode } from '@/content/art-modes';
import { hashSeed, jitterTable, mulberry32 } from '@/lib/rng';

describe('photo treatments', () => {
  it('defines every look the picker offers', () => {
    expect(ART_MODE_IDS).toHaveLength(4);
    for (const id of ART_MODE_IDS) {
      const mode = ART_MODES[id];
      expect(mode.id).toBe(id);
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.grade.filter.length).toBeGreaterThan(0);
      expect(mode.ambient).toHaveLength(2);
    }
  });

  it('keeps every grade value inside a sane range', () => {
    for (const id of ART_MODE_IDS) {
      const { grade } = ART_MODES[id];
      for (const [name, value] of [
        ['bloom', grade.bloom],
        ['vignette', grade.vignette],
        ['grain', grade.grain],
        ['tintAlpha', grade.tintAlpha],
      ] as const) {
        expect(value, name).toBeGreaterThanOrEqual(0);
        expect(value, name).toBeLessThanOrEqual(1);
      }
      // Posterising below three levels is a black-and-white threshold, not a look.
      if (grade.posterize > 0) expect(grade.posterize).toBeGreaterThanOrEqual(3);
    }
  });

  it('covers a real range of looks rather than four tints of one', () => {
    const filters = new Set(ART_MODE_IDS.map((id) => ART_MODES[id].grade.filter));
    expect(filters.size).toBe(4);
    // At least one bold and one restrained treatment.
    const blooms = ART_MODE_IDS.map((id) => ART_MODES[id].grade.bloom);
    expect(Math.max(...blooms)).toBeGreaterThan(0.4);
    expect(Math.min(...blooms)).toBeLessThan(0.25);
  });

  it('can return any of the four', () => {
    const seen = new Set(Array.from({ length: 400 }, (_, i) => randomArtMode(mulberry32(i))));
    expect(seen.size).toBe(4);
  });

  it('never returns undefined at the top of the random range', () => {
    // Math.random() can return values arbitrarily close to 1; an unguarded
    // floor(r * length) index would fall off the end and crash the first frame.
    expect(randomArtMode(() => 0.999999999)).toBeDefined();
    expect(randomArtMode(() => 0)).toBeDefined();
  });
});

describe('seeded randomness', () => {
  it('is identical for the same seed, so textures do not strobe between frames', () => {
    expect(jitterTable('grain:0', 40, 1.5)).toEqual(jitterTable('grain:0', 40, 1.5));
  });

  it('differs between keys', () => {
    expect(jitterTable('a', 40, 1.5)).not.toEqual(jitterTable('b', 40, 1.5));
    expect(hashSeed('rain')).not.toBe(hashSeed('confetti'));
  });

  it('stays inside the requested spread', () => {
    for (const value of jitterTable('spread', 500, 2)) {
      expect(Math.abs(value)).toBeLessThanOrEqual(2);
    }
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
