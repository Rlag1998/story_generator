/**
 * Personality baseline from temperament.
 *
 * The five genetic temperament axes are the raw clay; the eight named drives
 * (courage, ambition, piety, honor, lust, greed, wrath, compassion) are
 * derived as combinations plus an independent small roll, so siblings share a
 * grain but never a soul. Upbringing and life events (owned by the people and
 * story modules) reshape these later; here we only set the seed. Traits are
 * left empty for the people module to label.
 */

import { Rng } from "../core/rng";
import type { Personality, Phenotype } from "../core/types";
import { clamp, clamp01 } from "./loci";

export function basePersonality(ph: Phenotype, rng: Rng): Personality {
  const o = ph.tempOpenness;
  const d = ph.tempDiligence;
  const s = ph.tempSociability;
  const a = ph.tempAgreeableness;
  const v = ph.tempVolatility;
  const con = ph.constitution;

  // Independent scatter so derived drives are not lockstep with the axes.
  const n = (sd: number) => rng.normal(0, sd);

  const openness = clamp(o + n(0.06), -1, 1);
  const diligence = clamp(d + n(0.06), -1, 1);
  const sociability = clamp(s + n(0.06), -1, 1);
  const agreeableness = clamp(a + n(0.06), -1, 1);
  const volatility = clamp(v + n(0.06), -1, 1);

  const courage = clamp(0.35 * con + 0.3 * o - 0.2 * a + 0.2 * v + n(0.16), -1, 1);
  const ambition = clamp01(0.5 + 0.3 * d - 0.2 * a + 0.15 * o + n(0.13));
  const piety = clamp01(0.5 + 0.25 * a - 0.2 * o + n(0.15));
  const honor = clamp(0.32 * a + 0.3 * d - 0.2 * v + n(0.14), -1, 1);
  const lust = clamp01(0.5 + 0.25 * o + 0.2 * s - 0.15 * d + n(0.14));
  const greed = clamp01(0.5 - 0.25 * a + 0.15 * d + n(0.14));
  const wrath = clamp01(0.5 + 0.35 * v - 0.2 * a + n(0.13));
  const compassion = clamp01(0.5 + 0.35 * a - 0.15 * v + n(0.13));

  return {
    openness,
    diligence,
    sociability,
    agreeableness,
    volatility,
    courage,
    ambition,
    piety,
    honor,
    lust,
    greed,
    wrath,
    compassion,
    traits: [],
  };
}
