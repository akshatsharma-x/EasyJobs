/** Small deterministic PRNG helpers for the mock dataset (isomorphic, no dependencies). */

export type Rng = () => number;

/** mulberry32 — fast 32-bit seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Uniform integer in [min, max]. */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Uniform float in [min, max). */
export function randFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("mock prng: pick() from an empty list");
  return items[Math.floor(rng() * items.length)] as T;
}

/** Index chosen proportionally to `weights` (negative weights count as 0). */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return Math.floor(rng() * weights.length);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i] as number);
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function weightedPick<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  if (items.length === 0) throw new Error("mock prng: weightedPick() from an empty list");
  return items[weightedIndex(rng, items.map(weight))] as T;
}

/** Up to `count` distinct items, in random order. */
export function sampleDistinct<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0] as T);
  }
  return out;
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
