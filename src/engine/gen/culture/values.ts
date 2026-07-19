/**
 * Culture value bundles, attitude derivation, and curated color palettes.
 *
 * Values are picked as coherent bundles (a seafaring trade culture loves
 * revelry, a mountain honor culture broods on vengeance and kin) rather
 * than independent dice, so every culture reads as a believable whole.
 */

import type { Rng } from "../../core/rng";
import type { Culture, CultureValue } from "../../core/types";

export type Attitudes = Culture["attitudes"];

/**
 * Coherent value bundles, ordered by priority (first entry is the culture's
 * loudest note). Weighted so the classic shapes are common but the odd
 * corners of the design space still appear.
 */
export const VALUE_BUNDLES: ReadonlyArray<{ values: CultureValue[]; weight: number }> = [
  { values: ["seafaring", "trade", "revelry"], weight: 3 },
  { values: ["seafaring", "trade", "hospitality", "revelry"], weight: 2 },
  { values: ["seafaring", "conquest", "revelry"], weight: 1.5 }, // raiders
  { values: ["honor", "vengeance", "kinship"], weight: 3 },
  { values: ["honor", "kinship", "stoicism"], weight: 2.5 },
  { values: ["vengeance", "stoicism", "austerity"], weight: 1.5 },
  { values: ["learning", "piety", "austerity"], weight: 2.5 },
  { values: ["piety", "austerity", "stoicism"], weight: 2 },
  { values: ["piety", "kinship", "hospitality"], weight: 2 },
  { values: ["craftsmanship", "artistry", "trade"], weight: 2.5 },
  { values: ["craftsmanship", "learning", "austerity"], weight: 2 },
  { values: ["craftsmanship", "kinship", "stoicism"], weight: 1.5 },
  { values: ["conquest", "honor", "vengeance"], weight: 2 },
  { values: ["conquest", "stoicism", "kinship", "honor"], weight: 1.5 },
  { values: ["hospitality", "kinship", "revelry"], weight: 2 },
  { values: ["learning", "artistry", "revelry"], weight: 1.5 },
  { values: ["trade", "hospitality", "learning"], weight: 2 },
  { values: ["artistry", "piety", "revelry"], weight: 1.5 }, // festival culture
];

/** Which values sit near which: used for drift in derived cultures. */
export const VALUE_KIN: Record<CultureValue, CultureValue[]> = {
  honor: ["stoicism", "vengeance", "kinship"],
  hospitality: ["revelry", "kinship", "trade"],
  learning: ["artistry", "piety", "craftsmanship"],
  piety: ["austerity", "learning", "kinship"],
  craftsmanship: ["artistry", "trade", "learning"],
  kinship: ["hospitality", "honor", "stoicism"],
  conquest: ["honor", "vengeance", "seafaring"],
  seafaring: ["trade", "revelry", "conquest"],
  trade: ["hospitality", "craftsmanship", "seafaring"],
  austerity: ["stoicism", "piety", "learning"],
  artistry: ["revelry", "learning", "craftsmanship"],
  vengeance: ["honor", "stoicism", "conquest"],
  stoicism: ["austerity", "honor", "kinship"],
  revelry: ["hospitality", "artistry", "seafaring"],
};

export function pickValues(rng: Rng): CultureValue[] {
  const bundle = rng
    .fork("bundle")
    .weighted(VALUE_BUNDLES.map((b) => b.values), VALUE_BUNDLES.map((b) => b.weight));
  const values = bundle.slice();
  // Occasionally a three-value culture grows a fourth, kin to its first love.
  if (values.length === 3 && rng.fork("extra").chance(0.25)) {
    const kin = VALUE_KIN[values[0]].filter((v) => !values.includes(v));
    if (kin.length > 0) values.push(rng.fork("extraPick").pick(kin));
  }
  return values;
}

/** Drift a parent's values: usually one swap toward a kin value. */
export function driftValues(rng: Rng, parent: readonly CultureValue[]): CultureValue[] {
  const values = parent.slice();
  if (rng.fork("swap").chance(0.5)) {
    const idx = rng.fork("swapIdx").int(values.length);
    const kin = VALUE_KIN[values[idx]].filter((v) => !values.includes(v));
    if (kin.length > 0) values[idx] = rng.fork("swapPick").pick(kin);
  }
  if (values.length === 4 && rng.fork("drop").chance(0.2)) {
    values.pop();
  } else if (values.length === 3 && rng.fork("grow").chance(0.15)) {
    const kin = VALUE_KIN[values[0]].filter((v) => !values.includes(v));
    if (kin.length > 0) values.push(rng.fork("growPick").pick(kin));
  }
  // Sometimes the emphasis shifts: the second value becomes the first.
  if (rng.fork("reorder").chance(0.3) && values.length >= 2) {
    const t = values[0];
    values[0] = values[1];
    values[1] = t;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Attitudes
// ---------------------------------------------------------------------------

const ATTITUDE_SHIFTS: Record<CultureValue, Partial<Attitudes>> = {
  honor: { violence: 0.1, patriarchy: 0.08 },
  hospitality: { violence: -0.08, openness: 0.18 },
  learning: { violence: -0.12, mysticism: -0.06, openness: 0.1, patriarchy: -0.05 },
  piety: { mysticism: 0.2, patriarchy: 0.06, violence: -0.04 },
  craftsmanship: { violence: -0.06, openness: 0.05 },
  kinship: { openness: -0.08, mysticism: 0.05 },
  conquest: { violence: 0.25, patriarchy: 0.12, openness: -0.05 },
  seafaring: { mysticism: 0.15, openness: 0.12 },
  trade: { openness: 0.2, violence: -0.08 },
  austerity: { openness: -0.12, mysticism: 0.04 },
  artistry: { mysticism: 0.08, patriarchy: -0.06, openness: 0.08 },
  vengeance: { violence: 0.22, openness: -0.1 },
  stoicism: { violence: 0.04, mysticism: -0.05, openness: -0.04 },
  revelry: { violence: 0.05, openness: 0.12, mysticism: 0.04, patriarchy: -0.05 },
};

function clamp01(x: number): number {
  return Math.max(0.05, Math.min(0.95, x));
}

/**
 * Attitudes flow from the value bundle: the first value weighs most, later
 * ones taper off, then a little noise so two honor cultures still differ.
 */
export function computeAttitudes(rng: Rng, values: readonly CultureValue[]): Attitudes {
  const att: Attitudes = { violence: 0.35, mysticism: 0.4, patriarchy: 0.5, openness: 0.45 };
  const taper = [1, 0.8, 0.65, 0.5];
  for (let i = 0; i < values.length; i++) {
    const shift = ATTITUDE_SHIFTS[values[i]];
    const w = taper[Math.min(i, taper.length - 1)];
    if (shift.violence !== undefined) att.violence += shift.violence * w;
    if (shift.mysticism !== undefined) att.mysticism += shift.mysticism * w;
    if (shift.patriarchy !== undefined) att.patriarchy += shift.patriarchy * w;
    if (shift.openness !== undefined) att.openness += shift.openness * w;
  }
  const noise = rng.fork("noise");
  att.violence = clamp01(att.violence + noise.fork("v").gaussian() * 0.07);
  att.mysticism = clamp01(att.mysticism + noise.fork("m").gaussian() * 0.07);
  att.patriarchy = clamp01(att.patriarchy + noise.fork("p").gaussian() * 0.07);
  att.openness = clamp01(att.openness + noise.fork("o").gaussian() * 0.07);
  return att;
}

export function driftAttitudes(rng: Rng, parent: Attitudes): Attitudes {
  const r = rng.fork("att");
  return {
    violence: clamp01(parent.violence + r.fork("v").range(-0.12, 0.12)),
    mysticism: clamp01(parent.mysticism + r.fork("m").range(-0.12, 0.12)),
    patriarchy: clamp01(parent.patriarchy + r.fork("p").range(-0.12, 0.12)),
    openness: clamp01(parent.openness + r.fork("o").range(-0.12, 0.12)),
  };
}

// ---------------------------------------------------------------------------
// Colors — curated two-tone palettes, dye-plausible and mood-matched
// ---------------------------------------------------------------------------

interface PaletteGroup {
  key: string;
  /** Values that pull a culture toward this mood. */
  affine: CultureValue[];
  pairs: [string, string][];
}

const PALETTES: PaletteGroup[] = [
  {
    key: "sea",
    affine: ["seafaring", "trade"],
    pairs: [
      ["#1f4d5e", "#c9b37a"], // deep tide and old gold
      ["#2a6270", "#e8e0c9"], // gullwing on green water
      ["#24425c", "#a3b8c2"], // cold fjord and mist
      ["#3c6e71", "#d9cba8"], // kelp and sailcloth
    ],
  },
  {
    key: "blood",
    affine: ["conquest", "vengeance"],
    pairs: [
      ["#6e1f24", "#d8c9a3"], // dried blood and bone
      ["#7d2a1e", "#2e2a2b"], // rust and char
      ["#8a3324", "#c2a15a"], // war-clay and brass
      ["#5c1a1a", "#b8a88a"], // old wound and ashwood
    ],
  },
  {
    key: "forest",
    affine: ["kinship", "hospitality"],
    pairs: [
      ["#2e4d33", "#c9b37a"], // pine and honey
      ["#3d5a3a", "#8a6f42"], // moss and oak-bark
      ["#274233", "#b0a27e"], // yew shade and cut hay
      ["#4a5d33", "#d9d0b0"], // hedgerow and linen
    ],
  },
  {
    key: "gold",
    affine: ["piety", "learning"],
    pairs: [
      ["#efe7d3", "#a8842c"], // vellum and gilt
      ["#e3d9be", "#7d5a24"], // candle-wax and old oak
      ["#f0ead6", "#8c6d1f"], // altar-cloth and brass
      ["#d9d0b8", "#9c2b2b"], // parchment and sealing-wax
    ],
  },
  {
    key: "dusk",
    affine: ["artistry", "revelry"],
    pairs: [
      ["#4a3860", "#c9a86a"], // plum dusk and lamplight
      ["#5a3a5e", "#d9cba8"], // foxglove and cream
      ["#3a3050", "#a89cc2"], // midnight and heather
      ["#61354f", "#c2b280"], // mulberry and reed
    ],
  },
  {
    key: "iron",
    affine: ["stoicism", "austerity", "honor"],
    pairs: [
      ["#3f4147", "#b3a98c"], // wet slate and undyed wool
      ["#2f3338", "#8e979e"], // iron and rain
      ["#4d4a44", "#c9c2b0"], // smoke and chalk
      ["#33383d", "#a35c31"], // anvil and forge-glow
    ],
  },
  {
    key: "harvest",
    affine: ["craftsmanship", "trade", "hospitality"],
    pairs: [
      ["#a3762e", "#4d3220"], // barley and turned earth
      ["#b58a3a", "#33452e"], // straw and orchard
      ["#8f6b2d", "#5c2e2e"], // ale and hearth-brick
      ["#c2963c", "#2e3d4d"], // saffron and slate roof
    ],
  },
];

export function pickColors(
  rng: Rng,
  values: readonly CultureValue[],
  avoid?: ReadonlySet<string>,
): [string, string] {
  const weights = PALETTES.map((g) => {
    let w = 0.6;
    for (let i = 0; i < values.length; i++) {
      if (g.affine.includes(values[i])) w += i === 0 ? 2.2 : 1.2;
    }
    return w;
  });
  let last: [string, string] = ["#3f4147", "#b3a98c"];
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = rng.fork("colors", attempt);
    const group = r.fork("group").weighted(PALETTES, weights);
    const pair = r.fork("pair").pick(group.pairs);
    last = [pair[0], pair[1]];
    if (!avoid || !avoid.has(colorKey(last))) return last;
  }
  return last;
}

export function colorKey(pair: readonly [string, string]): string {
  return `${pair[0]}|${pair[1]}`;
}

/** Derived cultures keep their parent's field color; the charge may change. */
export function driftColors(
  rng: Rng,
  parent: readonly [string, string],
  values: readonly CultureValue[],
): [string, string] {
  if (!rng.fork("flip").chance(0.5)) return [parent[0], parent[1]];
  const fresh = pickColors(rng.fork("fresh"), values);
  const secondary = fresh[1] === parent[0] ? fresh[0] : fresh[1];
  return [parent[0], secondary];
}
