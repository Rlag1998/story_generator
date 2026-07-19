/**
 * Epithet themes -> English display forms ("the Unbowed", "Hammerhand").
 *
 * The engine asks for epithets by theme key; every language answers in the
 * display tongue (English), but each language keeps a stable "house style"
 * pick among the variants so that, say, cragborn-speaking heroes tend to be
 * "the Unbroken" while riverine ones are "the Unbowed". Unknown themes are
 * dressed up gracefully rather than rejected.
 */

import { fnv1a, Rng } from "../../core/rng";
import type { Language } from "../../core/types";

export const EPITHET_THEMES: Record<string, string[]> = {
  // spirit & temper
  unbowed: ["the Unbowed", "the Unbroken", "the Unbent", "the Defiant"],
  cruel: ["the Cruel", "the Pitiless", "the Flayer", "the Cold of Heart"],
  kind: ["the Kind", "the Openhanded", "the Gentle-Hearted"],
  bold: ["the Bold", "the Daring", "the Fearless"],
  craven: ["the Craven", "the Fleet-Heeled", "the Timid"],
  grim: ["the Grim", "the Stone-Faced", "the Unsmiling"],
  wise: ["the Wise", "the Deep-Minded", "the Far-Seeing"],
  mad: ["the Mad", "the Moonstruck", "the Raving"],
  gentle: ["the Gentle", "the Mild", "the Soft-Spoken"],
  cunning: ["the Cunning", "the Subtle", "the Fox-Minded"],
  honest: ["the Honest", "the Plain-Spoken", "the True"],
  silent: ["the Silent", "the Still-Tongued", "the Wordless"],
  laughing: ["the Laughing", "the Merry", "the Light-Hearted"],
  weeping: ["the Weeping", "the Tearful", "the Red-Eyed"],
  sorrowful: ["the Sorrowful", "the Mournful", "the Grieving"],
  proud: ["the Proud", "the High-Browed", "the Unbending"],
  humble: ["the Humble", "the Low-Spoken", "the Barefoot"],
  wrathful: ["the Wrathful", "the Burning", "the Quick to Anger"],
  // fate & faith
  blessed: ["the Blessed", "the Favored", "the Graced"],
  cursed: ["the Cursed", "the Ill-Starred", "the Shadowed"],
  pious: ["the Pious", "the Devout", "the Prayerful"],
  "twice-born": ["the Twice-Born", "the Reborn", "the Returned"],
  deathless: ["the Deathless", "the Undying", "the Thrice-Spared"],
  prophet: ["the Prophet", "the Far-Spoken", "the Dreamer of True Dreams"],
  oathbreaker: ["the Oathbreaker", "the Forsworn", "the Faithless"],
  kinslayer: ["the Kinslayer", "Kin-Bane", "the Unforgiven"],
  martyr: ["the Martyr", "the Given", "the Candle"],
  // deeds
  merciful: ["the Merciful", "the Forgiving", "the Sparing"],
  merciless: ["the Merciless", "the Unsparing", "the Stonehearted"],
  bloody: ["the Bloody", "the Red-Handed", "Bloodletter"],
  wanderer: ["the Wanderer", "the Far-Strider", "the Roadworn"],
  exile: ["the Exile", "the Outcast", "the Banished"],
  builder: ["the Builder", "the Wall-Raiser", "the Mason"],
  breaker: ["the Breaker", "the Sunderer", "Shieldbreaker"],
  healer: ["the Healer", "the Mender", "the Leech"],
  singer: ["the Singer", "the Sweet-Voiced", "the Lark"],
  scholar: ["the Learned", "the Lettered", "the Ink-Fingered"],
  hammer: ["the Hammer", "Hammerhand", "the Anvil"],
  shield: ["the Shield", "Shieldarm", "the Bulwark"],
  conqueror: ["the Conqueror", "the Victorious", "the Unturned"],
  lawgiver: ["the Lawgiver", "the Just", "the Even-Handed"],
  // marks of the body & of time
  burned: ["the Burned", "the Ash-Marked", "the Fire-Scarred"],
  drowned: ["the Drowned", "the Sea-Taken", "the Tide-Claimed"],
  young: ["the Young", "the Younger", "the Green"],
  old: ["the Old", "the Elder", "the Grey-Bearded"],
  great: ["the Great", "the High", "the Mighty"],
  little: ["the Little", "the Small", "the Lesser"],
  strong: ["the Strong", "the Strong-Handed", "the Oak-Armed"],
  fair: ["the Fair", "the Comely", "the Well-Favored"],
  tall: ["the Tall", "Longshanks", "the Towering"],
  stout: ["the Stout", "the Broad", "the Unmovable"],
  lame: ["the Lame", "the Halt", "the Limping"],
  "one-eyed": ["the One-Eyed", "Blind-Eye", "the Half-Sighted"],
  scarred: ["the Scarred", "the Marked", "the Seam-Faced"],
  pale: ["the Pale", "the Wan", "the Ghost-Faced"],
  // colors
  black: ["the Black", "the Swart", "the Dark"],
  white: ["the White", "the Snow-Fair", "the Hoar"],
  red: ["the Red", "the Ruddy", "the Flame-Haired"],
  grey: ["the Grey", "the Ashen", "the Grizzled"],
  golden: ["the Golden", "the Gilded", "Goldcrowned"],
  silver: ["the Silver", "the Silver-Tongued", "Silverhand"],
  iron: ["the Iron", "Ironhand", "the Iron-Willed"],
  // beasts
  dragon: ["the Dragon", "Dragonheart", "the Wyrm"],
  wolf: ["the Wolf", "Wolf-Blooded", "the Grey Wolf"],
  raven: ["the Raven", "Raven-Feeder", "the Crow"],
  bear: ["the Bear", "the She-Bear", "Bear-Handed"],
  lion: ["the Lion", "Lionheart", "the Old Lion"],
  hawk: ["the Hawk", "Hawk-Eyed", "the Falcon"],
  fox: ["the Fox", "the Sly", "Fox-Wise"],
  serpent: ["the Serpent", "the Adder", "Snake-Tongued"],
  stag: ["the Stag", "the White Stag", "Antler-Crowned"],
  boar: ["the Boar", "the Old Boar", "the Tusked"],
  // world & season
  sea: ["the Seaborn", "the Salt-Blooded", "the Wave-Rider"],
  storm: ["the Storm", "the Storm-Riven", "the Thunderer"],
  winter: ["the Winter-Born", "the Cold", "the Frost-Marked"],
  summer: ["the Summer-Born", "the Sunlit", "the Warm of Hand"],
  harvest: ["the Bountiful", "the Harvest-Handed", "the Provider"],
  mountain: ["the Mountain", "the Stone-Born", "the Unmoved"],
  plague: ["the Plague-Marked", "the Spared", "the Grave-Cheater"],
  fire: ["the Fire-Touched", "the Kindled", "the Ember"],
  night: ["the Night-Born", "the Owl", "the Starlit"],
};

function titleCasePart(part: string): string {
  if (part.length === 0) return part;
  return part[0].toUpperCase() + part.slice(1).toLowerCase();
}

/** Graceful display form for a theme with no table entry: "sea-wolf" -> "the Sea-Wolf". */
export function fallbackEpithet(theme: string): string {
  const cleaned = theme.trim().replace(/[_]+/g, "-");
  const spaced = cleaned
    .split(/\s+/)
    .map((word) => word.split("-").map(titleCasePart).join("-"))
    .join(" ");
  return spaced.length > 0 ? "the " + spaced : "the Nameless";
}

/**
 * Pick an epithet for a theme with per-language house style: each language
 * has a stable favorite variant it uses most of the time, with occasional
 * excursions to the others.
 */
export function pickEpithet(rng: Rng, lang: Language, theme: string): string {
  const key = theme.trim().toLowerCase();
  const variants = EPITHET_THEMES[key];
  if (!variants || variants.length === 0) return fallbackEpithet(key);
  const canonical = variants[fnv1a(lang.family + "|" + lang.name + "|" + key) % variants.length];
  if (variants.length === 1 || rng.chance(0.62)) return canonical;
  return rng.pick(variants);
}
