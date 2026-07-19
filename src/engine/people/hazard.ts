/**
 * Mortality: the monthly death hazard curve and death-cause selection.
 *
 * Shape: elevated infant fragility for the first three years, a low flat
 * hazard through childhood and prime adulthood, then a Gompertz-like climb
 * after 35 (doubling roughly every 8 years), with a hard wall near 95.
 * Tuned so that in good times roughly 70-80% of the born reach adulthood
 * and elders mostly die in their sixties and seventies.
 */

import type { Rng } from "../core/rng";
import type { Illness, Person, World } from "../core/types";
import { ageOf, clamp, hasRareTrait, type LocalConditions } from "./helpers";

/** Base monthly probability of death by age alone (good times, average body). */
export function baseMortalityMonthly(ageYears: number): number {
  if (ageYears < 0) return 0;
  if (ageYears < 1) return 0.0082; // first year: the cradle is perilous
  if (ageYears < 3) return 0.0021;
  if (ageYears < 10) return 0.00055;
  if (ageYears < 16) return 0.00038;
  if (ageYears <= 35) return 0.00033;
  // Gompertz-ish: doubles every ~8 years past 35.
  const h = 0.00033 * Math.pow(2, (ageYears - 35) / 8);
  return Math.min(h, 0.09);
}

/** Hazard contribution of one illness this month. */
export function illnessHazard(ill: Illness): number {
  const sev = clamp(ill.severity, 0, 1);
  return ill.chronic ? sev * sev * 0.02 : sev * sev * 0.055;
}

export interface HazardBreakdown {
  total: number;
  base: number;
  fromIllness: number;
  fromFamine: number;
  worstIllness: Illness | null;
}

/** Full monthly death hazard for a person, with its main contributors. */
export function monthlyDeathHazard(
  world: World,
  p: Person,
  conds: LocalConditions,
): HazardBreakdown {
  const age = ageOf(world, p);
  let base = baseMortalityMonthly(age);

  // Constitution: robust bodies shrug off much; frail ones falter.
  base *= 1 - 0.4 * clamp(p.phenotype.constitution, -1, 1);
  // Heritable longevity acts on the age curve.
  const lon = clamp(p.phenotype.longevityMod, 0.5, 2);
  base /= lon * lon;
  if (hasRareTrait(p, "iron-constitution")) base *= 0.55;
  if (hasRareTrait(p, "glass-bones")) base *= 1.25;
  // Old wounds weigh on a body.
  base *= 1 + Math.min(4, p.injuries.length) * 0.06;

  let fromIllness = 0;
  let worstIllness: Illness | null = null;
  for (const ill of p.illnesses) {
    fromIllness += illnessHazard(ill);
    if (!worstIllness || ill.severity > worstIllness.severity) worstIllness = ill;
  }

  let fromFamine = 0;
  if (conds.famine > 0) {
    const fragile = age < 3 || age >= 60;
    fromFamine = conds.famine * (fragile ? 0.01 : 0.003);
  }

  let total = base + fromIllness + fromFamine;
  // The hard wall: almost no one outlives ninety-five.
  if (age >= 95) total += 0.5;
  return { total: clamp(total, 0, 0.95), base, fromIllness, fromFamine, worstIllness };
}

const INFANT_CAUSES = [
  "a fever in the night",
  "the wasting",
  "a croup that would not break",
  "a chill taken from the cradle",
];

const CHILD_CAUSES = [
  "a sudden fever",
  "the flux",
  "a fall from the hayloft",
  "a swollen throat that closed",
];

const PRIME_CAUSES = [
  "a sudden fever",
  "a burst gut",
  "a weak heart",
  "a festering cut",
  "a fall on the road",
  "a chill that went to the chest",
];

const ELDER_CAUSES = [
  "a failing heart",
  "the frailty of age",
  "a winter chill that settled deep",
  "a stillness that came in the evening",
];

const GREAT_AGE_CAUSES = [
  "great age",
  "a sleep that did not end",
  "the slow guttering of a long life",
];

/** Choose the recorded cause of a hazard death, honoring what weighed most. */
export function pickDeathCause(
  rng: Rng,
  breakdown: HazardBreakdown,
  ageYears: number,
  conds: LocalConditions,
): string {
  const { worstIllness, fromIllness, fromFamine, base } = breakdown;
  if (worstIllness && fromIllness >= Math.max(base, fromFamine) && worstIllness.severity >= 0.25) {
    return worstIllness.name;
  }
  if (fromFamine > 0 && fromFamine >= Math.max(base, fromIllness)) return "hunger";
  if (ageYears < 3) return rng.pick(INFANT_CAUSES);
  if (ageYears < 13) return rng.pick(CHILD_CAUSES);
  if (ageYears >= 88) return rng.pick(GREAT_AGE_CAUSES);
  if (ageYears >= 62) return rng.pick(ELDER_CAUSES);
  return rng.pick(PRIME_CAUSES);
}
