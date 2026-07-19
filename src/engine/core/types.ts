/**
 * Shared entity types and service contracts for the Aeonspire engine.
 *
 * This file is the single source of truth for cross-module shapes.
 * Modules communicate ONLY through these types and the `Services` registry —
 * engine modules must never import each other directly (prevents cycles).
 */

import type { Rng } from "./rng";
import type { SimDate } from "./time";

// ---------------------------------------------------------------------------
// IDs — plain numbers, unique per entity kind, allocated by World.
// ---------------------------------------------------------------------------

export type PersonId = number;
export type HouseId = number;
export type CultureId = number;
export type ReligionId = number;
export type LanguageId = number;
export type RegionId = number;
export type SettlementId = number;
export type PolityId = number;
export type EventId = number;
export type StorylineId = number;
export type DeityId = number;

// ---------------------------------------------------------------------------
// Genetics (abstract game-genetics, not biology)
// ---------------------------------------------------------------------------

/**
 * A genome is a fixed-length array of loci; each locus holds two allele
 * indices (maternal, paternal) into that locus's allele pool as defined by
 * the genetics module's locus catalog.
 */
export type Genome = Int16Array;

export type Sex = "f" | "m";

/** Expressed appearance + predispositions, derived from genome (+ sex). */
export interface Phenotype {
  // Appearance (all values are indices/scalars whose meaning is defined by
  // the genetics module; the portrait module maps them to visuals).
  skinTone: number; // 0..1 continuous
  hairColor: number; // index into HAIR_COLORS
  hairTexture: number; // 0 straight, 1 wavy, 2 curly, 3 coiled
  eyeColor: number; // index into EYE_COLORS
  heightScore: number; // z-score-ish, -3..+3
  buildScore: number; // -3 (slight) .. +3 (heavy-set)
  faceShape: number; // discrete face archetype index
  noseShape: number;
  jawShape: number;
  browShape: number;
  mouthShape: number;
  earShape: number;
  freckles: boolean;
  dimples: boolean;
  cleftChin: boolean;
  /** Distinct rare/visible variations expressed (keys from RARE_TRAITS). */
  rareTraits: string[];
  // Predispositions (baselines; life events shift the realized values)
  tempOpenness: number; // -1..1
  tempDiligence: number;
  tempSociability: number;
  tempAgreeableness: number;
  tempVolatility: number; // emotional volatility
  aptitudes: Partial<Record<Aptitude, number>>; // 0..3 giftedness
  constitution: number; // -1 frail .. +1 robust (health modifier)
  fertilityMod: number; // multiplier around 1.0
  twinningMod: number; // multiplier around 1.0 for multiple births
  longevityMod: number; // multiplier around 1.0
}

export type Aptitude =
  | "war"
  | "craft"
  | "lore"
  | "music"
  | "oratory"
  | "trade"
  | "healing"
  | "intrigue"
  | "husbandry"
  | "seafaring";

// ---------------------------------------------------------------------------
// Personality & traits
// ---------------------------------------------------------------------------

/**
 * Realized personality: genetic baseline + upbringing + life events.
 * Axes are -1..1. Named traits are derived labels used by narrative/UI
 * and by decision weights.
 */
export interface Personality {
  openness: number;
  diligence: number;
  sociability: number;
  agreeableness: number;
  volatility: number;
  courage: number; // -1 craven .. 1 fearless
  ambition: number; // 0..1
  piety: number; // 0..1
  honor: number; // -1 treacherous .. 1 principled
  lust: number; // 0..1
  greed: number; // 0..1
  wrath: number; // 0..1
  compassion: number; // 0..1
  /** Derived labels, e.g. "brooding", "silver-tongued". */
  traits: string[];
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type LifeStage = "infant" | "child" | "youth" | "adult" | "elder";

export type ProfessionKey =
  | "none" // children, elderly dependents
  | "farmer"
  | "herder"
  | "fisher"
  | "hunter"
  | "miner"
  | "smith"
  | "carpenter"
  | "mason"
  | "weaver"
  | "potter"
  | "brewer"
  | "baker"
  | "merchant"
  | "peddler"
  | "innkeeper"
  | "healer"
  | "midwife"
  | "scribe"
  | "scholar"
  | "priest"
  | "monastic"
  | "bard"
  | "artist"
  | "soldier"
  | "guard"
  | "sailor"
  | "servant"
  | "courtier"
  | "steward"
  | "ruler"
  | "noble"
  | "judge"
  | "beggar"
  | "thief"
  | "smuggler"
  | "gravedigger"
  | "falconer"
  | "gardener";

export interface Marriage {
  spouse: PersonId;
  date: SimDate;
  /** Whether this union is currently active (false = widowed/divorced). */
  active: boolean;
  endDate?: SimDate;
  endReason?: "death" | "divorce" | "annulment";
}

export interface Pregnancy {
  father: PersonId;
  conceived: SimDate;
  due: SimDate;
  /** Number of children (1 = single, 2 = twins, 3 = triplets). */
  litter: number;
  /** True if conceived outside marriage (drives secrets/drama). */
  illicit: boolean;
}

export interface Illness {
  name: string;
  onset: SimDate;
  /** 0..1 severity; modifies monthly death hazard while active. */
  severity: number;
  chronic: boolean;
}

export interface PersonStatus {
  profession: ProfessionKey;
  /** 0 destitute .. 5 opulent */
  wealth: number;
  /** Social rank: 0 outcast, 1 commoner, 2 freeholder, 3 gentry, 4 noble, 5 royal */
  rank: number;
  titles: string[]; // display titles, e.g. "Chief of Harrowmere"
  literate: boolean;
}

export interface Person {
  id: PersonId;
  /** Given name in their culture's language. */
  givenName: string;
  /** Family/patronymic/etc. per culture naming convention (display form). */
  surname: string;
  /** Earned epithet, e.g. "the Unbowed" (empty if none). */
  epithet: string;
  nickname: string; // childhood/informal name, may be ""
  sex: Sex;
  culture: CultureId;
  religion: ReligionId;
  house: HouseId | null;
  born: SimDate;
  died: SimDate | null;
  deathCause: string | null;
  /** Location (settlement). Emigrated/vanished people may have null. */
  location: SettlementId | null;
  mother: PersonId | null;
  father: PersonId | null;
  /** Acknowledged father if different from biological (secrets!). */
  legalFather: PersonId | null;
  children: PersonId[];
  marriages: Marriage[];
  betrothed: PersonId | null;
  pregnancy: Pregnancy | null;
  genome: Genome;
  phenotype: Phenotype;
  personality: Personality;
  status: PersonStatus;
  illnesses: Illness[];
  injuries: string[]; // permanent marks: "lost left eye", "burn-scarred hands"
  /** Storylines this person is currently entangled in. */
  storylines: StorylineId[];
  /** Accumulated drama/notability score (importance-weighted events). */
  notability: number;
  /** Twin/triplet cohort — ids of siblings born in the same litter. */
  litterMates: PersonId[];
  /** Arbitrary engine flags (module-namespaced keys, e.g. "story.cursed"). */
  flags: Record<string, number | string | boolean>;
}

// ---------------------------------------------------------------------------
// Relationships (social module owns semantics)
// ---------------------------------------------------------------------------

export type RelKind =
  | "friend"
  | "rival"
  | "lover"
  | "mentor"
  | "ward"
  | "sworn" // sworn companion / blood-oath
  | "nemesis";

export interface Relationship {
  kind: RelKind;
  since: SimDate;
  /** -100..100 current warmth (independent of kind for nuance). */
  opinion: number;
}

/** Sparse relationship store: person -> other -> relationship. */
export type RelationshipMap = Map<PersonId, Map<PersonId, Relationship>>;

export interface Memory {
  event: EventId;
  /** How strongly this memory weighs on the person (fades over years). */
  weight: number;
  /** Positive or negative coloring toward the subject person, if any. */
  about: PersonId | null;
  feeling: number; // -1..1
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export interface Phonology {
  consonants: string[];
  vowels: string[];
  /** Syllable templates like "CV", "CVC", "VC", "CCV" (C=consonant, V=vowel). */
  patterns: string[];
  /** Weights parallel to patterns. */
  patternWeights: number[];
  /** Allowed word-final consonants (subset of consonants; empty = open syllables). */
  finals: string[];
  /** Optional orthography flavor replacements applied after assembly. */
  orthography: [string, string][];
  /** Forbidden letter sequences (post-assembly filter). */
  forbidden: string[];
}

export type NameOrder = "given-family" | "family-given" | "given-only" | "given-patronymic";

export interface Language {
  id: LanguageId;
  name: string; // endonym, e.g. "Vessari"
  family: string; // language family label (shared by related languages)
  parent: LanguageId | null;
  phonology: Phonology;
  /** Gendered given-name endings/flavor. */
  femaleEndings: string[];
  maleEndings: string[];
  /** patronymic affix, e.g. ["", "sdottir"] or ["ap ", ""] (prefix, suffix). */
  patronymicF: [string, string];
  patronymicM: [string, string];
  /** Small concept lexicon for flavor: concept key -> word. */
  lexicon: Record<string, string>;
  /** Month names (12) in this tongue, for narrative flavor. */
  monthNames: string[];
}

// ---------------------------------------------------------------------------
// Culture
// ---------------------------------------------------------------------------

export type MarriageCustom = "monogamy" | "polygyny-elite" | "handfast-renewal";
export type DescentRule = "patrilineal" | "matrilineal" | "cognatic";
export type InheritanceCustom =
  | "primogeniture" // eldest child (per descent rule)
  | "ultimogeniture" // youngest
  | "gavelkind" // split among children
  | "seniority" // eldest member of the house
  | "elective"; // chosen by council/peers

export type CultureValue =
  | "honor"
  | "hospitality"
  | "learning"
  | "piety"
  | "craftsmanship"
  | "kinship"
  | "conquest"
  | "seafaring"
  | "trade"
  | "austerity"
  | "artistry"
  | "vengeance"
  | "stoicism"
  | "revelry";

export interface Tradition {
  key: string; // stable key, e.g. "sky-burial"
  name: string; // display name, e.g. "The Sky Returns Its Own"
  description: string;
  /** Hook tags the event systems react to, e.g. "funeral", "coming-of-age". */
  hooks: string[];
}

export interface Culture {
  id: CultureId;
  name: string; // e.g. "Vessarin"
  demonym: string; // e.g. "Vessari"
  language: LanguageId;
  parent: CultureId | null;
  values: CultureValue[]; // 3-4 core values, ordered by priority
  marriage: MarriageCustom;
  descent: DescentRule;
  inheritance: InheritanceCustom;
  nameOrder: NameOrder;
  /** Chance children get grandparent names ("ancestor veneration" naming). */
  ancestorNaming: number; // 0..1
  traditions: Tradition[];
  /** Age (years) of legal/ritual adulthood. */
  adulthoodAge: number;
  /** Typical marriage age offsets for f/m. */
  marriageAgeF: number;
  marriageAgeM: number;
  /** Preferred color palette for UI flavor (hex strings). */
  colors: [string, string];
  /** Attitude scalars 0..1 used by event weighting. */
  attitudes: {
    violence: number; // acceptance of feuds/duels
    mysticism: number; // omens, superstition
    patriarchy: number; // 0 = egalitarian, 1 = strongly patriarchal
    openness: number; // to strangers/other cultures
  };
}

// ---------------------------------------------------------------------------
// Religion
// ---------------------------------------------------------------------------

export type ReligionShape =
  | "pantheon" // many gods with domains
  | "dualist" // two opposing principles
  | "monist" // single godhead
  | "ancestor" // ancestor veneration
  | "animist" // spirits of place
  | "mystery"; // esoteric mystery cult

export interface Deity {
  id: DeityId;
  name: string;
  epithet: string; // "the Ninefold Flame"
  domains: string[]; // e.g. ["harvest", "mercy"]
  temper: "kind" | "stern" | "capricious" | "distant" | "hungry";
}

export interface HolyDay {
  name: string;
  month: number; // 1..12
  theme: string; // "renewal", "the dead", "first fruits"...
}

export interface Religion {
  id: ReligionId;
  name: string; // "The Way of Embers"
  adherentName: string; // "Emberkind"
  shape: ReligionShape;
  deities: Deity[]; // empty for monist/animist as appropriate
  virtues: string[]; // e.g. ["mercy", "candor"]
  sins: string[]; // e.g. ["oathbreaking", "avarice"]
  holyDays: HolyDay[];
  /** Priesthood flavor. */
  clergyTitle: string; // e.g. "Cindermother"
  clergyCelibate: boolean;
  clergyGender: "any" | "f" | "m";
  /** Funerary rite description (used by narrative for deaths). */
  funeralRite: string;
  afterlife: string; // one-line belief
  origin: CultureId;
  parent: ReligionId | null; // for schisms
  founder: PersonId | null; // prophet/heresiarch if schismatic
  /** 0..1 how much this faith polices behavior (drives trials/persecution). */
  zeal: number;
  tenets: string[]; // short tenet sentences
}

// ---------------------------------------------------------------------------
// Geography & polities
// ---------------------------------------------------------------------------

export type Biome =
  | "coast"
  | "plains"
  | "forest"
  | "hills"
  | "mountains"
  | "marsh"
  | "steppe"
  | "highlands";

export interface Region {
  id: RegionId;
  name: string;
  biome: Biome;
  adjacent: RegionId[];
  settlements: SettlementId[];
  /** Map layout hint (abstract coordinates 0..100 for the map view). */
  x: number;
  y: number;
}

export type SettlementKind = "village" | "town" | "city" | "stronghold" | "temple-town" | "port";

export interface Settlement {
  id: SettlementId;
  name: string;
  kind: SettlementKind;
  region: RegionId;
  polity: PolityId;
  /** Simulated residents are Persons; abstractPop covers the unsimulated rest. */
  abstractPop: number;
  founded: SimDate;
  /** Economy tags, e.g. ["fishing", "shipwrights"]. */
  economy: string[];
  /** Current local conditions (module-managed): famine, plague name, etc. */
  conditions: Record<string, number | string | boolean>;
}

export type PolityKind = "kingdom" | "principality" | "chiefdom" | "city-league" | "theocracy";
export type SuccessionLaw =
  | "male-primogeniture"
  | "absolute-primogeniture"
  | "female-primogeniture"
  | "elective-council"
  | "seniority"
  | "divine-lot"; // clergy divination picks among eligible kin

export interface Polity {
  id: PolityId;
  name: string;
  kind: PolityKind;
  capital: SettlementId;
  regions: RegionId[];
  ruler: PersonId | null;
  rulerTitleM: string; // "King"
  rulerTitleF: string; // "Queen"
  rulingHouse: HouseId | null;
  succession: SuccessionLaw;
  founded: SimDate;
  /** Ordered historical reigns. */
  reigns: { ruler: PersonId; from: SimDate; to: SimDate | null }[];
  /** polity id -> stance. */
  relations: Map<PolityId, { stance: "war" | "peace" | "alliance" | "rivalry"; since: SimDate }>;
  /** Council seats: role -> person. */
  court: Map<string, PersonId>;
  prestige: number;
  culture: CultureId;
  religion: ReligionId;
}

export interface House {
  id: HouseId;
  name: string; // "House Maren" / "Clan Durroch"
  /** Words/motto in translation. */
  motto: string;
  founder: PersonId;
  founded: SimDate;
  head: PersonId | null;
  seat: SettlementId | null;
  culture: CultureId;
  /** Cadet parent house, if any. */
  parent: HouseId | null;
  prestige: number;
  /** Banner parameters (interpreted by the portrait/heraldry module). */
  bannerSeed: string;
  /** Active feuds with other houses (house id -> intensity 0..1). */
  feuds: Map<HouseId, number>;
}

// ---------------------------------------------------------------------------
// Events (the chronicle)
// ---------------------------------------------------------------------------

/**
 * Canonical event type keys. Narrative module must render all of these;
 * unknown keys get a generic fallback. Modules may append `data` fields
 * documented in docs/CONTRACTS.md.
 */
export type EventType =
  // lifecycle
  | "birth"
  | "death"
  | "coming-of-age"
  | "betrothal"
  | "wedding"
  | "divorce"
  | "pregnancy-loss"
  | "took-profession"
  | "apprenticed"
  | "retired"
  | "moved"
  | "emigrated"
  | "illness"
  | "recovery"
  | "injury"
  | "twin-birth"
  // social
  | "friendship-formed"
  | "rivalry-formed"
  | "romance-began"
  | "affair-began"
  | "affair-discovered"
  | "quarrel"
  | "reconciliation"
  | "duel"
  | "brawl"
  | "insult"
  | "gift"
  | "oath-sworn"
  | "oath-broken"
  | "mentorship-began"
  | "bastard-acknowledged"
  // deeds & drama
  | "heroic-rescue"
  | "crime-theft"
  | "crime-murder"
  | "crime-discovered"
  | "trial"
  | "execution"
  | "exile"
  | "return-from-exile"
  | "disappearance"
  | "beast-attack"
  | "masterwork-created"
  | "song-composed"
  | "prophecy-spoken"
  | "curse-pronounced"
  | "vision"
  | "conversion"
  | "pilgrimage-departed"
  | "pilgrimage-returned"
  | "founded-settlement"
  | "nickname-earned"
  // politics
  | "coronation"
  | "succession-crisis"
  | "claim-pressed"
  | "plot-formed"
  | "plot-exposed"
  | "assassination"
  | "coup"
  | "abdication"
  | "war-declared"
  | "battle"
  | "siege"
  | "peace-made"
  | "alliance-formed"
  | "title-granted"
  | "title-revoked"
  | "house-founded"
  | "house-cadet-founded"
  | "house-extinct"
  | "feud-began"
  | "feud-ended"
  // religion & culture
  | "festival"
  | "omen"
  | "heresy-preached"
  | "schism"
  | "temple-built"
  | "relic-found"
  | "persecution"
  | "miracle-claimed"
  // world
  | "plague-outbreak"
  | "plague-ended"
  | "famine"
  | "bountiful-harvest"
  | "fire"
  | "flood"
  | "storm"
  | "earthquake"
  | "comet"
  | "trade-boom"
  | "road-built";

export interface EventRecord {
  id: EventId;
  type: EventType | string;
  date: SimDate;
  /** Role -> person. Roles are event-type specific ("subject", "target"...). */
  participants: Record<string, PersonId>;
  /** Additional typed payload per event type (see CONTRACTS.md). */
  data: Record<string, unknown>;
  location: SettlementId | null;
  region: RegionId | null;
  /** Importance 0..100 — drives notability, UI surfacing, narrative detail. */
  importance: number;
  /** Cause links: events that led to this one. */
  causes: EventId[];
  /** Filled in lazily by consequence linking. */
  consequences: EventId[];
  storyline: StorylineId | null;
  /** True if not publicly known in-world (affairs, murders...). */
  secret: boolean;
  /** If secret was later revealed, when. */
  revealed: SimDate | null;
}

// ---------------------------------------------------------------------------
// Storylines (multi-year narrative arcs)
// ---------------------------------------------------------------------------

export type StorylineKind =
  | "feud" // house vs house escalation
  | "forbidden-love"
  | "rivalry" // personal rivalry arc
  | "ambition" // climb toward a title/mastery
  | "revenge"
  | "mystery-disappearance"
  | "prodigy"
  | "downfall" // slow ruin: drink, debt, disgrace
  | "usurpation-plot"
  | "heresy"
  | "curse" // believed curse shadows a family
  | "masterwork" // artisan's magnum opus
  | "succession-struggle"
  | "redemption"
  | "wanderer"; // exile/journey and return

export interface Storyline {
  id: StorylineId;
  kind: StorylineKind;
  /** Current stage key within the arc's state machine. */
  stage: string;
  started: SimDate;
  ended: SimDate | null;
  /** Role -> person (e.g. "protagonist", "rival", "beloved"). */
  cast: Record<string, PersonId>;
  /** Houses/polities involved, when applicable. */
  houses: HouseId[];
  events: EventId[];
  /** Next date this storyline wants a beat check. */
  nextBeat: SimDate;
  /** Arc-specific working data. */
  data: Record<string, unknown>;
  resolved: boolean;
  /** Short human summary once resolved, e.g. "ended in blood at Harrowmere". */
  outcome: string | null;
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export interface WorldParams {
  seed: string;
  /** Approximate initial simulated population. */
  startPop: number;
  /** Soft cap on simulated living population. */
  popCap: number;
  regions: number;
  cultures: number;
  startYear: number;
}

export interface WorldStats {
  alive: number;
  totalBorn: number;
  totalDied: number;
  year: number;
}

/**
 * The complete mutable world state. All registries are Maps keyed by id;
 * iteration MUST use ascending-id order helpers from world.ts to preserve
 * determinism.
 */
export interface World {
  params: WorldParams;
  /** Current absolute month. */
  now: SimDate;
  nextIds: Record<string, number>;
  people: Map<PersonId, Person>;
  houses: Map<HouseId, House>;
  cultures: Map<CultureId, Culture>;
  religions: Map<ReligionId, Religion>;
  languages: Map<LanguageId, Language>;
  regions: Map<RegionId, Region>;
  settlements: Map<SettlementId, Settlement>;
  polities: Map<PolityId, Polity>;
  events: Map<EventId, EventRecord>;
  storylines: Map<StorylineId, Storyline>;
  relationships: RelationshipMap;
  /** person -> memories (bounded list, most recent/strongest kept). */
  memories: Map<PersonId, Memory[]>;
  /** Event ids by date for fast chronological queries. */
  eventsByMonth: Map<SimDate, EventId[]>;
  /** Living person ids (maintained by people module on birth/death). */
  alive: Set<PersonId>;
  /** Named recurring world conditions (active plague name, etc.). */
  conditions: Record<string, unknown>;
  stats: WorldStats;
}

// ---------------------------------------------------------------------------
// Module service contracts
// ---------------------------------------------------------------------------

/** Context passed to every service call during simulation. */
export interface Ctx {
  world: World;
  services: Services;
  /** Fork substreams from this; already scoped world+month+system. */
  rng: Rng;
  /** Record an event into the chronicle. Returns the stored record. */
  record: (
    ev: Omit<EventRecord, "id" | "consequences" | "revealed"> &
      Partial<Pick<EventRecord, "revealed">>,
  ) => EventRecord;
}

export interface LanguageService {
  /** Generate a root language. */
  generate(rng: Rng, hints?: { family?: string }): Language;
  /** Generate a daughter language (related sounds, drifted). */
  derive(rng: Rng, parent: Language): Language;
  givenName(rng: Rng, lang: Language, sex: Sex): string;
  /** Family/house name (used per naming convention). */
  familyName(rng: Rng, lang: Language): string;
  patronymic(lang: Language, fatherGiven: string, childSex: Sex): string;
  placeName(rng: Rng, lang: Language, kind: "settlement" | "region" | "polity"): string;
  deityName(rng: Rng, lang: Language): string;
  /** Translated epithet, e.g. theme "unbowed" -> "the Unbowed" flavor. */
  epithet(rng: Rng, lang: Language, theme: string): string;
  /** A flavor word for a concept (falls back to generating one). */
  word(rng: Rng, lang: Language, concept: string): string;
}

export interface CultureService {
  generate(rng: Rng, world: World, language: Language): Culture;
  /** Derive a related culture (migration/divergence). */
  derive(rng: Rng, world: World, parent: Culture, language: Language): Culture;
  /** Compose display full name for a person per culture convention. */
  fullName(world: World, person: Person): string;
  /** Choose a newborn's given name honoring naming customs. */
  babyName(rng: Rng, world: World, mother: Person, father: Person | null, sex: Sex): string;
  /** Surname for a newborn per convention (may be patronymic). */
  babySurname(world: World, mother: Person, father: Person | null, sex: Sex, given: string): string;
}

export interface ReligionService {
  generate(rng: Rng, world: World, culture: Culture): Religion;
  /** Schism: a new faith splits off, founded by `founder`. */
  schism(rng: Rng, world: World, parent: Religion, founder: Person): Religion;
  /** Monthly religious observances/festivals/omens. */
  tick(ctx: Ctx): void;
}

export interface GeneticsService {
  /** Number of loci — genome array length is 2*loci. */
  genomeLength(): number;
  /** Create a founder genome with culture-flavored allele frequencies. */
  founderGenome(rng: Rng, cultureSeedOffset: number): Genome;
  /** Meiosis + mutation: child genome from parents. */
  reproduce(rng: Rng, mother: Genome, father: Genome): Genome;
  express(genome: Genome, sex: Sex, rng: Rng): Phenotype;
  /** Litter size for a conception (1/2/3), honoring heritable twinning. */
  litterSize(rng: Rng, motherPh: Phenotype): number;
  /** 0..1 phenotypic resemblance between two people (for narrative/UI). */
  resemblance(a: Phenotype, b: Phenotype): number;
  /** Pedigree-based inbreeding coefficient (0..~0.25). */
  inbreeding(world: World, motherId: PersonId, fatherId: PersonId): number;
  /** Personality baseline from phenotype temperament values. */
  basePersonality(ph: Phenotype, rng: Rng): Personality;
}

export interface PortraitService {
  /** Standalone SVG string (square), procedural face from phenotype. */
  portraitSVG(ph: Phenotype, sex: Sex, ageYears: number, size?: number): string;
  /** Procedural heraldic banner SVG from a seed string. */
  bannerSVG(seed: string, size?: number): string;
}

export interface PeopleService {
  /** Create a founder-generation person (no parents). */
  createFounder(
    rng: Rng,
    world: World,
    services: Services,
    opts: {
      culture: CultureId;
      religion: ReligionId;
      location: SettlementId;
      house: HouseId | null;
      sex?: Sex;
      ageYears?: number;
      rank?: number;
    },
  ): Person;
  /** Deliver a child (called by pregnancy resolution AND worldgen). */
  createChild(
    rng: Rng,
    world: World,
    services: Services,
    mother: Person,
    father: Person | null,
    opts?: { litterIndex?: number; litterMates?: PersonId[] },
  ): Person;
  /** Monthly update for all living people: aging, health, deaths, careers. */
  tick(ctx: Ctx): void;
  /** Marriage market: betrothals, weddings; runs monthly. */
  marriageTick(ctx: Ctx): void;
  /** Kill a person now (used by battles, plots, executions...). */
  kill(ctx: Ctx, person: Person, cause: string, opts?: { killer?: PersonId; event?: EventId }): void;
  /** Age in whole years at world.now. */
  age(world: World, p: Person): number;
  lifeStage(world: World, p: Person): LifeStage;
}

export interface SocialService {
  /** Monthly social fabric update: friendships, rivalries, romances, drift. */
  tick(ctx: Ctx): void;
  getOpinion(world: World, a: PersonId, b: PersonId): number;
  setRelation(world: World, a: PersonId, b: PersonId, rel: Relationship): void;
  getRelation(world: World, a: PersonId, b: PersonId): Relationship | null;
  adjustOpinion(world: World, a: PersonId, b: PersonId, delta: number): void;
  addMemory(world: World, person: PersonId, memory: Memory): void;
  /** Kin check (up to 2nd degree) used by marriage/inheritance/drama. */
  closeKin(world: World, a: PersonId, b: PersonId): boolean;
}

export interface PoliticsService {
  /** Worldgen: found polities, noble houses, courts over generated map. */
  found(rng: Rng, world: World, services: Services): void;
  /** Monthly: wars, plots, diplomacy, councils, title grants. */
  tick(ctx: Ctx): void;
  /** Handle death of a title holder: succession resolution. */
  onDeath(ctx: Ctx, deceased: Person): void;
  /** Ordered succession candidates for a polity (for UI "line of succession"). */
  successionLine(world: World, polity: Polity, limit?: number): PersonId[];
}

export interface StoryService {
  /** Monthly: spawn new storylines from world state, advance beats, resolve. */
  tick(ctx: Ctx): void;
}

export interface EconomyService {
  /** Monthly: harvests, famines, plagues, disasters, festivals, trade. */
  tick(ctx: Ctx): void;
}

export interface NarrativeService {
  /** One-to-few sentence prose for an event, with cultural flavor. */
  renderEvent(world: World, ev: EventRecord): string;
  /** Short headline (for lists), e.g. "Duel at Harrowmere". */
  renderHeadline(world: World, ev: EventRecord): string;
  /** Multi-paragraph biography of a person's life so far. */
  renderLife(world: World, person: Person): string;
  /** Display name w/ epithet: "Kaerel the Unbowed". */
  shortName(world: World, p: Person): string;
}

export interface Services {
  language: LanguageService;
  culture: CultureService;
  religion: ReligionService;
  genetics: GeneticsService;
  portrait: PortraitService;
  people: PeopleService;
  social: SocialService;
  politics: PoliticsService;
  story: StoryService;
  economy: EconomyService;
  narrative: NarrativeService;
}
