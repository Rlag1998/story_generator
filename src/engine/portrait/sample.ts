/**
 * Sample phenotype generation and mixing.
 *
 * The real genetics module owns inheritance; these helpers exist so the
 * portrait module can exercise itself (tests, the family-sheet script)
 * without importing other modules. Mixing mirrors the genetics module's
 * observable behaviour: discrete features come from one parent or land
 * between them, continuous ones blend with noise.
 */

import type { Rng } from "../core/rng";
import type { Phenotype } from "../core/types";
import { clamp } from "./paths";

const FACE_COUNTS = {
  faceShape: 6,
  noseShape: 6,
  jawShape: 5,
  browShape: 5,
  mouthShape: 5,
  earShape: 4,
} as const;

export function randomPhenotype(rng: Rng, opts?: { rare?: string[] }): Phenotype {
  return {
    skinTone: clamp(rng.next() * rng.next(), 0.02, 0.98),
    hairColor: rng.int(9),
    hairTexture: rng.int(4),
    eyeColor: rng.int(8),
    heightScore: clamp(rng.normal(0, 1.1), -3, 3),
    buildScore: clamp(rng.normal(0, 1.1), -3, 3),
    faceShape: rng.int(FACE_COUNTS.faceShape),
    noseShape: rng.int(FACE_COUNTS.noseShape),
    jawShape: rng.int(FACE_COUNTS.jawShape),
    browShape: rng.int(FACE_COUNTS.browShape),
    mouthShape: rng.int(FACE_COUNTS.mouthShape),
    earShape: rng.int(FACE_COUNTS.earShape),
    freckles: rng.chance(0.22),
    dimples: rng.chance(0.18),
    cleftChin: rng.chance(0.12),
    rareTraits: opts?.rare ?? [],
    tempOpenness: rng.range(-1, 1),
    tempDiligence: rng.range(-1, 1),
    tempSociability: rng.range(-1, 1),
    tempAgreeableness: rng.range(-1, 1),
    tempVolatility: rng.range(-1, 1),
    aptitudes: {},
    constitution: rng.range(-0.5, 0.5),
    fertilityMod: 1,
    twinningMod: 1,
    longevityMod: 1,
  };
}

/** Blend two parents into a plausible child phenotype. */
export function childPhenotype(rng: Rng, mother: Phenotype, father: Phenotype): Phenotype {
  const pick = <T>(a: T, b: T): T => (rng.chance(0.5) ? a : b);
  const face = (key: keyof typeof FACE_COUNTS): number => {
    const a = mother[key] as number;
    const b = father[key] as number;
    if (a === b) return a;
    if (Math.abs(a - b) === 1) return pick(a, b);
    return rng.chance(0.6) ? pick(a, b) : Math.round((a + b) / 2);
  };
  const mid = (a: number, b: number, sd: number, lo: number, hi: number): number =>
    clamp((a + b) / 2 + rng.normal(0, sd), lo, hi);
  const rare: string[] = [];
  for (const t of [...new Set([...mother.rareTraits, ...father.rareTraits])].sort()) {
    if (rng.chance(0.5)) rare.push(t);
  }
  return {
    skinTone: mid(mother.skinTone, father.skinTone, 0.05, 0.02, 0.98),
    hairColor: clamp(pick(mother.hairColor, father.hairColor) + (rng.chance(0.2) ? rng.intIn(-1, 1) : 0), 0, 9),
    hairTexture: pick(mother.hairTexture, father.hairTexture),
    eyeColor: rng.chance(0.62)
      ? Math.min(mother.eyeColor, father.eyeColor) // darker tends to dominate
      : pick(mother.eyeColor, father.eyeColor),
    heightScore: mid(mother.heightScore, father.heightScore, 0.5, -3, 3),
    buildScore: mid(mother.buildScore, father.buildScore, 0.5, -3, 3),
    faceShape: face("faceShape"),
    noseShape: face("noseShape"),
    jawShape: face("jawShape"),
    browShape: face("browShape"),
    mouthShape: face("mouthShape"),
    earShape: face("earShape"),
    freckles: (mother.freckles || father.freckles) && rng.chance(0.6),
    dimples: (mother.dimples || father.dimples) && rng.chance(0.7),
    cleftChin: (mother.cleftChin || father.cleftChin) && rng.chance(0.6),
    rareTraits: rare,
    tempOpenness: mid(mother.tempOpenness, father.tempOpenness, 0.25, -1, 1),
    tempDiligence: mid(mother.tempDiligence, father.tempDiligence, 0.25, -1, 1),
    tempSociability: mid(mother.tempSociability, father.tempSociability, 0.25, -1, 1),
    tempAgreeableness: mid(mother.tempAgreeableness, father.tempAgreeableness, 0.25, -1, 1),
    tempVolatility: mid(mother.tempVolatility, father.tempVolatility, 0.25, -1, 1),
    aptitudes: {},
    constitution: mid(mother.constitution, father.constitution, 0.15, -1, 1),
    fertilityMod: 1,
    twinningMod: 1,
    longevityMod: 1,
  };
}
