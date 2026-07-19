/**
 * The locus catalog — Aeonspire's fictional genome.
 *
 * This is game-genetics, not biology: a fixed catalog of diploid loci whose
 * alleles combine by dominance, additive blending, and penetrance rolls to
 * produce a Phenotype. A Genome is an Int16Array of length `2 * LOCI.length`;
 * locus `i` occupies `genome[2*i]` (maternal allele) and `genome[2*i+1]`
 * (paternal allele). Allele values are small integers indexing each locus's
 * private allele pool (size `n`).
 *
 * Every allele draw at founding is weighted by `base` frequencies, optionally
 * tilted by a per-culture profile so cultures develop distinct-but-overlapping
 * looks (one dark-haired and olive, another pale and red-prone, a third tall).
 * The profile is a pure deterministic function of a culture's seed offset.
 *
 * Determinism: the catalog is a frozen constant; the profile is derived from
 * a fresh Rng seeded only by the offset, consuming no shared stream.
 */

import { Rng } from "../core/rng";
import type { Aptitude } from "../core/types";
import { RARE_TRAITS } from "../core/appearance";

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/** The ten aptitudes, in a fixed catalog order (never reorder). */
export const APTITUDES: readonly Aptitude[] = [
  "war",
  "craft",
  "lore",
  "music",
  "oratory",
  "trade",
  "healing",
  "intrigue",
  "husbandry",
  "seafaring",
] as const;

/** The five temperament axes, in catalog order. */
export const TEMPERAMENT_AXES = [
  "tempOpenness",
  "tempDiligence",
  "tempSociability",
  "tempAgreeableness",
  "tempVolatility",
] as const;
export type TemperamentAxis = (typeof TEMPERAMENT_AXES)[number];

// ---------------------------------------------------------------------------
// Locus definition
// ---------------------------------------------------------------------------

/**
 * How a culture profile tilts a locus's founder allele draw:
 * - `index`: shift weight mass toward higher (or lower) allele indices along
 *   a named profile axis (used for graded/additive pigment, stature, texture).
 * - `special`: multiply one specific allele's weight by a named profile factor
 *   (used for the recessive red allele, the rare violet allele, rare traits).
 * - `apt`: multiply the gifted/prodigy alleles of an aptitude locus.
 */
export type LocusTilt =
  | { kind: "index"; axis: string }
  | { kind: "special"; idx: number; factor: "red" | "violet" | "rare" }
  | { kind: "apt"; apt: Aptitude };

export interface Locus {
  key: string;
  group: string;
  /** Allele pool size; allele values are 0..n-1. */
  n: number;
  /** Relative founder frequency of each allele value. */
  base: number[];
  tilt?: LocusTilt;
  note?: string;
}

// ---------------------------------------------------------------------------
// Catalog builder
// ---------------------------------------------------------------------------

const CATALOG: Locus[] = [];

function add(l: Locus): void {
  CATALOG.push(l);
}

// -- Eye color: melanin dominance ladder + tint/violet modifier -------------
// dark > brown > amber/hazel > green/grey > blue > pale (darker allele wins),
// plus a rare recessive violet allele carried on the modifier locus.
add({
  key: "eyeMelanin",
  group: "eye",
  n: 8, // 0 pale .. 7 near-black; expressed melanin = max(a,b)
  base: [1, 2, 4, 6, 7, 6, 4, 3],
  tilt: { kind: "index", axis: "eyeMel" },
  note: "expressed = max of the two alleles (dark dominates)",
});
add({
  key: "eyeMod",
  group: "eye",
  n: 6, // 0 cool- 1 cool 2 neutral 3 warm 4 warm+ 5 violet(rare, recessive)
  base: [3, 5, 7, 5, 3, 0.6],
  tilt: { kind: "special", idx: 5, factor: "violet" },
  note: "tint average sets amber/hazel & green/grey; homozygous 5 = violet",
});

// -- Hair color: additive eumelanin + recessive red -------------------------
add({
  key: "hairEumelanin",
  group: "hair",
  n: 5, // additive per-allele 0..4 -> sum 0..8 darkness
  base: [2, 4, 6, 4, 2],
  tilt: { kind: "index", axis: "hairEu" },
});
add({
  key: "hairRed",
  group: "hair",
  n: 2, // 0 normal, 1 red (recessive)
  base: [8, 1.6],
  tilt: { kind: "special", idx: 1, factor: "red" },
});

// -- Hair texture: two additive loci -> straight/wavy/curly/coiled ----------
add({ key: "hairTex1", group: "texture", n: 3, base: [5, 5, 2], tilt: { kind: "index", axis: "texture" } });
add({ key: "hairTex2", group: "texture", n: 3, base: [5, 5, 2], tilt: { kind: "index", axis: "texture" } });

// -- Skin tone: four additive loci -> 0..1 continuous -----------------------
for (let i = 1; i <= 4; i++) {
  add({ key: `skin${i}`, group: "skin", n: 4, base: [4, 5, 4, 2], tilt: { kind: "index", axis: "skin" } });
}

// -- Height: five additive loci ---------------------------------------------
for (let i = 1; i <= 5; i++) {
  add({ key: `height${i}`, group: "height", n: 3, base: [3, 5, 3], tilt: { kind: "index", axis: "height" } });
}

// -- Build: five additive loci ----------------------------------------------
for (let i = 1; i <= 5; i++) {
  add({ key: `build${i}`, group: "build", n: 3, base: [3, 5, 3], tilt: { kind: "index", axis: "build" } });
}

// -- Face: one locus per feature, alleles are archetype indices -------------
// Archetype 0 is the "prominent" archetype and carries mild dominance.
add({ key: "faceShape", group: "face", n: 6, base: [4, 4, 4, 3, 3, 2] });
add({ key: "noseShape", group: "face", n: 6, base: [4, 4, 4, 3, 3, 2] });
add({ key: "jawShape", group: "face", n: 5, base: [4, 4, 4, 3, 2] });
add({ key: "browShape", group: "face", n: 5, base: [4, 4, 4, 3, 2] });
add({ key: "mouthShape", group: "face", n: 5, base: [4, 4, 4, 3, 2] });
add({ key: "earShape", group: "face", n: 4, base: [4, 4, 3, 2] });

/** Number of archetypes per face feature (for expression clamping/debug). */
export const FACE_ARCHETYPES: Record<string, number> = {
  faceShape: 6,
  noseShape: 6,
  jawShape: 5,
  browShape: 5,
  mouthShape: 5,
  earShape: 4,
};

// -- Small visible markers ---------------------------------------------------
add({ key: "freckles", group: "marker", n: 2, base: [6, 4], note: "dominant, variable expressivity" });
add({ key: "dimples", group: "marker", n: 2, base: [6, 4], note: "dominant" });
add({ key: "cleftChin", group: "marker", n: 2, base: [6, 4], note: "recessive" });

// -- Temperament: five axes x three additive loci ---------------------------
for (const axis of TEMPERAMENT_AXES) {
  for (let i = 1; i <= 3; i++) {
    add({ key: `${axis}${i}`, group: "temperament", n: 3, base: [3, 5, 3], tilt: { kind: "index", axis } });
  }
}

// -- Aptitudes: one locus each, common/gifted/prodigy alleles ---------------
for (const apt of APTITUDES) {
  add({
    key: `apt_${apt}`,
    group: "aptitude",
    n: 4, // 0 none, 1 knack, 2 gifted, 3 prodigy
    base: [82, 13, 4.5, 0.5], // prodigy allele ~0.5% founder frequency
    tilt: { kind: "apt", apt },
  });
}

// -- Health/vitality small-effect loci --------------------------------------
add({ key: "constitution", group: "vitality", n: 3, base: [3, 5, 3] });
add({ key: "longevity", group: "vitality", n: 3, base: [3, 5, 3] });
add({ key: "fertility", group: "vitality", n: 3, base: [3, 5, 3] });

// -- Twinning: maternal-effect, lineage-heritable ---------------------------
add({
  key: "twinning",
  group: "twinning",
  n: 3, // 0 common, 1 prone, 2 strongly prone
  base: [90, 8, 2],
  note: "maternal-effect multiplier; makes twin-prone families emerge",
});

// -- Rare trait loci: one per RARE_TRAITS key, low founder frequency --------
/** Founder relative frequency of each rare allele (keyed by trait). */
export const RARE_ALLELE_FREQ: Record<string, number> = {
  "moon-pale": 0.02,
  "mismatched-eyes": 0.02,
  "silver-streak": 0.025,
  "giants-blood": 0.03,
  "six-fingered": 0.02,
  "caul-born": 0.03,
  "the-sight": 0.025,
  "iron-constitution": 0.03,
  "glass-bones": 0.025,
  "wolfs-hunger": 0.03,
  unaging: 0.015,
  "night-eyed": 0.025,
};

export const RARE_KEYS: readonly string[] = RARE_TRAITS.map((t) => t.key);

for (const t of RARE_TRAITS) {
  const q = RARE_ALLELE_FREQ[t.key] ?? 0.02;
  add({
    key: `rare_${t.key}`,
    group: "rare",
    n: 2,
    base: [1, q],
    tilt: { kind: "special", idx: 1, factor: "rare" },
    note: t.name,
  });
}

// ---------------------------------------------------------------------------
// Frozen catalog + fast index
// ---------------------------------------------------------------------------

export const LOCI: readonly Locus[] = CATALOG;

/** locus key -> position in the catalog (its genome slot pair). */
export const LOCUS_INDEX: Readonly<Record<string, number>> = (() => {
  const m: Record<string, number> = {};
  LOCI.forEach((l, i) => {
    m[l.key] = i;
  });
  return m;
})();

/** Catalog positions of the rare-trait loci (used by de novo mutation). */
export const RARE_LOCI_INDICES: readonly number[] = LOCI.map((l, i) =>
  l.group === "rare" ? i : -1,
).filter((i) => i >= 0);

export function locusIndex(key: string): number {
  const i = LOCUS_INDEX[key];
  if (i === undefined) throw new Error(`unknown locus ${key}`);
  return i;
}

/** Read a locus's [maternal, paternal] allele pair from a genome. */
export function pair(genome: Int16Array, key: string): [number, number] {
  const i = locusIndex(key);
  return [genome[2 * i], genome[2 * i + 1]];
}

/** Sum of both alleles across a set of loci (additive traits). */
export function sumLoci(genome: Int16Array, keys: readonly string[]): number {
  let s = 0;
  for (const k of keys) {
    const i = locusIndex(k);
    s += genome[2 * i] + genome[2 * i + 1];
  }
  return s;
}

// ---------------------------------------------------------------------------
// Culture profiles — deterministic "regional look" from a seed offset
// ---------------------------------------------------------------------------

export interface CultureProfile {
  /** Per-axis index-tilt biases (roughly -1.4..1.4). */
  index: Record<string, number>;
  /** Multipliers on special-allele founder weights. */
  red: number;
  violet: number;
  rare: number;
  /** Per-aptitude gifted/prodigy multipliers. */
  apt: Record<Aptitude, number>;
}

/**
 * Derive a deterministic look-profile from a culture's seed offset. Coloring
 * axes share a hidden "pigment" draw (dark cultures tend dark across eye,
 * hair and skin) with independent scatter so they overlap; stature, texture,
 * red-proneness, violet-proneness and rare-clustering vary independently.
 */
export function cultureProfile(offset: number): CultureProfile {
  const r = new Rng(`genetics:culture-profile:${offset}`, `gcp:${offset}`);
  const pigment = r.normal(0, 0.78);
  const index: Record<string, number> = {
    eyeMel: clamp(pigment + r.normal(0, 0.5), -1.4, 1.4),
    hairEu: clamp(pigment + r.normal(0, 0.5), -1.4, 1.4),
    skin: clamp(0.85 * pigment + r.normal(0, 0.45), -1.4, 1.4),
    height: clamp(r.normal(0, 0.7), -1.4, 1.4),
    build: clamp(r.normal(0, 0.6), -1.4, 1.4),
    texture: clamp(0.4 * pigment + r.normal(0, 0.62), -1.4, 1.4),
  };
  for (const axis of TEMPERAMENT_AXES) {
    index[axis] = clamp(r.normal(0, 0.28), -1, 1);
  }
  const red = clamp(1.0 - pigment * 0.55 + r.normal(0, 0.3), 0.35, 2.6);
  const violet = clamp(1.0 + r.normal(0, 0.55), 0.3, 2.8);
  const rare = clamp(1.0 + r.normal(0, 0.35), 0.6, 1.9);
  const apt = {} as Record<Aptitude, number>;
  for (const a of APTITUDES) {
    apt[a] = clamp(1.0 + r.normal(0, 0.3), 0.6, 1.9);
  }
  return { index, red, violet, rare, apt };
}

/** Neutral profile (offset-free): base weights untouched. */
export const NEUTRAL_PROFILE: CultureProfile = {
  index: {},
  red: 1,
  violet: 1,
  rare: 1,
  apt: {} as Record<Aptitude, number>,
};

// ---------------------------------------------------------------------------
// Effective founder weights for a locus under a culture profile
// ---------------------------------------------------------------------------

const TILT_STRENGTH = 1.15;

/** Tilt additive/graded weights toward higher indices when bias > 0. */
function tiltIndex(base: number[], bias: number): number[] {
  if (!bias) return base;
  const n = base.length;
  const mid = (n - 1) / 2;
  const span = Math.max(1, mid);
  return base.map((w, i) => w * Math.exp((TILT_STRENGTH * bias * (i - mid)) / span));
}

export function effectiveWeights(locus: Locus, profile: CultureProfile): number[] {
  const t = locus.tilt;
  if (!t) return locus.base;
  if (t.kind === "index") {
    return tiltIndex(locus.base, profile.index[t.axis] ?? 0);
  }
  if (t.kind === "special") {
    const w = locus.base.slice();
    w[t.idx] = w[t.idx] * profile[t.factor];
    return w;
  }
  // aptitude: raise gifted (2) and prodigy (3) weights
  const w = locus.base.slice();
  const b = profile.apt[t.apt] ?? 1;
  w[2] *= b;
  w[3] *= b;
  return w;
}
