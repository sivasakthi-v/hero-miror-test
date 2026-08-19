/**
 * Seeded pseudo-random numbers.
 *
 * Hand-drawn marks need jitter, but jitter recomputed every frame is a strobing mess —
 * the wobble has to be *the same wobble* each frame, moving only because the face moved.
 * A seeded generator gives every stroke a fixed personality that survives the render
 * loop, and gives each visitor a slightly different drawing.
 *
 * mulberry32: tiny, fast, good enough for texture. Not for anything security-related.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed per string, so "cheek-left" always jitters the same way. */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pre-rolled offsets, so the render loop never allocates or re-rolls mid-frame. */
export function jitterTable(key: string, count: number, spread: number): number[] {
  const random = mulberry32(hashSeed(key));
  return Array.from({ length: count }, () => (random() * 2 - 1) * spread);
}

export function pick<T>(items: readonly T[], random: () => number): T {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index] as T;
}
