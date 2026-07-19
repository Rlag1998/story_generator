/**
 * Expression — turning a genome into a Phenotype.
 *
 * Applies the catalog's mixed inheritance regimes: dominance ladders (eye
 * melanin), additive polygenic sums (skin, stature, temperament), recessive
 * and dominant markers with penetrance rolls, and archetype blending for the
 * face (so a child visibly mixes both parents). Rare traits are resolved
 * first because several of them override coloring, stature or vitality.
 *
 * All stochastic choices draw from the passed Rng, so express(g, sex, rng) is
 * a pure function of its arguments.
 */

import { Rng } from "../core/rng";
import type { Aptitude, Genome, Phenotype, Sex } from "../core/types";
import { RARE_TRAITS } from "../core/appearance";
import { APTITUDES, clamp, clamp01, pair, sumLoci, TEMPERAMENT_AXES } from "./loci";

// Eumelanin sum (0..8) -> HAIR_COLORS index, light to dark.
// idx: 8 ash, 7 flaxen, 6 golden, 3 chestnut, 2 brown, 1 dark-brown, 0 black.
const HAIR_RAMP = [8, 7, 6, 3, 2, 2, 1, 1, 0];

const HEIGHT_KEYS = ["height1", "height2", "height3", "height4", "height5"];
const BUILD_KEYS = ["build1", "build2", "build3", "build4", "build5"];
const SKIN_KEYS = ["skin1", "skin2", "skin3", "skin4"];

/** Rare-trait expression regimes. */
interface Regime {
  mode: "rec" | "dom";
  pen: number; // penetrance for the minimal expressing genotype
  penHom?: number; // penetrance when homozygous (dominant traits)
}
const RARE_REGIME: Record<string, Regime> = {
  "moon-pale": { mode: "rec", pen: 0.95 },
  "mismatched-eyes": { mode: "dom", pen: 0.4, penHom: 0.7 },
  "silver-streak": { mode: "dom", pen: 0.8, penHom: 0.95 },
  "giants-blood": { mode: "rec", pen: 0.9 },
  "six-fingered": { mode: "dom", pen: 0.5, penHom: 0.8 },
  "caul-born": { mode: "rec", pen: 0.85 },
  "the-sight": { mode: "rec", pen: 0.75 },
  "iron-constitution": { mode: "rec", pen: 0.9 },
  "glass-bones": { mode: "rec", pen: 0.85 },
  "wolfs-hunger": { mode: "rec", pen: 0.85 },
  unaging: { mode: "rec", pen: 0.8 },
  "night-eyed": { mode: "dom", pen: 0.5, penHom: 0.85 },
};

/** Which rare traits are expressed for this genome (deterministic w/ rng). */
export function expressRareTraits(genome: Genome, rng: Rng): string[] {
  const out: string[] = [];
  for (const t of RARE_TRAITS) {
    const reg = RARE_REGIME[t.key];
    if (!reg) continue;
    const [a, b] = pair(genome, `rare_${t.key}`);
    const carriers = (a === 1 ? 1 : 0) + (b === 1 ? 1 : 0);
    let show = false;
    if (reg.mode === "rec") {
      if (carriers === 2) show = rng.chance(reg.pen);
    } else {
      if (carriers >= 1) show = rng.chance(carriers === 2 ? reg.penHom ?? reg.pen : reg.pen);
    }
    if (show) out.push(t.key);
  }
  return out;
}

/** Blend two face-archetype alleles, with mild dominance of archetype 0. */
function blendFace(a: number, b: number, rng: Rng): number {
  if (a === b) return a;
  const gap = Math.abs(a - b);
  const DOM = 0;
  if (gap >= 2 && (a === DOM || b === DOM)) {
    return rng.chance(0.6) ? DOM : Math.round((a + b) / 2);
  }
  if (gap === 1) {
    // adjacent archetypes: lean to one parent rather than an in-between
    return rng.chance(0.5) ? Math.min(a, b) : Math.max(a, b);
  }
  return Math.round((a + b) / 2);
}

/** eyeMod allele -> tint value (violet allele reads as neutral tint). */
function tintVal(a: number): number {
  return a === 5 ? 2 : a;
}

export function express(genome: Genome, sex: Sex, rng: Rng): Phenotype {
  const rare = expressRareTraits(genome, rng);
  const has = (k: string) => rare.includes(k);
  const moonPale = has("moon-pale");

  // -- Skin tone (additive, 0..1) -------------------------------------------
  let skinTone = sumLoci(genome, SKIN_KEYS) / 24 + rng.normal(0, 0.03);
  if (moonPale) skinTone = 0.02;
  skinTone = clamp01(skinTone);

  // -- Hair color -----------------------------------------------------------
  const E = sumLoci(genome, ["hairEumelanin"]); // 0..8
  const [ra, rb] = pair(genome, "hairRed");
  const redHom = ra === 1 && rb === 1;
  const redCarrier = ra + rb === 1;
  let hairColor: number;
  if (moonPale) {
    hairColor = 9; // white
  } else if (redHom) {
    hairColor = E >= 5 ? 4 : 5; // dark -> auburn, else flame-red
  } else {
    hairColor = HAIR_RAMP[clamp(E, 0, 8)];
    if (redCarrier && (E === 4 || E === 5)) hairColor = 3; // chestnut warming
  }

  // -- Hair texture (additive thresholds) -----------------------------------
  const tex = sumLoci(genome, ["hairTex1", "hairTex2"]); // 0..8
  const hairTexture = tex <= 1 ? 0 : tex <= 3 ? 1 : tex <= 5 ? 2 : 3;

  // -- Eye color (melanin dominance ladder + tint/violet modifier) ----------
  const [em1, em2] = pair(genome, "eyeMelanin");
  const m = Math.max(em1, em2); // dark dominates
  const [mod1, mod2] = pair(genome, "eyeMod");
  const violetHom = mod1 === 5 && mod2 === 5;
  const warm = (tintVal(mod1) + tintVal(mod2)) / 2 >= 2.5;
  let eyeColor: number;
  if (moonPale) {
    eyeColor = violetHom ? 8 : 7; // rose-pale, or violet if also carried
  } else if (violetHom && m <= 4) {
    eyeColor = 8; // violet only in a fair eye
  } else if (m >= 7) eyeColor = 0; // near-black
  else if (m === 6) eyeColor = 1; // brown
  else if (m >= 4) eyeColor = warm ? 2 : 3; // amber / hazel
  else if (m >= 2) eyeColor = warm ? 4 : 5; // green / grey
  else if (m === 1) eyeColor = 6; // blue
  else eyeColor = 7; // pale

  // -- Height & build (z-scores, additive + noise + sex shift) --------------
  let heightScore = (sumLoci(genome, HEIGHT_KEYS) - 10) / 2.6 + rng.normal(0, 0.32);
  heightScore += sex === "m" ? 0.35 : -0.32;
  if (has("giants-blood")) heightScore += 1.6;
  heightScore = clamp(heightScore, -3, 3);

  let buildScore = (sumLoci(genome, BUILD_KEYS) - 10) / 2.6 + rng.normal(0, 0.32);
  buildScore += sex === "m" ? 0.22 : -0.12;
  buildScore = clamp(buildScore, -3, 3);

  // -- Face archetypes (blend both parents' alleles) ------------------------
  const faceShape = blendFace(...pair(genome, "faceShape"), rng);
  const noseShape = blendFace(...pair(genome, "noseShape"), rng);
  const jawShape = blendFace(...pair(genome, "jawShape"), rng);
  const browShape = blendFace(...pair(genome, "browShape"), rng);
  const mouthShape = blendFace(...pair(genome, "mouthShape"), rng);
  const earShape = blendFace(...pair(genome, "earShape"), rng);

  // -- Small markers --------------------------------------------------------
  const [fa, fb] = pair(genome, "freckles");
  const freckPresent = fa === 1 || fb === 1;
  let freckPen = fa === 1 && fb === 1 ? 0.9 : 0.55;
  if (skinTone < 0.35) freckPen += 0.1; // fair skin freckles more readily
  const freckles = freckPresent && rng.chance(clamp01(freckPen));

  const [da, db] = pair(genome, "dimples");
  const dimplePresent = da === 1 || db === 1;
  const dimples = dimplePresent && rng.chance(da === 1 && db === 1 ? 0.97 : 0.85);

  const [ca, cb] = pair(genome, "cleftChin");
  const cleftHom = ca === 1 && cb === 1;
  const cleftChin = cleftHom && rng.chance(sex === "m" ? 0.9 : 0.7);

  // -- Temperament axes (additive -> -1..1) ---------------------------------
  const tempOf = (axis: string): number => {
    const s = sumLoci(genome, [`${axis}1`, `${axis}2`, `${axis}3`]); // 0..12
    return clamp((s - 6) / 3.2 + rng.normal(0, 0.07), -1, 1);
  };
  const [tempOpenness, tempDiligence, tempSociability, tempAgreeableness, tempVolatility] =
    TEMPERAMENT_AXES.map(tempOf) as [number, number, number, number, number];

  // -- Aptitudes (giftedness 0..3, sparse) ----------------------------------
  const aptitudes: Partial<Record<Aptitude, number>> = {};
  for (const apt of APTITUDES) {
    const [aa, ab] = pair(genome, `apt_${apt}`);
    const top = Math.max(aa, ab);
    let value: number;
    if (top === 3) value = rng.chance(0.5) ? 3 : 2; // prodigy allele, partial penetrance
    else value = top;
    if (value > 0) aptitudes[apt] = value;
  }

  // -- Vitality small-effect loci -------------------------------------------
  let constitution = (sumLoci(genome, ["constitution"]) - 2) / 2 + rng.normal(0, 0.06);
  if (has("iron-constitution")) constitution += 0.45;
  if (has("glass-bones")) constitution -= 0.55;
  constitution = clamp(constitution, -1, 1);

  let fertilityMod = 1.0 + (sumLoci(genome, ["fertility"]) - 2) * 0.07 + rng.normal(0, 0.02);
  fertilityMod = clamp(fertilityMod, 0.6, 1.5);

  let longevityMod = 1.0 + (sumLoci(genome, ["longevity"]) - 2) * 0.055;
  if (has("unaging")) longevityMod *= 1.16;
  if (has("iron-constitution")) longevityMod *= 1.05;
  if (has("glass-bones")) longevityMod *= 0.9;
  longevityMod = clamp(longevityMod, 0.7, 1.4);

  const twinSum = sumLoci(genome, ["twinning"]); // 0..4
  const twinningMod = clamp(1.0 + twinSum * 0.85, 1, 5);

  return {
    skinTone,
    hairColor,
    hairTexture,
    eyeColor,
    heightScore,
    buildScore,
    faceShape,
    noseShape,
    jawShape,
    browShape,
    mouthShape,
    earShape,
    freckles,
    dimples,
    cleftChin,
    rareTraits: rare,
    tempOpenness,
    tempDiligence,
    tempSociability,
    tempAgreeableness,
    tempVolatility,
    aptitudes,
    constitution,
    fertilityMod,
    twinningMod,
    longevityMod,
  };
}
