/**
 * Prose pools for politics: house mottoes, court offices, ruler title pairs,
 * causes of war, and coronation rites. All strings are display English kept
 * in a low-fantasy medieval register. No em-dashes, ever.
 */

import type { Rng } from "../core/rng";
import type { Culture, CultureValue, PolityKind, Religion } from "../core/types";

// ---------------------------------------------------------------------------
// Mottoes
// ---------------------------------------------------------------------------

const VALUE_MOTTOES: Record<CultureValue, string[]> = {
  honor: ["Honor Outlasts Iron", "Our Word Is Stone", "Clean Hands, High Head"],
  hospitality: ["No Door Barred", "The Hearth Is Wide", "Bread Before Blood"],
  learning: ["We Keep the Letters", "Light in the Long Dark", "Ask the Old Books"],
  piety: ["Under Watchful Heaven", "First the Altar", "As Heaven Wills"],
  craftsmanship: ["By Hand and Fire", "Made to Endure", "The Work Praises the Maker"],
  kinship: ["Blood Holds", "One Roof, One Blood", "The Line Unbroken"],
  conquest: ["Take and Keep", "The Field Decides", "Ours by the Spear"],
  seafaring: ["Wind Serves the Willing", "Salt Before Soil", "The Tide Repays"],
  trade: ["Fair Weight, Full Coffer", "All Roads Pay Us", "Coin Remembers"],
  austerity: ["Enough Is Plenty", "Bare Walls, Strong Roof", "Want Nothing, Fear Nothing"],
  artistry: ["The Song Outlives the Singer", "We Carve It Deep", "Beauty Is No Small Thing"],
  vengeance: ["We Do Not Forget", "Debt for Debt", "The Ledger Closes in Blood"],
  stoicism: ["Endure", "Stone Does Not Weep", "Winter Passes"],
  revelry: ["Joy Is Courage", "The Feast Goes On", "Pour While It Lasts"],
};

function capitalizeWord(w: string): string {
  return w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w;
}

const VIRTUE_TEMPLATES = [
  (v: string) => `In ${v} We Stand`,
  (v: string) => `${v} Is Our Shield`,
  (v: string) => `${v} Above All`,
  (v: string) => `By ${v} Alone`,
];

/** A short translated motto drawn from culture values and faith virtues. */
export function makeMotto(rng: Rng, culture: Culture, religion: Religion | null): string {
  const pool: string[] = [];
  for (const value of culture.values) {
    for (const m of VALUE_MOTTOES[value] ?? []) pool.push(m);
  }
  // Only crisp single-word virtues make good words on a banner.
  const virtues = (religion?.virtues ?? []).filter((v) => !v.includes(" ") && v.length <= 12);
  if (virtues.length > 0 && rng.chance(0.35)) {
    const virtue = capitalizeWord(rng.pick(virtues));
    return rng.pick(VIRTUE_TEMPLATES)(virtue);
  }
  if (pool.length === 0) return "The Line Unbroken";
  return rng.pick(pool);
}

// ---------------------------------------------------------------------------
// Ruler title pairs [male, female] per polity kind
// ---------------------------------------------------------------------------

export function rulerTitlePair(
  rng: Rng,
  kind: PolityKind,
  culture: Culture,
  religion: Religion | null,
): [string, string] {
  switch (kind) {
    case "kingdom":
      if (culture.values.includes("conquest") && rng.chance(0.5)) {
        return ["High King", "High Queen"];
      }
      return ["King", "Queen"];
    case "principality":
      return rng.pick([
        ["Prince", "Princess"],
        ["Grand Prince", "Grand Princess"],
      ] as [string, string][]);
    case "chiefdom":
      return rng.pick([
        ["High Chief", "High Chieftess"],
        ["Great Chief", "Great Chieftess"],
      ] as [string, string][]);
    case "city-league": {
      return rng.pick([
        ["First Speaker", "First Speaker"],
        ["Lord Mayor", "Lady Mayor"],
        ["Master of the League", "Mistress of the League"],
      ] as [string, string][]);
    }
    case "theocracy": {
      if (religion && rng.chance(0.5)) {
        const t = `High ${religion.clergyTitle}`;
        return [t, t];
      }
      return rng.pick([
        ["Hierarch", "Hierarch"],
        ["Keeper of the Faith", "Keeper of the Faith"],
      ] as [string, string][]);
    }
  }
}

// ---------------------------------------------------------------------------
// Court offices
// ---------------------------------------------------------------------------

/** Offices always seated first (the marshal matters to the war engine). */
export const CORE_ROLES = ["marshal", "steward"] as const;

const COMMON_ROLES = [
  "court poet",
  "keeper of keys",
  "lorekeeper",
  "master of hounds",
  "warden of the roads",
  "high cupbearer",
  "court physician",
];

const KIND_ROLES: Record<PolityKind, string[]> = {
  kingdom: ["keeper of the seal", "master of the hunt"],
  principality: ["master of letters", "keeper of the gardens"],
  chiefdom: ["law-speaker", "spear-bearer", "skald"],
  "city-league": ["master of coin", "harbormaster", "weigher of measures"],
  theocracy: ["keeper of rites", "warden of relics", "reader of omens"],
};

/** 2-4 offices for a new court: marshal, usually a steward, plus flavor. */
export function courtRoles(rng: Rng, kind: PolityKind): string[] {
  const roles: string[] = ["marshal"];
  if (rng.chance(0.85)) roles.push("steward");
  const extras = [...KIND_ROLES[kind], ...COMMON_ROLES];
  const wanted = rng.intIn(2, 4);
  for (const extra of rng.pickN(extras, Math.max(0, wanted - roles.length))) {
    roles.push(extra);
  }
  return roles.slice(0, 4);
}

// ---------------------------------------------------------------------------
// Causes of war and peace flavor
// ---------------------------------------------------------------------------

export function conquestCasus(rng: Rng, demonym: string, regionName: string): string {
  return rng.pick([
    `the ${demonym} lords hunger for the ${regionName}`,
    `old maps name the ${regionName} as ${demonym} soil`,
    `raids across the ${regionName} marches have gone unanswered too long`,
  ]);
}

export function feudCasus(rng: Rng, houseA: string, houseB: string): string {
  return rng.pick([
    `blood owed between ${houseA} and ${houseB} has outgrown the law`,
    `the feud of ${houseA} and ${houseB} has set the border alight`,
  ]);
}

export function claimCasus(rng: Rng, claimant: string, polityName: string): string {
  return rng.pick([
    `${claimant} presses an old claim to the high seat of ${polityName}`,
    `${claimant} names the crown of ${polityName} stolen, and comes to take it back`,
  ]);
}

export function tributeFlavor(rng: Rng): string {
  return rng.pick([
    "a weight of silver and a hostage of good blood",
    "ten years of grain tithes and open roads",
    "silver, salt, and the victor's peace",
  ]);
}

// ---------------------------------------------------------------------------
// Coronation rites
// ---------------------------------------------------------------------------

export function coronationRite(rng: Rng, kind: PolityKind, religion: Religion | null): string {
  switch (kind) {
    case "kingdom":
      return rng.pick([
        "crowned beneath the old banners",
        "raised on the shields of the household guard",
        "anointed before the assembled lords",
      ]);
    case "principality":
      return rng.pick([
        "invested with ring and rod",
        "acclaimed in the great hall",
      ]);
    case "chiefdom":
      return rng.pick([
        "lifted on the war-shield at the moot stone",
        "given the chief's torc before the gathered clans",
      ]);
    case "city-league":
      return rng.pick([
        "confirmed by show of hands in the guildhall",
        "sworn upon the city ledgers",
      ]);
    case "theocracy": {
      const clergy = religion?.clergyTitle ?? "the clergy";
      return rng.pick([
        `veiled and unveiled by the ${clergy}`,
        `raised up amid incense by the ${clergy}`,
      ]);
    }
  }
}

/** Divination flavor for divine-lot successions. */
export function divinationFlavor(rng: Rng, religion: Religion | null): string {
  const clergy = religion?.clergyTitle ?? "the clergy";
  return rng.pick([
    `chosen by lot under the eyes of the ${clergy}`,
    `named when the smoke of the offering bent toward them`,
    `marked by the casting of the holy bones`,
  ]);
}
