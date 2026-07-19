/**
 * Deterministic, label-addressed randomness for portraits.
 *
 * portraitSVG receives no Rng (it must be a pure function of its inputs),
 * so every stylistic choice — hairstyle, beard, background tone — is drawn
 * from a hash of the phenotype itself. Two calls with the same phenotype
 * always agree; siblings who share face genes share structure while their
 * temperament numbers give each a personal hairstyle and bearing.
 */

import { fnv1a } from "../core/rng";
import type { Phenotype, Sex } from "../core/types";

/** Hash-backed value source. Same base + label always yields the same roll. */
export class Dice {
  constructor(readonly base: string) {}

  /** Uniform-ish [0,1) for a label. */
  r(label: string): number {
    return fnv1a(this.base + "" + label) / 4294967296;
  }

  int(label: string, n: number): number {
    if (n <= 0) return 0;
    return Math.floor(this.r(label) * n) % n;
  }

  pick<T>(label: string, arr: readonly T[]): T {
    return arr[this.int(label, arr.length)];
  }

  chance(label: string, p: number): boolean {
    return this.r(label) < p;
  }

  /** Index into weights, proportional to weight. */
  weighted(label: string, weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return 0;
    let roll = this.r(label) * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= Math.max(0, weights[i]);
      if (roll < 0) return i;
    }
    return weights.length - 1;
  }
}

/**
 * Canonical key for a phenotype+sex. Continuous fields are quantized so the
 * key is stable against float noise while still separating individuals.
 * Face-structure fields come first: they are the inherited "family" part.
 */
export function phenotypeKey(ph: Phenotype, sex: Sex): string {
  const q = (v: number, s: number) => Math.round(v * s);
  return [
    ph.faceShape,
    ph.jawShape,
    ph.noseShape,
    ph.browShape,
    ph.mouthShape,
    ph.earShape,
    ph.hairColor,
    ph.hairTexture,
    ph.eyeColor,
    ph.freckles ? 1 : 0,
    ph.dimples ? 1 : 0,
    ph.cleftChin ? 1 : 0,
    q(ph.skinTone, 48),
    q(ph.heightScore, 12),
    q(ph.buildScore, 12),
    q(ph.tempOpenness, 16),
    q(ph.tempDiligence, 16),
    q(ph.tempSociability, 16),
    q(ph.tempAgreeableness, 16),
    q(ph.tempVolatility, 16),
    ph.rareTraits.slice().sort().join("+"),
    sex,
  ].join(",");
}

/** Short base36 token for SVG element ids (clip paths etc.). */
export function idToken(key: string): string {
  return "p" + (fnv1a(key) >>> 0).toString(36);
}
