/**
 * Deterministic RNG for the whole simulation.
 *
 * Design rules (CRITICAL for determinism):
 * - All randomness flows from a single world seed string.
 * - Subsystems never share a stream: fork labeled child streams
 *   (`rng.fork("genetics", personId)`) so that adding a draw in one system
 *   never perturbs another system's sequence.
 * - Never use Math.random(), Date.now(), or object-key iteration order
 *   anywhere in the engine.
 */

/** FNV-1a 32-bit hash, used to derive child seeds from labels. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** splitmix32 — used to expand one 32-bit seed into stream state. */
function splitmix32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

/**
 * sfc32 PRNG — fast, high-quality 128-bit state generator.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  /** The label path that produced this stream (for debugging). */
  readonly label: string;

  constructor(seed: string | number, label = "root") {
    const s = typeof seed === "number" ? seed >>> 0 : fnv1a(seed);
    const mix = splitmix32(s);
    this.a = (mix() * 4294967296) >>> 0;
    this.b = (mix() * 4294967296) >>> 0;
    this.c = (mix() * 4294967296) >>> 0;
    this.d = (mix() * 4294967296) >>> 0;
    this.label = label;
    // Warm up: decorrelate nearby seeds.
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniform float in [0, 1). */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /**
   * Fork a new independent stream derived from this stream's label and the
   * given parts. Forking does NOT consume state from the parent, so the
   * mere act of forking never perturbs the parent sequence.
   */
  fork(...parts: (string | number)[]): Rng {
    const childLabel = this.label + "/" + parts.join(":");
    return new Rng(fnv1a(childLabel), childLabel);
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Integer in [lo, hi] inclusive. */
  intIn(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  /** Float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick a uniform random element. Throws on empty array. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error(`Rng.pick on empty array (${this.label})`);
    return arr[this.int(arr.length)];
  }

  /** Pick n distinct elements (order randomized). */
  pickN<T>(arr: readonly T[], n: number): T[] {
    const copy = arr.slice();
    const out: T[] = [];
    const take = Math.min(n, copy.length);
    for (let i = 0; i < take; i++) {
      const idx = this.int(copy.length);
      out.push(copy[idx]);
      copy.splice(idx, 1);
    }
    return out;
  }

  /**
   * Weighted pick. `weights[i]` is the relative weight of `arr[i]`.
   * Zero-total falls back to uniform.
   */
  weighted<T>(arr: readonly T[], weights: readonly number[]): T {
    if (arr.length === 0) throw new Error(`Rng.weighted on empty array (${this.label})`);
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return this.pick(arr);
    let roll = this.next() * total;
    for (let i = 0; i < arr.length; i++) {
      roll -= Math.max(0, weights[i]);
      if (roll < 0) return arr[i];
    }
    return arr[arr.length - 1];
  }

  /** Weighted pick from [value, weight] pairs. */
  weightedPairs<T>(pairs: readonly (readonly [T, number])[]): T {
    return this.weighted(
      pairs.map((p) => p[0]),
      pairs.map((p) => p[1]),
    );
  }

  /** Approximately normal (mean 0, sd 1) via sum of uniforms. */
  gaussian(): number {
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += this.next();
    return (sum - 3) / Math.sqrt(0.5);
  }

  /** Normal with given mean and standard deviation. */
  normal(mean: number, sd: number): number {
    return mean + this.gaussian() * sd;
  }

  /** Fisher–Yates shuffle in place; returns the same array. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
