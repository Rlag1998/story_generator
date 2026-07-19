/**
 * Phenotypic resemblance — a 0..1 "family likeness" score.
 *
 * Weighted toward the features a bystander actually reads: coloring and the
 * face. Kin share about half their alleles, so parent-child pairs score far
 * above unrelated strangers. Used by narrative ("she has her mother's eyes")
 * and by drama that hinges on a bastard's telltale looks.
 */

import type { Phenotype } from "../core/types";
import { clamp01 } from "./loci";

interface FeatureWeight {
  w: number;
  sim: (a: Phenotype, b: Phenotype) => number;
}

function eq(a: number, b: number): number {
  return a === b ? 1 : 0;
}
/** Ordinal similarity: full at equal, fading with index distance. */
function ordinal(a: number, b: number, scale: number): number {
  return clamp01(1 - Math.abs(a - b) / scale);
}
function cont(a: number, b: number, scale: number): number {
  return clamp01(1 - Math.abs(a - b) / scale);
}
function bool(a: boolean, b: boolean): number {
  return a === b ? 1 : 0;
}

const FEATURES: FeatureWeight[] = [
  { w: 3.0, sim: (a, b) => ordinal(a.eyeColor, b.eyeColor, 4) },
  { w: 3.0, sim: (a, b) => ordinal(a.hairColor, b.hairColor, 4) },
  { w: 3.0, sim: (a, b) => cont(a.skinTone, b.skinTone, 0.5) },
  { w: 1.5, sim: (a, b) => ordinal(a.hairTexture, b.hairTexture, 3) },
  { w: 3.0, sim: (a, b) => eq(a.faceShape, b.faceShape) },
  { w: 2.0, sim: (a, b) => eq(a.noseShape, b.noseShape) },
  { w: 2.0, sim: (a, b) => eq(a.jawShape, b.jawShape) },
  { w: 1.5, sim: (a, b) => eq(a.browShape, b.browShape) },
  { w: 1.5, sim: (a, b) => eq(a.mouthShape, b.mouthShape) },
  { w: 1.0, sim: (a, b) => eq(a.earShape, b.earShape) },
  { w: 1.5, sim: (a, b) => cont(a.heightScore, b.heightScore, 3) },
  { w: 1.5, sim: (a, b) => cont(a.buildScore, b.buildScore, 3) },
  { w: 1.0, sim: (a, b) => bool(a.freckles, b.freckles) },
  { w: 1.0, sim: (a, b) => bool(a.dimples, b.dimples) },
  { w: 1.0, sim: (a, b) => bool(a.cleftChin, b.cleftChin) },
  { w: 2.0, sim: (a, b) => rareSim(a, b) },
];

/** Jaccard overlap of expressed rare traits (1 when both have none). */
function rareSim(a: Phenotype, b: Phenotype): number {
  const A = a.rareTraits;
  const B = b.rareTraits;
  if (A.length === 0 && B.length === 0) return 1;
  const setB = new Set(B);
  let inter = 0;
  for (const t of A) if (setB.has(t)) inter++;
  const union = A.length + B.length - inter;
  return union === 0 ? 1 : inter / union;
}

export function resemblance(a: Phenotype, b: Phenotype): number {
  let acc = 0;
  let total = 0;
  for (const f of FEATURES) {
    acc += f.w * f.sim(a, b);
    total += f.w;
  }
  return clamp01(acc / total);
}
