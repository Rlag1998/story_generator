/**
 * Genetics module — createGeneticsService.
 *
 * Aeonspire's fictional-inheritance engine. A ~70-locus diploid catalog (see
 * loci.ts) combines by dominance, additive blending, penetrance and mutation
 * to produce every person's looks, temperament, aptitudes and hidden
 * predispositions. Founder genomes are drawn under per-culture look-profiles
 * so peoples develop distinct appearances; children mix their parents and
 * carry recessive rarities that surface when bloodlines fold back on
 * themselves. This module is a pure library: all randomness flows from the
 * Rng handed to each call, so a seed always yields the same world.
 */

import { Rng } from "../core/rng";
import type {
  Genome,
  GeneticsService,
  Personality,
  PersonId,
  Phenotype,
  Sex,
  World,
} from "../core/types";
import { express } from "./express";
import { founderGenome, genomeLength, litterSize, reproduce } from "./reproduce";
import { inbreeding } from "./pedigree";
import { resemblance } from "./resemblance";
import { basePersonality } from "./personality";

export function createGeneticsService(): GeneticsService {
  return {
    genomeLength(): number {
      return genomeLength();
    },
    founderGenome(rng: Rng, cultureSeedOffset: number): Genome {
      return founderGenome(rng, cultureSeedOffset);
    },
    reproduce(rng: Rng, mother: Genome, father: Genome): Genome {
      return reproduce(rng, mother, father);
    },
    express(genome: Genome, sex: Sex, rng: Rng): Phenotype {
      return express(genome, sex, rng);
    },
    litterSize(rng: Rng, motherPh: Phenotype): number {
      return litterSize(rng, motherPh);
    },
    resemblance(a: Phenotype, b: Phenotype): number {
      return resemblance(a, b);
    },
    inbreeding(world: World, motherId: PersonId, fatherId: PersonId): number {
      return inbreeding(world, motherId, fatherId);
    },
    basePersonality(ph: Phenotype, rng: Rng): Personality {
      return basePersonality(ph, rng);
    },
  };
}

// Extra exported helpers — free-form internal API for tests and tooling.
export {
  LOCI,
  LOCUS_INDEX,
  RARE_KEYS,
  RARE_ALLELE_FREQ,
  RARE_LOCI_INDICES,
  FACE_ARCHETYPES,
  APTITUDES,
  TEMPERAMENT_AXES,
  cultureProfile,
  effectiveWeights,
  locusIndex,
  pair,
  sumLoci,
  clamp,
  clamp01,
} from "./loci";
export { express, expressRareTraits } from "./express";
export { founderGenome, reproduce, litterSize, genomeLength } from "./reproduce";
export { inbreeding } from "./pedigree";
export { resemblance } from "./resemblance";
export { basePersonality } from "./personality";
