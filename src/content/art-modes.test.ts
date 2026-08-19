import { describe, expect, it } from 'vitest';
import { ART_MODES, ART_MODE_IDS, randomArtMode } from '@/content/art-modes';
import { safeContrast } from '@/engine/render/exposure';
import { hashSeed, jitterTable, mulberry32 } from '@/lib/rng';

describe('looks', () => {
  it('defines every look the picker offers', () => {
    expect(ART_MODE_IDS).toHaveLength(4);
    for (const id of ART_MODE_IDS) {
      const mode = ART_MODES[id];
      expect(mode.id).toBe(id);
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.ambient).toHaveLength(2);
    }
  });

  it('keeps every pass value inside a sane range', () => {
    for (const id of ART_MODE_IDS) {
      const { passes, grade } = ART_MODES[id];
      for (const [name, value] of [
        ['bloom', passes.bloom],
        ['halation', passes.halation],
        ['diffusion', passes.diffusion],
        ['film', passes.film],
        ['vignette', passes.vignette],
        ['grain', passes.grain],
        ['tintAlpha', passes.tintAlpha],
        ['faceClarity', passes.faceClarity],
        ['lift', grade.lift],
      ] as const) {
        expect(value, name).toBeGreaterThanOrEqual(0);
        expect(value, name).toBeLessThanOrEqual(1);
      }
      expect(grade.contrast).toBeGreaterThan(0.5);
      expect(grade.contrast).toBeLessThan(2);
    }
  });

  it('protects the face hardest in the looks that damage the image most', () => {
    // Film burns and dust across someone's eyes read as a broken video, not a treatment.
    const vintage = ART_MODES.vintage;
    const lens = ART_MODES.lens;
    expect(vintage.passes.film).toBeGreaterThan(0.5);
    expect(vintage.passes.faceClarity).toBeGreaterThan(lens.passes.faceClarity);
  });

  it('covers a real range rather than four tints of one look', () => {
    const contrasts = ART_MODE_IDS.map((id) => ART_MODES[id].grade.contrast);
    const blooms = ART_MODE_IDS.map((id) => ART_MODES[id].passes.bloom);
    // At least one restrained and one heavily processed.
    expect(Math.max(...blooms)).toBeGreaterThan(0.4);
    expect(Math.min(...blooms)).toBeLessThan(0.2);
    expect(Math.max(...contrasts) - Math.min(...contrasts)).toBeGreaterThan(0.2);
  });

  it('can return any of the four', () => {
    const seen = new Set(Array.from({ length: 400 }, (_, i) => randomArtMode(mulberry32(i))));
    expect(seen.size).toBe(4);
  });

  it('never returns undefined at the top of the random range', () => {
    expect(randomArtMode(() => 0.999999999)).toBeDefined();
    expect(randomArtMode(() => 0)).toBeDefined();
  });
});

describe('safeContrast', () => {
  // The regression that turned a whole look into a flat brown rectangle: a bright room
  // clipped to white, and the contrast boost had nothing left to separate.
  it('pulls contrast back when the scene is blown out', () => {
    const clean = { gain: 1, luma: 0.45, clipped: 0, quadrants: [] };
    const blown = { gain: 1, luma: 0.92, clipped: 0.45, quadrants: [] };
    expect(safeContrast(1.7, clean)).toBeCloseTo(1.7, 5);
    expect(safeContrast(1.7, blown)).toBeLessThan(1.4);
  });

  it('never inverts or flattens contrast entirely', () => {
    const extreme = { gain: 1, luma: 1, clipped: 1, quadrants: [] };
    expect(safeContrast(1.7, extreme)).toBeGreaterThan(1);
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
