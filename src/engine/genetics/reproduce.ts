/**
 * Founding, meiosis and litter size.
 *
 * founderGenome draws a fresh diploid genome under a culture's look-profile.
 * reproduce performs independent assortment (one allele per locus from each
 * parent) plus rare mutation, including de novo rare-trait alleles so new
 * rare lines can arise and then cluster through pedigrees. litterSize honors
 * the heritable maternal twinning modifier.
 */

import { Rng } from "../core/rng";
import type { Genome, Phenotype } from "../core/types";
import {
  cultureProfile,
  effectiveWeights,
  LOCI,
  RARE_LOCI_INDICES,
} from "./loci";

/** Number of loci; genome array length is 2 * this. */
export function genomeLength(): number {
  return LOCI.length;
}

/** A founder genome under the given culture's allele-frequency profile. */
export function founderGenome(rng: Rng, cultureSeedOffset: number): Genome {
  const profile = cultureProfile(cultureSeedOffset);
  const g = new Int16Array(2 * LOCI.length);
  for (let i = 0; i < LOCI.length; i++) {
    const locus = LOCI[i];
    const w = effectiveWeights(locus, profile);
    g[2 * i] = drawAllele(rng, locus.n, w);
    g[2 * i + 1] = drawAllele(rng, locus.n, w);
  }
  return g;
}

function drawAllele(rng: Rng, n: number, weights: number[]): number {
  // Inline weighted index draw (avoids allocating an index array per call).
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.max(0, weights[i]);
  if (total <= 0) return rng.int(n);
  let roll = rng.next() * total;
  for (let i = 0; i < n; i++) {
    roll -= Math.max(0, weights[i]);
    if (roll < 0) return i;
  }
  return n - 1;
}

/** Meiosis + mutation: child genome from two parent genomes. */
export function reproduce(rng: Rng, mother: Genome, father: Genome): Genome {
  const L = LOCI.length;
  const g = new Int16Array(2 * L);
  for (let i = 0; i < L; i++) {
    // Independent assortment: one of the mother's two alleles, one of the
    // father's two, at every locus. Stored as [maternal, paternal].
    g[2 * i] = rng.chance(0.5) ? mother[2 * i] : mother[2 * i + 1];
    g[2 * i + 1] = rng.chance(0.5) ? father[2 * i] : father[2 * i + 1];
  }
  mutate(rng, g);
  return g;
}

/**
 * Mutation: roughly one event per 2-4 genomes. Most events re-roll a locus's
 * allele from its neutral pool; a small fraction seed a de novo rare-trait
 * allele, the wellspring of brand-new rare lines.
 */
function mutate(rng: Rng, g: Genome): void {
  let events = 0;
  if (rng.chance(0.33)) events++; // ~1 per 3 genomes
  if (rng.chance(0.05)) events++; // occasional second
  for (let e = 0; e < events; e++) {
    if (rng.chance(0.12) && RARE_LOCI_INDICES.length > 0) {
      const rl = RARE_LOCI_INDICES[rng.int(RARE_LOCI_INDICES.length)];
      const side = rng.chance(0.5) ? 0 : 1;
      g[2 * rl + side] = 1; // de novo rare allele
      continue;
    }
    const li = rng.int(LOCI.length);
    const locus = LOCI[li];
    const side = rng.chance(0.5) ? 0 : 1;
    g[2 * li + side] = drawAllele(rng, locus.n, locus.base);
  }
}

/**
 * Litter size for a conception: 1 (single), 2 (twins) or 3 (triplets).
 * Base rates ~1.2% twins, ~0.06% triplets, scaled by the mother's heritable
 * twinning modifier so twin-prone lineages recur.
 */
export function litterSize(rng: Rng, motherPh: Phenotype): number {
  const mod = motherPh.twinningMod ?? 1;
  const pTrip = 0.0006 * mod;
  const pTwin = 0.012 * mod;
  const roll = rng.next();
  if (roll < pTrip) return 3;
  if (roll < pTrip + pTwin) return 2;
  return 1;
}
