/**
 * Content pools for religion generation: divine domains and their flavor,
 * virtue/sin pools with cultural affinities, tenet libraries, holy day
 * templates, funerary rites, afterlives, faith-name material, omen signs
 * and readings, miracle accounts.
 *
 * Everything here is static data; all selection happens in generate/tick
 * through the provided Rng. Prose rules: concrete, low-fantasy, medieval
 * adjacent; commas and periods only, never em-dashes.
 */

import type { CultureValue, Deity, ReligionShape } from "../../core/types";

export type Temper = Deity["temper"];

// ---------------------------------------------------------------------------
// Divine domains
// ---------------------------------------------------------------------------

export interface DomainFlavor {
  key: string;
  epithets: string[];
  tempers: Temper[];
  signs: string[];
}

export const DOMAINS: DomainFlavor[] = [
  {
    key: "harvest",
    epithets: ["the Sheaf-crowned", "Lady of the Last Sheaf", "the Open-handed", "Lord of the Threshing Floor"],
    tempers: ["kind", "stern"],
    signs: [
      "the barley came up white as bone in a single night",
      "a whirlwind stood in the stubble field an hour and did not move",
    ],
  },
  {
    key: "storms",
    epithets: ["the Thunder-shod", "Breaker of Masts", "the Sky-wrathful", "Rider of the Black Cloud"],
    tempers: ["stern", "capricious", "hungry"],
    signs: [
      "lightning struck the same oak twice in one storm",
      "hail fell out of a clear sky and lay unmelted till dusk",
    ],
  },
  {
    key: "the sea",
    epithets: ["the Salt-throned", "Keeper of the Ninth Wave", "the Gray-deep", "Mother of Currents"],
    tempers: ["capricious", "distant"],
    signs: [
      "the tide went out at noon and did not turn till dark",
      "a white whale stood off the headland three days",
    ],
  },
  {
    key: "the drowned",
    epithets: ["Warden of the Drowned", "the Tide-taken", "the Cold Ferryman", "Counter of the Lost"],
    tempers: ["distant", "hungry"],
    signs: [
      "drowned men's boots washed ashore laid neatly in a ring",
      "a bell was heard tolling under the bay where no bell hangs",
    ],
  },
  {
    key: "hearth",
    epithets: ["the Ember-keeper", "Mother of the Banked Fire", "the Warm-handed", "Keeper of the Kettle"],
    tempers: ["kind"],
    signs: ["every hearth in the village guttered at the same hour and caught again"],
  },
  {
    key: "oaths",
    epithets: ["the Oath-witness", "the Iron-worded", "Keeper of Sworn Things", "the Unforgetting"],
    tempers: ["stern"],
    signs: ["the oath-stone split from crown to root though no frost had come"],
  },
  {
    key: "the loom of fate",
    epithets: ["the Thread-cutter", "Weaver at the World's Loom", "the Unblinking", "the Measurer"],
    tempers: ["distant", "capricious"],
    signs: ["a spider wove clean across the shrine door in a single night, and none dared break it"],
  },
  {
    key: "boundaries",
    epithets: ["the Stone-marker", "Warden of Hedge and Ford", "the Border-walker", "Keeper of the Gate"],
    tempers: ["stern", "distant"],
    signs: ["the boundary stones of three farms were found turned face-down in the morning"],
  },
  {
    key: "dreams",
    epithets: ["the Night-whisperer", "Opener of the Horn Gate", "the Sleep-shepherd", "the Gray Visitor"],
    tempers: ["capricious", "distant"],
    signs: ["half the town dreamed the same drowned field, and woke at the same hour"],
  },
  {
    key: "the forge",
    epithets: ["the Anvil-song", "Bender of Iron", "the Coal-eyed", "the Nine-hammered"],
    tempers: ["stern", "kind"],
    signs: ["the smith's fire burned green from dusk to dawn and took no wood"],
  },
  {
    key: "the hunt",
    epithets: ["the Antler-crowned", "Lord of the Long Chase", "the Quiet-footed", "the Unseen Archer"],
    tempers: ["capricious", "hungry"],
    signs: ["a white hart walked the high street at dusk and no dog would give tongue"],
  },
  {
    key: "rivers",
    epithets: ["the River-mother", "the Ford-keeper", "Giver of Silt", "the Slow Strong One"],
    tempers: ["kind", "capricious"],
    signs: ["the river ran clear over red stones where no red stones lie"],
  },
  {
    key: "mountains",
    epithets: ["the Root-of-Stone", "the High and Silent", "Keeper of Passes", "the Snow-browed"],
    tempers: ["distant", "stern"],
    signs: ["the mountain smoked at dawn though it holds no fire"],
  },
  {
    key: "the moon",
    epithets: ["the Pale Watcher", "Lantern of the Dead Hours", "the Thrice-faced", "the Silver Herd's Shepherd"],
    tempers: ["distant", "capricious"],
    signs: ["a ring stood round the moon three nights running"],
  },
  {
    key: "the sun",
    epithets: ["the Gold-crowned", "the Morning's Herald", "the Unsetting", "Burner of Mists"],
    tempers: ["kind", "stern"],
    signs: ["the sun rose ringed in haze like a mourner's veil"],
  },
  {
    key: "winter",
    epithets: ["the White-cloaked", "Keeper of the Long Dark", "the Breath-taker", "the Lean Guest"],
    tempers: ["stern", "hungry"],
    signs: ["frost flowered on the well-water in high summer"],
  },
  {
    key: "war",
    epithets: ["the Shield-breaker", "Reaper of the Young", "the Red-handed", "the Spear-mother"],
    tempers: ["hungry", "stern"],
    signs: ["ravens settled on the armory roof at noon and would not be driven off"],
  },
  {
    key: "mercy",
    epithets: ["the Gentle-eyed", "Binder of Wounds", "the Last Refuge", "the Open Door"],
    tempers: ["kind"],
    signs: ["a hard man wept at the shrine gate and could not say why"],
  },
  {
    key: "justice",
    epithets: ["the Even-handed", "Holder of the Scales", "the Unbribed", "the Plain Speaker"],
    tempers: ["stern"],
    signs: ["the gallows-rope frayed through in the night, twice knotted, twice frayed"],
  },
  {
    key: "cunning",
    epithets: ["the Twice-tongued", "the Latch-lifter", "Laughter Behind the Door", "the Purse-light"],
    tempers: ["capricious"],
    signs: ["every lock in the guildhall stood open at dawn, yet nothing was taken"],
  },
  {
    key: "love",
    epithets: ["the Heart-kindler", "the Uninvited Guest", "Singer at Windows", "the Sweet Fever"],
    tempers: ["capricious", "kind"],
    signs: ["doves nested in the bell tower a season out of time"],
  },
  {
    key: "childbirth",
    epithets: ["the Knee-woman", "Opener of the Door of Souls", "the First Cry", "the Cradle-warden"],
    tempers: ["kind"],
    signs: ["three women labored the same night and every child was born at the same bell"],
  },
  {
    key: "the dead",
    epithets: ["Shepherd of the Quiet", "the Gray Porter", "Keeper of the Low Road", "the Name-holder"],
    tempers: ["distant"],
    signs: ["the graveyard yews dropped every needle in a single day"],
  },
  {
    key: "healing",
    epithets: ["the Fever-cooler", "Setter of Bones", "the Green-fingered", "the Steady Hand"],
    tempers: ["kind"],
    signs: ["the sick well ran sweet again after seven sour years"],
  },
  {
    key: "wine",
    epithets: ["Loosener of Tongues", "the Vine-crowned", "the Merry Undoing", "the Cellar's Friend"],
    tempers: ["capricious", "kind"],
    signs: ["the year's first cask came up tasting of honey and ash"],
  },
  {
    key: "song",
    epithets: ["the Sweet-throated", "First Singer", "the Echo-maker", "the Harp Unstrung"],
    tempers: ["kind", "capricious"],
    signs: ["a voice sang in the empty granary from midnight until cockcrow"],
  },
  {
    key: "crossroads",
    epithets: ["the Wayfarer", "Keeper of the Three Roads", "the Dust-shod", "the Milestone's Friend"],
    tempers: ["capricious", "distant"],
    signs: ["every dog in town sat facing the north road at dusk, silent, all together"],
  },
  {
    key: "the wild wood",
    epithets: ["the Green Silence", "Mother of Thickets", "the Unfelled", "the Moss-crowned"],
    tempers: ["capricious", "hungry"],
    signs: ["the wood fell silent of birds for three days together"],
  },
  {
    key: "secrets",
    epithets: ["the Veiled", "Keeper of the Unsaid", "the Still Tongue", "the Closed Book"],
    tempers: ["distant"],
    signs: ["writing stood in the frost on the shrine door, in no hand any scribe knew"],
  },
  {
    key: "vengeance",
    epithets: ["the Long-memoried", "Keeper of Old Wounds", "the Patient Knife", "the Debt-reckoner"],
    tempers: ["hungry", "stern"],
    signs: ["a rusted knife was found driven to the hilt in the feast-hall door"],
  },
  {
    key: "luck",
    epithets: ["the Smiling Stranger", "Turner of Small Wheels", "the Coin-spinner", "the Seventh Guest"],
    tempers: ["capricious"],
    signs: ["a two-headed lamb was born and lived the week out"],
  },
  {
    key: "journeys",
    epithets: ["the Far-walker", "Friend of the Last Mile", "the Lantern at the Gate", "the Road's Own"],
    tempers: ["kind", "distant"],
    signs: ["the swallows came back a full month before their season"],
  },
  {
    key: "wind",
    epithets: ["Piper of the High Places", "the Chaff-scatterer", "the Doorless One", "the Whistler"],
    tempers: ["capricious"],
    signs: ["a wind circled the shrine widdershins from morning until dark"],
  },
  {
    key: "beasts",
    epithets: ["the Herd-warden", "Speaker to Wolves", "the Yoke-easer", "the Byre's Blessing"],
    tempers: ["kind", "capricious"],
    signs: ["the oxen knelt at dawn, all together, facing the mountain"],
  },
];

export const DOMAIN_BY_KEY: Map<string, DomainFlavor> = new Map(DOMAINS.map((d) => [d.key, d]));

/** Which domains a culture's values pull toward the head of the pantheon. */
export const VALUE_DOMAINS: Partial<Record<CultureValue, string[]>> = {
  conquest: ["war", "storms", "vengeance"],
  seafaring: ["the sea", "storms", "the drowned", "wind"],
  craftsmanship: ["the forge", "hearth", "song"],
  kinship: ["hearth", "the dead", "childbirth"],
  piety: ["justice", "mercy", "the sun"],
  learning: ["secrets", "dreams", "the moon"],
  trade: ["journeys", "crossroads", "luck"],
  hospitality: ["hearth", "wine", "journeys"],
  honor: ["oaths", "justice", "war"],
  austerity: ["winter", "mountains", "boundaries"],
  artistry: ["song", "dreams", "the forge"],
  vengeance: ["vengeance", "war", "the dead"],
  stoicism: ["mountains", "winter", "boundaries"],
  revelry: ["wine", "song", "love"],
};

// ---------------------------------------------------------------------------
// Shape-specific deity material
// ---------------------------------------------------------------------------

export interface DualistSide {
  domains: string[];
  epithets: string[];
  tempers: Temper[];
}

export interface DualistAxis {
  bright: DualistSide;
  dark: DualistSide;
}

export const DUALIST_AXES: DualistAxis[] = [
  {
    bright: {
      domains: ["the sun", "hearth"],
      epithets: ["the Lamp Unshaken", "Keeper of the Day", "the Bright Half"],
      tempers: ["kind", "stern"],
    },
    dark: {
      domains: ["winter", "the dead"],
      epithets: ["the Long Shadow", "Keeper of the Unlit Road", "the Cold Half"],
      tempers: ["hungry", "distant"],
    },
  },
  {
    bright: {
      domains: ["justice", "boundaries"],
      epithets: ["Holder of the Scales", "the Wall-raiser", "the Straight Furrow"],
      tempers: ["stern"],
    },
    dark: {
      domains: ["storms", "the wild wood"],
      epithets: ["the Unfenced", "Breaker of Furrows", "the Green Riot"],
      tempers: ["capricious", "hungry"],
    },
  },
  {
    bright: {
      domains: ["mercy", "healing"],
      epithets: ["Binder of Wounds", "the Open Hand", "the Full Bowl"],
      tempers: ["kind"],
    },
    dark: {
      domains: ["winter", "the drowned"],
      epithets: ["the Empty Bowl", "the Tide-taken", "the Lean Guest"],
      tempers: ["hungry"],
    },
  },
  {
    bright: {
      domains: ["the sun", "wind"],
      epithets: ["the High Herald", "Rider of the Morning", "the Unsetting"],
      tempers: ["kind", "capricious"],
    },
    dark: {
      domains: ["the sea", "the drowned"],
      epithets: ["the Gray-deep", "Keeper of the Ninth Wave", "the Under-tow"],
      tempers: ["distant", "hungry"],
    },
  },
];

export const MONIST_EPITHETS = [
  "the Undivided",
  "the First Breath",
  "the Wheel That Turns Itself",
  "the Sea All Rivers Seek",
  "the One Behind the Many",
];
export const MONIST_DOMAINS = ["the sun", "the loom of fate", "justice", "dreams", "the sea"];

export const ANCESTOR_EPITHETS = [
  "the First of the Line",
  "the Nine-times-honored",
  "who cleared the valley",
  "who crossed the ice",
  "who spoke the first law",
  "the Hearth-founder",
  "who planted the old orchard",
  "who held the ford alone",
  "the Grandmother of Oaths",
  "the Grandsire of the Roofbeam",
];
export const ANCESTOR_DOMAINS = ["hearth", "oaths", "boundaries", "the dead", "harvest", "journeys", "war"];

export const ANIMIST_EPITHETS = [
  "of the River",
  "of the Old Wood",
  "of the High Stones",
  "of the Marsh Lights",
  "of the Three Springs",
  "of the Hollow Hill",
  "of the Reed Beds",
  "of the White Falls",
  "of the First Ford",
  "of the Standing Oak",
];
export const ANIMIST_DOMAINS = [
  "rivers",
  "the wild wood",
  "mountains",
  "storms",
  "beasts",
  "crossroads",
  "wind",
  "the sea",
];

export const MYSTERY_VEILED_EPITHETS = [
  "the Veiled",
  "whose name is spoken only below",
  "the Face Behind the Face",
  "the Unlit Lamp",
];
export const MYSTERY_VEILED_DOMAINS = ["secrets", "dreams", "the moon", "the dead"];
export const MYSTERY_GUIDE_EPITHETS = [
  "the Lantern-bearer",
  "Opener of the Low Door",
  "the First Initiate",
];
export const MYSTERY_GUIDE_DOMAINS = ["crossroads", "journeys", "dreams"];

// ---------------------------------------------------------------------------
// Virtues and sins
// ---------------------------------------------------------------------------

export interface MoralEntry {
  text: string;
  values: CultureValue[];
  shapes?: ReligionShape[];
}

export const VIRTUE_POOL: MoralEntry[] = [
  { text: "mercy", values: ["piety"] },
  { text: "candor", values: ["honor", "learning"] },
  { text: "oathkeeping", values: ["honor"] },
  { text: "hospitality", values: ["hospitality"] },
  { text: "almsgiving", values: ["piety", "trade"] },
  { text: "patience", values: ["stoicism"] },
  { text: "thrift", values: ["austerity", "trade"] },
  { text: "honest measure", values: ["trade", "craftsmanship"] },
  { text: "care of the dead", values: ["kinship"], shapes: ["ancestor"] },
  { text: "loyalty to kin", values: ["kinship"] },
  { text: "courage before the strong", values: ["conquest", "honor"] },
  { text: "humility", values: ["piety", "austerity"] },
  { text: "keeping the fast", values: ["piety", "austerity"] },
  { text: "learning kept and taught", values: ["learning"] },
  { text: "the open door", values: ["hospitality"] },
  { text: "songcraft", values: ["artistry", "revelry"] },
  { text: "quiet endurance", values: ["stoicism"] },
  { text: "tending the hearth", values: ["kinship"] },
  { text: "mending what is broken", values: ["craftsmanship"] },
  { text: "truth spoken to lords", values: ["honor", "learning"] },
  { text: "kindness to beasts", values: [] },
  { text: "the well-kept boundary", values: ["stoicism"] },
  { text: "remembrance of ancestors", values: ["kinship"], shapes: ["ancestor"] },
  { text: "silence rightly kept", values: [], shapes: ["mystery"] },
  { text: "pilgrimage", values: ["piety"] },
  { text: "planting for one's heirs", values: ["kinship"] },
  { text: "paying the sea her portion", values: ["seafaring"] },
  { text: "the shared roof in storm", values: ["hospitality", "seafaring"] },
];

export const SIN_POOL: MoralEntry[] = [
  { text: "oathbreaking", values: ["honor"] },
  { text: "kinslaying", values: ["kinship"] },
  { text: "avarice", values: ["austerity", "piety"] },
  { text: "turning away a guest", values: ["hospitality"] },
  { text: "false witness", values: ["honor", "learning"] },
  { text: "theft from the dead", values: ["kinship"], shapes: ["ancestor"] },
  { text: "mockery of the gods", values: ["piety"] },
  { text: "cowardice", values: ["conquest", "honor"] },
  { text: "gluttony in famine", values: ["austerity"] },
  { text: "usury", values: ["austerity", "piety"] },
  { text: "spilling blood on holy ground", values: ["piety"] },
  { text: "letting the hearth die", values: ["kinship"] },
  { text: "pride before the gods", values: ["piety"] },
  { text: "burning of books", values: ["learning"] },
  { text: "the unpaid wage", values: ["craftsmanship", "trade"] },
  { text: "poisoncraft", values: [] },
  { text: "striking an elder", values: ["kinship", "stoicism"] },
  { text: "boasting of the hunt before the kill", values: ["conquest"] },
  { text: "naming the deep wind at sea", values: ["seafaring"] },
  { text: "prying at the mysteries", values: [], shapes: ["mystery"] },
];

/**
 * Paired doctrines: matters over which faiths honestly differ. Generation
 * sometimes adopts one side; a schism may invert whichever side is held.
 */
export interface DoctrinePair {
  virtue: string;
  sin: string;
  subject: string;
}

export const DOCTRINE_PAIRS: DoctrinePair[] = [
  { virtue: "the shared cup", sin: "drunkenness", subject: "wine" },
  { virtue: "dance as worship", sin: "dancing on holy days", subject: "the dance" },
  { virtue: "grief worn openly", sin: "mourning beyond a year", subject: "open grief" },
  { virtue: "the dead named aloud", sin: "speaking the names of the dead", subject: "the naming of the dead" },
  { virtue: "chance read as the god's voice", sin: "dicing", subject: "the casting of lots" },
  { virtue: "feasting at the fast's end", sin: "eating flesh in the fast-months", subject: "the fast" },
  { virtue: "trade under the god's eye", sin: "haggling in the shrine-porch", subject: "trade at the shrine" },
  { virtue: "the god shown in paint and stone", sin: "graven images of the god", subject: "graven images" },
];

// ---------------------------------------------------------------------------
// Tenets
// ---------------------------------------------------------------------------

export interface TenetEntry {
  text: string;
  shapes?: ReligionShape[];
  values?: CultureValue[];
}

export const TENETS: TenetEntry[] = [
  // Concrete, universal.
  { text: "Never turn a traveler from the door after dark." },
  { text: "Salt the threshold before a burial, and again after." },
  { text: "A promise made at the hearth binds for a year and a day." },
  { text: "Do not count your own children aloud." },
  { text: "First bread of the harvest goes to the birds." },
  { text: "Mend your quarrels before the year turns, or carry them doubled." },
  { text: "Give the first cup to the ground and the last to the guest." },
  { text: "No blade is drawn beneath a roof that has fed you." },
  { text: "Name no boat, child, or blade before its third day." },
  { text: "What is borrowed from a widow is returned twofold." },
  { text: "Plant a tree at a birth. Fell none at a death." },
  { text: "Do not whistle after dark. You do not know what answers." },
  { text: "Keep one lamp lit where the road enters the village." },
  // Value-flavored.
  { text: "An oath sworn on iron cannot be unsaid.", values: ["honor"] },
  { text: "Better a broken bone than a broken word.", values: ["honor"] },
  { text: "The guest's cup is filled first, though the host go dry.", values: ["hospitality"] },
  { text: "A letter burned is a door bricked shut.", values: ["learning"] },
  { text: "Teach the child of your enemy, and you bury the feud.", values: ["learning"] },
  { text: "Kin may quarrel with words, never with knives.", values: ["kinship"] },
  { text: "The family's bread is broken, never cut.", values: ["kinship"] },
  { text: "Enter no shrine with iron at your belt.", values: ["piety"] },
  { text: "The gods hear the poor first. Be careful what the poor say of you.", values: ["piety"] },
  { text: "Take no field you will not plow.", values: ["conquest"] },
  { text: "Pay the sea before she asks.", values: ["seafaring"] },
  { text: "Speak no drowned man's name aboard his boat.", values: ["seafaring"] },
  { text: "Cheat no stranger. The gods travel dressed as strangers.", values: ["trade", "hospitality"] },
  { text: "Eat to live. The full bowl owes the empty one.", values: ["austerity"] },
  { text: "Finish what you carve. The unfinished thing dreams of you.", values: ["artistry", "craftsmanship"] },
  { text: "Write the wrong on the door-post and read it every morning, until it is paid.", values: ["vengeance"] },
  { text: "Complaint is a debt paid to no one.", values: ["stoicism"] },
  { text: "Grief is honored with one night. Joy is owed the rest.", values: ["revelry"] },
  { text: "Sign your work, and let it speak when you are dust.", values: ["craftsmanship"] },
  // Shape-flavored.
  { text: "Feed every altar, but keep your own god's day.", shapes: ["pantheon"] },
  { text: "Quarrel with a god and you quarrel with the weather.", shapes: ["pantheon"] },
  { text: "Every gift casts a shadow. Weigh both before you take it.", shapes: ["dualist"] },
  { text: "Light a lamp at dusk, that {adversary} find no lodging.", shapes: ["dualist"] },
  { text: "Keep the balance in small things, and the great scales keep themselves.", shapes: ["dualist"] },
  { text: "The One wears many faces. Greet each as you would the whole.", shapes: ["monist"] },
  { text: "Hearth-flame, river, grave-moss: one breath breathes them all.", shapes: ["monist"] },
  { text: "Whoever you wrong, you wrong the One.", shapes: ["monist"] },
  { text: "Speak your dead by name at the new year, lest they wander.", shapes: ["ancestor"] },
  { text: "Keep a stool empty at the feast for the grandmothers.", shapes: ["ancestor"] },
  { text: "Ask the dead before you sell the land they cleared.", shapes: ["ancestor"] },
  { text: "Ask the river before you bridge it.", shapes: ["animist"] },
  { text: "Spill a little of every brewing for the ground that grew it.", shapes: ["animist"] },
  { text: "Take from the wood at noon, never at dusk, and leave a thread in payment.", shapes: ["animist"] },
  { text: "What is heard below is not repeated above.", shapes: ["mystery"] },
  { text: "The unveiled face is shown to the initiated alone.", shapes: ["mystery"] },
  { text: "Answer the curious with bread, never with truth.", shapes: ["mystery"] },
  // Deity-anchored.
  { text: "On {chief}'s day no blade is drawn and no debt is called." },
  { text: "Swear by {chief} only what you would pay for in blood or barley." },
];

// ---------------------------------------------------------------------------
// Holy days
// ---------------------------------------------------------------------------

export interface HolyDayTemplate {
  names: string[];
  theme: string;
}

/** Indexed by season 0 spring, 1 summer, 2 autumn, 3 winter. */
export const SEASON_DAYS: HolyDayTemplate[][] = [
  [
    { names: ["The Feast of First Furrows", "The Waking of the Fields", "The Seed-blessing"], theme: "sowing" },
    { names: ["The Unbinding", "The Feast of the Thaw", "The Opening of Roads"], theme: "renewal" },
    { names: ["The Feast of New Lambs", "The Cradle-blessing"], theme: "childbirth" },
  ],
  [
    { names: ["The High Sun's Feast", "Midsummer's Crown", "The Long Light"], theme: "the sun" },
    { names: ["The Sea's Portion", "The Feast of the Ninth Wave", "The Salt-giving"], theme: "the sea's mercy" },
    { names: ["The First Fruits", "The Green Table"], theme: "first fruits" },
  ],
  [
    { names: ["The Last Sheaf", "The Feast of the Full Barn", "The Gleaners' Due"], theme: "harvest" },
    { names: ["The Night of the Quiet Guests", "The Feast of the Empty Chair"], theme: "the dead" },
    { names: ["The Weighing", "The Days of Ash", "The Unburdening"], theme: "atonement" },
  ],
  [
    { names: ["The Long Night's Vigil", "The Feast of the Banked Fire", "Embertide"], theme: "the long night" },
    { names: ["The Feast of Lamps", "The Sun's Waking", "The Turning"], theme: "the returning light" },
    { names: ["The Oath-renewal", "The Speaking of Names"], theme: "oath-renewal" },
  ],
];

export const DEITY_DAY_PATTERNS = ["The Feast of {d}", "{d}'s Vigil", "The Procession of {d}"];

export const SHAPE_DAYS: Partial<Record<ReligionShape, HolyDayTemplate[]>> = {
  ancestor: [
    { names: ["The Night of the Quiet Guests", "The Feast of the Empty Chair", "The Speaking of Names"], theme: "the dead" },
  ],
  mystery: [
    { names: ["The Night Below", "The Unveiling", "The Descent"], theme: "the mysteries" },
  ],
  dualist: [
    { names: ["The Day of Equal Shadows", "The Weighing of the Year"], theme: "the balance" },
  ],
};

// ---------------------------------------------------------------------------
// Funerals and afterlives
// ---------------------------------------------------------------------------

export const FUNERAL_RITES: Record<ReligionShape, string[]> = {
  pantheon: [
    "The dead are burned at dusk on a pyre of ash-wood, and the ashes plowed into the family's field.",
    "The dead lie one night in the temple porch with coins on their eyes for {chief}'s porter, and are buried at first light.",
    "The dead are carried three times round the shrine, then buried facing sunrise with a sprig of rue in each hand.",
  ],
  dualist: [
    "The dead are burned between two fires, one for what they were, one for what they might have been.",
    "The body is washed in salt water and laid facing the sunrise, that the light may claim its share first.",
  ],
  monist: [
    "The dead are wrapped in undyed cloth and buried without a marker, for the One needs no signpost to find its own.",
    "The body is burned and the ash given to running water, a spark returned to the current.",
  ],
  ancestor: [
    "The dead are washed by their eldest kin and laid in the house-barrow with bread and a knife for the road.",
    "The dead are buried beneath the threshold stone, that they may keep the door they kept in life.",
    "The dead sit one last night at the family table, and at dawn are carried out feet first through a gap broken in the wall.",
  ],
  animist: [
    "The dead are given to the river at first light, adrift on a raft of reeds, with a coin under the tongue.",
    "The dead are laid at the wood's edge beneath a young tree, that the roots may take what the family cannot keep.",
    "The dead are carried above the treeline and left for sky and birds, that nothing be wasted.",
  ],
  mystery: [
    "The dead are buried at night by initiates, faces veiled, their names given back to the god who lent them.",
    "The dead are sealed in the crypt with a lamp left burning, and what the lamp sees is not spoken.",
  ],
};

export const AFTERLIVES: Record<ReligionShape, string[]> = {
  pantheon: [
    "The worthy feast in {chief}'s hall until the world's last morning.",
    "Each soul serves in death the god it served in life, in field or hall or storm.",
  ],
  dualist: [
    "Every soul walks the knife-bridge. The light-hearted cross, the heavy-hearted fall.",
    "The soul is divided at death, the bright half rising, the dark half buried with the bones.",
  ],
  monist: [
    "Every soul is a spark returning to the One, as rivers return to the sea.",
    "Death is the One remembering what it briefly forgot.",
  ],
  ancestor: [
    "The dead stay in the house walls, watching, warming their hands at the hearth they built.",
    "The dead sit at the long table of the family, and every feast sets them a place.",
  ],
  animist: [
    "The dead go into the land, into root and stone and rain, and speak in its small sounds.",
    "The dead become the places that held them. Tread gently, you walk on your grandmothers.",
  ],
  mystery: [
    "The initiated wake on the far shore. The rest only sleep.",
    "What waits beyond is known, but only to those who have gone below and come back changed.",
  ],
};

// ---------------------------------------------------------------------------
// Faith naming
// ---------------------------------------------------------------------------

export interface FaithNoun {
  /** Display phrase used inside names, e.g. "Embers", "the Loom". */
  phrase: string;
  /** Single-word stem for adherent names and clergy compounds. */
  stem: string;
  shapes?: ReligionShape[];
}

export const FAITH_NOUNS: FaithNoun[] = [
  { phrase: "Embers", stem: "Ember", shapes: ["pantheon", "monist", "dualist"] },
  { phrase: "the Sheaf", stem: "Sheaf", shapes: ["pantheon", "ancestor"] },
  { phrase: "the Tide", stem: "Tide", shapes: ["pantheon", "animist"] },
  { phrase: "the Lamp", stem: "Lamp", shapes: ["pantheon", "dualist", "monist"] },
  { phrase: "the Open Door", stem: "Door", shapes: ["pantheon", "ancestor"] },
  { phrase: "the Loom", stem: "Loom", shapes: ["monist", "mystery", "pantheon"] },
  { phrase: "the Unbroken Thread", stem: "Thread", shapes: ["monist", "ancestor"] },
  { phrase: "the Wheel", stem: "Wheel", shapes: ["monist", "dualist"] },
  { phrase: "the First Fire", stem: "Fire", shapes: ["monist", "pantheon"] },
  { phrase: "the Scales", stem: "Scale", shapes: ["dualist"] },
  { phrase: "the Two Lamps", stem: "Lamp", shapes: ["dualist"] },
  { phrase: "the Barrow", stem: "Barrow", shapes: ["ancestor"] },
  { phrase: "the Long Table", stem: "Table", shapes: ["ancestor"] },
  { phrase: "the Wellspring", stem: "Well", shapes: ["animist"] },
  { phrase: "the Green Ways", stem: "Green", shapes: ["animist"] },
  { phrase: "the Standing Stones", stem: "Stone", shapes: ["animist", "ancestor"] },
  { phrase: "the Veil", stem: "Veil", shapes: ["mystery"] },
  { phrase: "the Deep", stem: "Deep", shapes: ["mystery", "animist"] },
  { phrase: "the Quiet", stem: "Quiet", shapes: ["mystery", "monist"] },
  { phrase: "Ash and Seed", stem: "Ash", shapes: ["pantheon", "dualist", "ancestor"] },
];

/** Fixed shape-specific names, used sparingly. */
export const SHAPE_FAITH_NAMES: Partial<Record<ReligionShape, string[]>> = {
  ancestor: ["The Old Observance", "The Remembering", "The Long Table"],
  mystery: ["The Rite Below", "The Veiled Way"],
  dualist: ["The Weighing Way"],
  animist: ["The Speaking Land"],
};

export const CLERGY_ROOTS = [
  "Cinder",
  "Ash",
  "Sheaf",
  "Tide",
  "Barrow",
  "Lamp",
  "Thread",
  "Well",
  "Stone",
  "Vine",
  "Salt",
  "Dusk",
  "Raven",
  "Ember",
];

// ---------------------------------------------------------------------------
// Omens, miracles, festival hooks
// ---------------------------------------------------------------------------

export const OMEN_SIGNS: string[] = [
  "a ring stood round the moon three nights running",
  "crows gathered on the shrine roof at noon and would not be driven off",
  "the well-water rose red as rust and sank clear again by evening",
  "a rain of small fish fell on the market square",
  "bees swarmed in midwinter",
  "a two-headed calf was born and lived the week",
  "the shrine-bell tolled with no hand on the rope",
  "frost wrote strange letters on the temple door",
  "a white hart walked the high street at dusk",
  "the sacred fire burned blue for a day and a night",
  "lightning split the gallows-oak",
  "hens crowed like cocks from every yard at once",
];

export type OmenAnxiety = "war" | "famine" | "plague" | "succession" | "generic";

export const OMEN_READINGS: Record<OmenAnxiety, string[]> = {
  war: [
    "Read at the shrine as blood calling for blood: the war will take more than it gives.",
    "The wise say it means the war has woken older debts than any lord can pay.",
    "Taken to mean that {chief} walks with the enemy until the shrines are paid their due.",
  ],
  famine: [
    "Whispered to mean the grain will fail again unless the first loaf is given whole.",
    "Read as the earth's own hunger, which must be fed before it feeds.",
    "The old women say it is the lean year's herald, and they have been right before.",
  ],
  plague: [
    "Read as the fever's herald. Doors were marked with ash by morning.",
    "Taken to mean the sickness is a guest who has not finished eating.",
    "The {clergy} says the dead are crowding the low road, and the living should not jostle them.",
  ],
  succession: [
    "Read as a warning that the high seat will soon stand empty, and worse, be quarreled over.",
    "Taken at court to concern the succession, though none dares say so above a whisper.",
  ],
  generic: [
    "Read as a caution against broken oaths, of which every village keeps its share.",
    "The {clergy} took it for a harvest sign. The sailors took it for a sea sign. Both lit candles.",
    "Some called it a blessing, some a warning. Candles were lit either way.",
    "Taken to mean the dead are owed a remembering that the living have put off too long.",
  ],
};

export const TEMPLE_MIRACLES: string[] = [
  "A fever counted mortal broke within the hour when the {clergy} laid the god's cloth on the sick man's chest.",
  "The shrine lamp burned nine days on a single measure of oil.",
  "A child pulled cold from the millpond breathed again when {chief}'s name was spoken over her.",
  "Bread enough for ten fed forty at the temple door, and there were crumbs after.",
  "A withered apple bough set on the altar stood in white blossom by morning.",
];

export const SIGHTED_MIRACLES: string[] = [
  "One born with the Sight fell down at the well and spoke an hour in a voice not their own, of floods and of forgiveness.",
  "A Sighted dreamer walked straight to the drowned child beneath the ice, saying the river had shown the place.",
  "One with the Sight foretold the lightning-struck barn a day before the storm, and not a beast was lost.",
  "A Sighted woman named the thief in her sleep, and the stolen plate was on the shrine steps by dawn.",
];

export const QUARREL_TOPICS: string[] = [
  "a place at the head of the procession",
  "an old debt recalled in drink",
  "the last cask of festival ale",
  "whose grandmother wove the god's mantle",
  "a slight at the offering table",
  "a boundary stone moved a hand's breadth",
  "words said over the offering plate",
  "who rang the shrine-bell first",
];

export const TEMPLE_DEDICATION_PATTERNS = [
  "raised to {chief}",
  "dedicated to {chief}",
  "vowed after a hard winter",
  "raised on the old shrine's footing",
];
