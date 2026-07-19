/**
 * Naming and texture strings for the material world: diseases, comets,
 * plague-windfall inheritances, boom wares. All prose is low-fantasy
 * medieval-adjacent, concrete, and free of modern words and em-dashes.
 */

import type { Rng } from "../core/rng";
import type { Language, LanguageService, Region, World } from "../core/types";
import { capitalize } from "./helpers";

// ---------------------------------------------------------------------------
// Disease names
// ---------------------------------------------------------------------------

const SYMPTOMS = [
  "Sweat",
  "Cough",
  "Wasting",
  "Fever",
  "Pox",
  "Ague",
  "Flux",
  "Blight",
  "Trembles",
  "Sleep",
  "Rot",
  "Chills",
] as const;

const DISEASE_ADJECTIVES = [
  "Grey",
  "Red",
  "White",
  "Black",
  "Blue",
  "Weeping",
  "Burning",
  "Shaking",
  "Speckled",
  "Creeping",
  "Winter",
  "Hollow",
  "Silent",
  "Marsh",
] as const;

/** English agent nouns for the possessive pattern ("Harrower's Cough"). */
const DISEASE_AGENTS = [
  "Harrower",
  "Reaper",
  "Sexton",
  "Gravedigger",
  "Widow",
  "Beggar",
  "Pilgrim",
  "Boatman",
  "Tanner",
  "Carter",
] as const;

/** Concepts fed to the language service for native-word patterns. */
const DISEASE_CONCEPTS = ["death", "sorrow", "shadow", "hunger", "ash", "cold"] as const;

/**
 * Name a new disease. Mixes English descriptive patterns with words drawn
 * from the local tongue and the origin region's name, avoiding any name in
 * `used`. Deterministic under the provided rng.
 */
export function diseaseName(
  rng: Rng,
  language: LanguageService,
  lang: Language | null,
  originRegion: Region,
  used: readonly string[],
): string {
  for (let attempt = 0; attempt < 24; attempt++) {
    const r = rng.fork("attempt", attempt);
    const pattern = r.weightedPairs([
      ["adj-symptom", 3.2],
      ["agent-symptom", 2.2],
      ["native-symptom", lang ? 2.2 : 0],
      ["native-alone", lang ? 1.2 : 0],
      ["region-symptom", 1.4],
      ["symptom-of-region", 1.2],
    ] as const);
    let name: string;
    switch (pattern) {
      case "adj-symptom":
        name = `the ${r.pick(DISEASE_ADJECTIVES)} ${r.pick(SYMPTOMS)}`;
        break;
      case "agent-symptom":
        name = `${r.pick(DISEASE_AGENTS)}'s ${r.pick(SYMPTOMS)}`;
        break;
      case "native-symptom": {
        const word = capitalize(language.word(r.fork("w"), lang!, r.pick(DISEASE_CONCEPTS)));
        name = `${word}'s ${r.pick(SYMPTOMS)}`;
        break;
      }
      case "native-alone": {
        const word = capitalize(language.word(r.fork("w"), lang!, r.pick(DISEASE_CONCEPTS)));
        name = `the ${word}`;
        break;
      }
      case "region-symptom":
        name = `the ${originRegion.name} ${r.pick(SYMPTOMS)}`;
        break;
      case "symptom-of-region":
        name = `the ${r.pick(SYMPTOMS)} of ${originRegion.name}`;
        break;
    }
    if (!used.includes(name)) return name;
  }
  // Exhausted collisions (practically unreachable): stamp with a count.
  return `the ${originRegion.name} Fever (${used.length + 1})`;
}

// ---------------------------------------------------------------------------
// Comet names
// ---------------------------------------------------------------------------

const COMET_ADJECTIVES = [
  "Ashen",
  "Bleeding",
  "Crowned",
  "Pale",
  "Wandering",
  "Iron",
  "Ember",
  "Twin-tailed",
  "Sickle",
  "Harrowing",
] as const;

export function cometName(rng: Rng, language: LanguageService, lang: Language | null): string {
  if (lang && rng.chance(0.35)) {
    const word = capitalize(language.word(rng.fork("w"), lang, "star"));
    return `the ${word} Star`;
  }
  return `the ${rng.pick(COMET_ADJECTIVES)} Star`;
}

// ---------------------------------------------------------------------------
// Plague-aftermath windfalls ("the widow inherited three farms")
// ---------------------------------------------------------------------------

const WINDFALLS = [
  "three farms and a fallow field",
  "a dead cousin's forge and all its tools",
  "two houses on the same lane",
  "an orchard and a bee-yard",
  "the family loom and a chest of silver",
  "an uncle's mill above the weir",
  "a neighbor's oxen and plow",
  "a brother's fishing boat and nets",
  "the tavern at the crossroads",
  "a granary no one else lived to claim",
  "her grandmother's dowry chest, twice over",
  "the sheep of three dead households",
] as const;

export function windfallGain(rng: Rng): string {
  return rng.pick(WINDFALLS);
}

// ---------------------------------------------------------------------------
// Trade wares
// ---------------------------------------------------------------------------

/** "wool and salt" style phrase from a settlement's economy tags. */
export function waresPhrase(rng: Rng, tags: readonly string[]): string {
  if (tags.length === 0) return "grain and hides";
  if (tags.length === 1) return tags[0];
  const pair = rng.pickN(tags, 2);
  return `${pair[0]} and ${pair[1]}`;
}

// ---------------------------------------------------------------------------
// Injuries left by disasters
// ---------------------------------------------------------------------------

export const BURN_INJURIES = [
  "burn-scarred hands",
  "a burn-scarred cheek",
  "smoke-ruined lungs",
] as const;

export const QUAKE_INJURIES = [
  "a crushed hand",
  "a lamed leg",
  "a crooked-healed shoulder",
] as const;
