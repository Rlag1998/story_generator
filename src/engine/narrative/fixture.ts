/**
 * Test fixture: a tiny fabricated world built by hand (no other engine
 * modules, no Rng), plus synthetic sample events for every event type.
 * Building is fully deterministic: two calls yield identical worlds.
 */

import { makeDate } from "../core/time";
import type {
  Culture,
  EventRecord,
  House,
  Person,
  PersonId,
  Personality,
  Phenotype,
  Polity,
  Region,
  Religion,
  Settlement,
  Sex,
  World,
} from "../core/types";
import { createEmptyWorld, recordEvent } from "../core/world";

export interface Fixture {
  world: World;
  ids: {
    kaerel: PersonId;
    maeve: PersonId;
    aeli: PersonId;
    twinA: PersonId;
    twinB: PersonId;
    king: PersonId;
    priest: PersonId;
    rival: PersonId;
    torvald: PersonId;
    senna: PersonId;
  };
}

export function mkPhenotype(over: Partial<Phenotype> = {}): Phenotype {
  return {
    skinTone: 0.35,
    hairColor: 3,
    hairTexture: 1,
    eyeColor: 5,
    heightScore: 0.2,
    buildScore: 0.1,
    faceShape: 2,
    noseShape: 1,
    jawShape: 1,
    browShape: 0,
    mouthShape: 2,
    earShape: 0,
    freckles: false,
    dimples: false,
    cleftChin: false,
    rareTraits: [],
    tempOpenness: 0,
    tempDiligence: 0,
    tempSociability: 0,
    tempAgreeableness: 0,
    tempVolatility: 0,
    aptitudes: {},
    constitution: 0,
    fertilityMod: 1,
    twinningMod: 1,
    longevityMod: 1,
    ...over,
  };
}

export function mkPersonality(over: Partial<Personality> = {}): Personality {
  return {
    openness: 0,
    diligence: 0.2,
    sociability: 0,
    agreeableness: 0.1,
    volatility: 0,
    courage: 0.1,
    ambition: 0.2,
    piety: 0.3,
    honor: 0.2,
    lust: 0.2,
    greed: 0.2,
    wrath: 0.2,
    compassion: 0.3,
    traits: [],
    ...over,
  };
}

interface PersonSpec {
  id: PersonId;
  given: string;
  surname?: string;
  epithet?: string;
  nickname?: string;
  sex: Sex;
  born: number;
  died?: number | null;
  deathCause?: string | null;
  mother?: PersonId | null;
  father?: PersonId | null;
  house?: number | null;
  location?: number | null;
  profession?: Person["status"]["profession"];
  rank?: number;
  phenotype?: Partial<Phenotype>;
  personality?: Partial<Personality>;
}

function mkPerson(world: World, spec: PersonSpec): Person {
  const p: Person = {
    id: spec.id,
    givenName: spec.given,
    surname: spec.surname ?? "",
    epithet: spec.epithet ?? "",
    nickname: spec.nickname ?? "",
    sex: spec.sex,
    culture: 1,
    religion: 1,
    house: spec.house ?? null,
    born: spec.born,
    died: spec.died ?? null,
    deathCause: spec.deathCause ?? null,
    location: spec.location ?? 1,
    mother: spec.mother ?? null,
    father: spec.father ?? null,
    legalFather: spec.father ?? null,
    children: [],
    marriages: [],
    betrothed: null,
    pregnancy: null,
    genome: new Int16Array(0),
    phenotype: mkPhenotype(spec.phenotype),
    personality: mkPersonality(spec.personality),
    status: {
      profession: spec.profession ?? "none",
      wealth: 2,
      rank: spec.rank ?? 1,
      titles: [],
      literate: false,
    },
    illnesses: [],
    injuries: [],
    storylines: [],
    notability: 0,
    litterMates: [],
    flags: {},
  };
  world.people.set(p.id, p);
  if (p.died === null) world.alive.add(p.id);
  return p;
}

export function buildFixture(): Fixture {
  const world = createEmptyWorld({
    seed: "fixture",
    startPop: 10,
    popCap: 100,
    regions: 2,
    cultures: 1,
    startYear: 200,
  });
  world.now = makeDate(240, 6);

  // Language with named months.
  world.languages.set(1, {
    id: 1,
    name: "Vessari",
    family: "Vessic",
    parent: null,
    phonology: {
      consonants: ["v", "s", "r", "l", "n", "t", "k", "m"],
      vowels: ["a", "e", "i", "o"],
      patterns: ["CV", "CVC"],
      patternWeights: [1, 1],
      finals: ["l", "n", "r"],
      orthography: [],
      forbidden: [],
    },
    femaleEndings: ["a", "e"],
    maleEndings: ["el", "an"],
    patronymicF: ["", "sena"],
    patronymicM: ["", "sen"],
    lexicon: {},
    monthNames: [
      "Teshvar", "Ondrel", "Veshtir", "Salka", "Neriv", "Toldan",
      "Iskel", "Varn", "Melest", "Ondar", "Kirev", "Sallun",
    ],
  });

  const culture: Culture = {
    id: 1,
    name: "Vessarin",
    demonym: "Vessari",
    language: 1,
    parent: null,
    values: ["seafaring", "honor", "kinship"],
    marriage: "monogamy",
    descent: "patrilineal",
    inheritance: "primogeniture",
    nameOrder: "given-family",
    ancestorNaming: 0.3,
    traditions: [
      {
        key: "salt-cup",
        name: "the Salt Cup",
        description: "Bride and groom drink brine from one cup, that they may share the bitter with the sweet.",
        hooks: ["wedding"],
      },
      {
        key: "double-tide",
        name: "the Double Tide",
        description: "Twins are held to share one soul between two boats, and are never named on the same day.",
        hooks: ["twins", "birth"],
      },
      {
        key: "first-watch",
        name: "the First Watch",
        description: "At adulthood a youth keeps one whole night's watch on the sea-wall alone.",
        hooks: ["coming-of-age"],
      },
    ],
    adulthoodAge: 16,
    marriageAgeF: 19,
    marriageAgeM: 23,
    colors: ["#2a4a5a", "#c8b37a"],
    attitudes: { violence: 0.4, mysticism: 0.6, patriarchy: 0.4, openness: 0.5 },
  };
  world.cultures.set(1, culture);

  const religion: Religion = {
    id: 1,
    name: "the Way of the Lamp",
    adherentName: "Lampkeepers",
    shape: "pantheon",
    deities: [
      { id: 1, name: "Neshta", epithet: "the Lamp That Outlasts the Gale", domains: ["sea", "mercy"], temper: "kind" },
    ],
    virtues: ["candor", "steadfastness"],
    sins: ["oathbreaking", "waste"],
    holyDays: [{ name: "the Lampfeast", month: 10, theme: "the returning fleet" }],
    clergyTitle: "Tidemother",
    clergyCelibate: false,
    clergyGender: "any",
    funeralRite: "The dead are given to the tide at dusk with a lamp at the prow, and the boat is not watched out of sight.",
    afterlife: "A far shore with no gales.",
    origin: 1,
    parent: null,
    founder: null,
    zeal: 0.4,
    tenets: ["Keep the lamp lit.", "The sea forgets no debt."],
  };
  world.religions.set(1, religion);
  world.religions.set(2, {
    ...religion,
    id: 2,
    name: "the Deepward Way",
    adherentName: "Deepwarders",
    clergyTitle: "Depthfather",
    funeralRite: "The dead are weighted and given whole to the deep, unlamped.",
    parent: 1,
  });

  const region1: Region = { id: 1, name: "the Harrowmarch", biome: "coast", adjacent: [2], settlements: [1, 2], x: 20, y: 30 };
  const region2: Region = { id: 2, name: "the Stonedowns", biome: "hills", adjacent: [1], settlements: [], x: 45, y: 30 };
  world.regions.set(1, region1);
  world.regions.set(2, region2);

  const velle: Settlement = {
    id: 1, name: "Velle", kind: "port", region: 1, polity: 1,
    abstractPop: 600, founded: makeDate(150, 1), economy: ["fishing", "salt"], conditions: {},
  };
  const harrowmere: Settlement = {
    id: 2, name: "Harrowmere", kind: "stronghold", region: 1, polity: 1,
    abstractPop: 400, founded: makeDate(160, 1), economy: ["wool"], conditions: {},
  };
  world.settlements.set(1, velle);
  world.settlements.set(2, harrowmere);

  const polity: Polity = {
    id: 1, name: "Velmark", kind: "kingdom", capital: 1, regions: [1],
    ruler: 5, rulerTitleM: "King", rulerTitleF: "Queen", rulingHouse: 1,
    succession: "male-primogeniture", founded: makeDate(150, 1),
    reigns: [{ ruler: 5, from: makeDate(220, 1), to: null }],
    relations: new Map(), court: new Map(), prestige: 20, culture: 1, religion: 1,
  };
  world.polities.set(1, polity);
  world.polities.set(2, {
    ...polity,
    id: 2, name: "Harrowmark", capital: 2, regions: [2], ruler: null,
    rulingHouse: null, reigns: [], relations: new Map(), court: new Map(),
  });

  const house1: House = {
    id: 1, name: "House Maren", motto: "Hold the Tide", founder: 1,
    founded: makeDate(180, 1), head: 1, seat: 2, culture: 1, parent: null,
    prestige: 18, bannerSeed: "maren", feuds: new Map(),
  };
  world.houses.set(1, house1);
  world.houses.set(2, {
    ...house1, id: 2, name: "House Durroch", motto: "Stone Endures",
    founder: 7, head: 7, seat: null, feuds: new Map(),
  });

  // People.
  const Y = (y: number, m = 3) => makeDate(y, m);
  const torvald = mkPerson(world, {
    id: 8, given: "Torvald", surname: "Maren", sex: "m", born: Y(172),
    profession: "fisher", phenotype: { hairColor: 1, faceShape: 2, eyeColor: 5 },
  });
  const senna = mkPerson(world, {
    id: 9, given: "Senna", surname: "Maren", sex: "f", born: Y(176),
    phenotype: { hairColor: 5, faceShape: 4, eyeColor: 4 },
  });
  const kaerel = mkPerson(world, {
    id: 1, given: "Kaerel", surname: "Maren", epithet: "the Unbowed", sex: "m",
    born: Y(200), died: Y(238, 2), deathCause: "a wound gone sour after a skirmish",
    mother: 9, father: 8, house: 1, profession: "soldier", rank: 3,
    phenotype: { hairColor: 1, faceShape: 2, eyeColor: 4, heightScore: 1.2 },
    personality: { volatility: 0.5, wrath: 0.6, courage: 0.7, honor: 0.6, traits: ["iron-willed", "blunt"] },
  });
  const maeve = mkPerson(world, {
    id: 2, given: "Maève", surname: "Maren", sex: "f", born: Y(203),
    house: 1, profession: "weaver", rank: 2,
    phenotype: { hairColor: 5, faceShape: 3, eyeColor: 6, dimples: true },
    personality: { sociability: 0.6, compassion: 0.7, diligence: 0.6, traits: ["warm-handed"] },
  });
  const aeli = mkPerson(world, {
    id: 3, given: "Aeli", surname: "Maren", sex: "f", born: Y(224),
    mother: 2, father: 1, house: 1,
    phenotype: { hairColor: 5, faceShape: 2, eyeColor: 3, rareTraits: ["the-sight"] },
    personality: { openness: 0.7, piety: 0.7 },
  });
  const twinA = mkPerson(world, {
    id: 4, given: "Brann", surname: "Maren", sex: "m", born: Y(228),
    mother: 2, father: 1, house: 1,
    phenotype: { hairColor: 1, faceShape: 2, rareTraits: ["moon-pale"] },
  });
  const twinB = mkPerson(world, {
    id: 10, given: "Berra", surname: "Maren", sex: "f", born: Y(228),
    mother: 2, father: 1, house: 1, phenotype: { hairColor: 5, faceShape: 3 },
  });
  twinA.litterMates = [10];
  twinB.litterMates = [4];
  const king = mkPerson(world, {
    id: 5, given: "Oskan", surname: "Velle", epithet: "the Lamplit", sex: "m",
    born: Y(190), house: 1, profession: "ruler", rank: 5,
  });
  const priest = mkPerson(world, {
    id: 6, given: "Ilvane", surname: "", sex: "f", born: Y(195), profession: "priest", rank: 2,
  });
  const rival = mkPerson(world, {
    id: 7, given: "Dorrek", surname: "Durroch", sex: "m", born: Y(199), house: 2,
    profession: "smith", rank: 2,
  });

  torvald.children = [1];
  senna.children = [1];
  kaerel.children = [3, 4, 10];
  maeve.children = [3, 4, 10];

  // Kaerel and Maève: married 222, ended by his death in 238.
  const wedDate = Y(222, 5);
  kaerel.marriages.push({ spouse: 2, date: wedDate, active: false, endDate: kaerel.died!, endReason: "death" });
  maeve.marriages.push({ spouse: 1, date: wedDate, active: false, endDate: kaerel.died!, endReason: "death" });

  // Kaerel's chronicle.
  const rec = (
    ev: Omit<EventRecord, "id" | "consequences" | "revealed"> & Partial<Pick<EventRecord, "revealed">>,
  ) => recordEvent(world, ev);

  rec({
    type: "birth", date: kaerel.born,
    participants: { subject: 1, mother: 9, father: 8 },
    data: { litter: 1, litterIndex: 0 },
    location: 1, region: 1, importance: 8, causes: [], storyline: null, secret: false,
  });
  rec({
    type: "coming-of-age", date: Y(216),
    participants: { subject: 1 },
    data: { ageYears: 16, rite: "the First Watch", riteKey: "first-watch" },
    location: 1, region: 1, importance: 7, causes: [], storyline: null, secret: false,
  });
  rec({
    type: "took-profession", date: Y(217),
    participants: { subject: 1 }, data: { profession: "soldier" },
    location: 1, region: 1, importance: 3, causes: [], storyline: null, secret: false,
  });
  rec({
    type: "wedding", date: wedDate,
    participants: { bride: 2, groom: 1 },
    data: { rite: "the Salt Cup", riteKey: "salt-cup", loveMatch: true },
    location: 1, region: 1, importance: 11, causes: [], storyline: null, secret: false,
  });
  rec({
    type: "birth", date: aeli.born,
    participants: { subject: 3, mother: 2, father: 1 },
    data: { litter: 1, litterIndex: 0 },
    location: 1, region: 1, importance: 8, causes: [], storyline: null, secret: false,
  });
  const twinBirthA = rec({
    type: "birth", date: twinA.born,
    participants: { subject: 4, mother: 2, father: 1 },
    data: { litter: 2, litterIndex: 0, rareTraits: ["moon-pale"] },
    location: 1, region: 1, importance: 11, causes: [], storyline: null, secret: false,
  });
  const twinBirthB = rec({
    type: "birth", date: twinB.born,
    participants: { subject: 10, mother: 2, father: 1 },
    data: { litter: 2, litterIndex: 1 },
    location: 1, region: 1, importance: 8, causes: [], storyline: null, secret: false,
  });
  rec({
    type: "twin-birth", date: twinA.born,
    participants: { first: 4, second: 10, mother: 2 },
    data: { litter: 2 },
    location: 1, region: 1, importance: 15,
    causes: [twinBirthA.id, twinBirthB.id], storyline: null, secret: false,
  });
  const duelEv = rec({
    type: "duel", date: Y(230, 7),
    participants: { challenger: 1, challenged: 7, victor: 1 },
    data: { over: "an insult at the Lampfeast", outcome: "wound" },
    location: 1, region: 1, importance: 20, causes: [], storyline: 1, secret: false,
  });
  rec({
    type: "nickname-earned", date: Y(231, 4),
    participants: { subject: 1 },
    data: { epithet: "the Unbowed", reason: "held the sea-gate alone through a night raid" },
    location: 1, region: 1, importance: 14, causes: [duelEv.id], storyline: null, secret: false,
  });
  const battleEv = rec({
    type: "battle", date: Y(233, 9),
    participants: { attackerCommander: 1 },
    data: {
      name: "Battle of the Salt Meadow", attacker: 1, defender: 2,
      outcome: "attacker", fallen: [], war: 1,
    },
    location: 2, region: 1, importance: 40, causes: [], storyline: null, secret: false,
  });
  rec({
    type: "death", date: kaerel.died!,
    participants: { subject: 1 },
    data: { cause: "a wound gone sour after a skirmish", ageYears: 38 },
    location: 1, region: 1, importance: 18, causes: [battleEv.id], storyline: null, secret: false,
  });

  // A resolved rivalry storyline binding Kaerel and Dorrek.
  world.storylines.set(1, {
    id: 1, kind: "rivalry", stage: "done", started: Y(229, 1), ended: Y(232, 1),
    cast: { protagonist: 1, rival: 7 }, houses: [1, 2],
    events: [duelEv.id], nextBeat: Y(232, 1), data: {},
    resolved: true, outcome: "ended with a handshake neither man trusted",
  });
  kaerel.storylines = [1];

  world.stats.alive = world.alive.size;
  return {
    world,
    ids: { kaerel: 1, maeve: 2, aeli: 3, twinA: 4, twinB: 10, king: 5, priest: 6, rival: 7, torvald: 8, senna: 9 },
  };
}

// ---------------------------------------------------------------------------
// Synthetic sample events for every type (not stored in the world)
// ---------------------------------------------------------------------------

let sampleId = 500;

function mk(
  type: string,
  participants: Record<string, PersonId>,
  data: Record<string, unknown>,
  opts: { secret?: boolean; importance?: number; location?: number | null; region?: number | null } = {},
): EventRecord {
  sampleId += 1;
  return {
    id: sampleId,
    type,
    date: makeDate(239, ((sampleId % 12) + 1) as number),
    participants,
    data,
    location: opts.location === undefined ? 1 : opts.location,
    region: opts.region === undefined ? 1 : opts.region,
    importance: opts.importance ?? 12,
    causes: [],
    consequences: [],
    storyline: null,
    secret: opts.secret ?? false,
    revealed: null,
  };
}

/** One synthetic event per canonical type (plus extras), fixture-typed. */
export function sampleEvents(f: Fixture): EventRecord[] {
  sampleId = 500;
  const { kaerel, maeve, aeli, twinA, twinB, king, priest, rival, torvald, senna } = f.ids;
  return [
    mk("birth", { subject: aeli, mother: maeve, father: kaerel }, { litter: 1, litterIndex: 0 }),
    mk("death", { subject: kaerel }, { cause: "a wound gone sour after a skirmish", ageYears: 38 }),
    mk("coming-of-age", { subject: aeli }, { ageYears: 16, rite: "the First Watch" }),
    mk("betrothal", { bride: aeli, groom: rival }, { arranged: true }),
    mk("wedding", { bride: maeve, groom: kaerel }, { rite: "the Salt Cup", loveMatch: true }),
    mk("divorce", { a: rival, b: senna }, { reason: "the union soured beyond mending" }),
    mk("pregnancy-loss", { subject: maeve }, { stillborn: true, litter: 1 }),
    mk("took-profession", { subject: kaerel }, { profession: "soldier" }),
    mk("apprenticed", { ward: aeli, mentor: priest }, { craft: "scribe" }),
    mk("retired", { subject: torvald }, { profession: "fisher" }),
    mk("moved", { subject: rival }, { from: 1, to: 2, reason: "work" }),
    mk("emigrated", { subject: rival }, { from: 1 }),
    mk("illness", { subject: kaerel }, { name: "grey sweat", severity: 0.6 }),
    mk("recovery", { subject: kaerel }, { name: "grey sweat" }),
    mk("injury", { subject: kaerel }, { wound: "a burn-scarred sword hand", profession: "smith" }),
    mk("twin-birth", { first: twinA, second: twinB, mother: maeve }, { litter: 2 }),

    mk("friendship-formed", { a: kaerel, b: rival }, { bond: "a winter spent mending the same boat" }),
    mk("rivalry-formed", { a: kaerel, b: rival }, { over: "the same stretch of oyster beds" }),
    mk("romance-began", { a: kaerel, b: maeve }, { spark: "a dance at the harvest fire" }),
    mk("affair-began", { a: rival, b: maeve }, { spark: "a shared road home" }, { secret: true }),
    mk("affair-discovered", { a: rival, b: maeve }, { how: "a letter left in the wrong coat" }),
    mk("quarrel", { instigator: kaerel, target: rival }, { over: "a boundary stone" }),
    mk("reconciliation", { a: kaerel, b: rival }, { manner: "gifts carried between the two doors" }),
    mk("duel", { challenger: kaerel, challenged: rival, victor: kaerel }, { over: "an insult at the feast", outcome: "wound" }),
    mk("brawl", { a: kaerel, b: rival }, { over: "a spilled cup" }),
    mk("insult", { a: rival, b: kaerel }, { slight: "a toast turned to mockery" }),
    mk("gift", { giver: kaerel, receiver: maeve }, { gift: "a knife with a whalebone haft" }),
    mk("oath-sworn", { a: kaerel, b: rival }, { oath: "to stand at each other's backs whatever came" }),
    mk("oath-broken", { a: rival }, { oath: "to stand at each other's backs whatever came" }),
    mk("mentorship-began", { ward: aeli, mentor: priest }, {}),
    mk("bastard-acknowledged", { father: rival, child: twinB }, {}),

    mk("heroic-rescue", { subject: kaerel, saved: rival }, { peril: "fire" }, { importance: 20 }),
    mk("crime-theft", { subject: rival }, { what: "grain from the tithe barn" }, { secret: true }),
    mk("crime-murder", { killer: rival, victim: torvald }, { method: "a knife in the dark" }, { secret: true, importance: 40 }),
    mk("crime-discovered", { culprit: rival }, { crime: "grain missing from the tithe barn" }),
    mk("trial", { accused: rival, judge: king }, { charge: "theft of the tithe", verdict: "guilty" }),
    mk("execution", { condemned: rival, orderedBy: king }, { manner: "hanged at the crossroads" }, { importance: 35 }),
    mk("exile", { subject: rival }, { reason: "spared the rope and shown the border" }),
    mk("return-from-exile", { subject: rival }, {}),
    mk("disappearance", { subject: rival }, { lastSeen: "mending a net at dusk" }, { importance: 25 }),
    mk("beast-attack", { subject: rival }, { beast: "a wolf grown bold" }),
    mk("masterwork-created", { subject: rival }, { kind: "smith", title: "the Sea-Iron Gate" }),
    mk("song-composed", { subject: priest }, { theme: "the drowned fleet of Velle", form: "a lament" }),
    mk("prophecy-spoken", { subject: priest, concerning: aeli }, { text: "the tide will keep what it is owed" }),
    mk("curse-pronounced", { curser: senna, target: rival }, { words: "may your nets come up empty and your hearth go cold" }),
    mk("vision", { subject: priest }, { what: "a white ship with no crew", sight: true }),
    mk("conversion", { convert: rival }, { from: 1, religion: 2 }),
    mk("pilgrimage-departed", { subject: maeve }, { shrine: "the Lamp Rock" }),
    mk("pilgrimage-returned", { subject: maeve }, {}),
    mk("founded-settlement", { founder: kaerel }, { name: "New Velle" }),
    mk("nickname-earned", { subject: kaerel }, { epithet: "the Unbowed", reason: "held the sea-gate alone" }),

    mk("coronation", { ruler: king }, { polity: 1, rite: "anointed with sea-water from the first boat" }, { importance: 40 }),
    mk("succession-crisis", { claimant1: kaerel, claimant2: rival }, { polity: 1, reason: "rival claims split the court", lateRuler: king, claimants: [kaerel, rival] }, { importance: 55 }),
    mk("claim-pressed", { subject: rival }, { polity: 1, claimedBy: rival }),
    mk("plot-formed", { plotter: rival, confidant: senna }, { polity: 1 }, { secret: true }),
    mk("plot-exposed", { plotter: rival }, { polity: 1 }, { importance: 30 }),
    mk("assassination", { killer: rival, target: king }, { polity: 1, method: "poison in the feast cup" }, { importance: 75 }),
    mk("coup", { usurper: rival, deposed: king }, { polity: 1, manner: "the guard was bought a month in advance" }, { importance: 60 }),
    mk("abdication", { subject: king }, { polity: 1, reason: "weariness of the seat" }, { importance: 35 }),
    mk("war-declared", {}, { attacker: 1, defender: 2, casus: "an old claim on the coast" }, { importance: 50 }),
    mk("battle", { attackerCommander: kaerel }, { name: "Battle of the Salt Meadow", attacker: 1, defender: 2, outcome: "attacker", fallen: [torvald] }, { importance: 40 }),
    mk("siege", { defenderCommander: kaerel }, { name: "Siege of Harrowmere", attacker: 2, defender: 1, outcome: "defender", fallen: [] }, { importance: 44, location: 2 }),
    mk("peace-made", {}, { attacker: 1, defender: 2, outcome: "conquest" }, { importance: 45 }),
    mk("alliance-formed", {}, { polities: [1, 2] }),
    mk("title-granted", { subject: kaerel, granter: king }, { title: "Warden of the Shore", reason: "for the holding of the sea-gate" }),
    mk("title-revoked", { subject: rival }, { title: "Warden of the Shore", reason: "treason proved" }),
    mk("house-founded", { founder: kaerel }, { houseName: "House Maren", motto: "Hold the Tide" }),
    mk("house-cadet-founded", { founder: rival }, { house: 2, parent: 1, houseName: "House Marensk", parentName: "House Maren", seatName: "Harrowmere" }),
    mk("house-extinct", {}, { house: 2, houseName: "House Durroch", motto: "Stone Endures", founded: makeDate(180, 1) }),
    mk("feud-began", {}, { houses: [1, 2], slight: "a wedding seat given wrongly", intensity: 0.4 }),
    mk("feud-ended", {}, { houses: [1, 2], manner: "a marriage across the line" }),

    mk("festival", { officiant: priest, celebrant: maeve }, { religion: 1, holyDay: "the Lampfeast", theme: "the returning fleet", polity: 1 }, { importance: 6 }),
    mk("omen", {}, { sign: "a red ring around the moon", interpretation: "storm, and worse than storm" }),
    mk("heresy-preached", { preacher: priest }, { sermon: "the tide keeps no ledger of sin", against: 1 }),
    mk("schism", { founder: priest }, { parent: 1, religion: 2, name: "the Deepward Way", followers: 12 }, { importance: 70 }),
    mk("temple-built", {}, { religion: 1, dedication: "to the Lamp that outlasts the gale" }),
    mk("relic-found", { subject: priest }, { relic: "the keel-nail of the first boat" }),
    mk("persecution", {}, { religion: 2, reason: "the old temple's fear of empty pews" }, { importance: 30 }),
    mk("miracle-claimed", { witness: priest }, { description: "the harbor lamp burned three nights on no oil", deity: "Neshta" }),

    mk("plague-outbreak", {}, { name: "Grey Sweat", region: 1 }, { importance: 70 }),
    mk("plague-ended", {}, { name: "Grey Sweat", months: 14 }, { importance: 30 }),
    mk("famine", {}, { region: 1, severity: 0.5, months: 5, consecutiveYears: 2 }, { importance: 40 }),
    mk("bountiful-harvest", {}, { region: 1 }, { importance: 8 }),
    mk("fire", {}, { name: "the Wharf Fire", fallen: [], homesLost: 12 }, { importance: 30 }),
    mk("flood", {}, { fallen: [], months: 4 }, { importance: 28 }),
    mk("storm", {}, { fallen: [torvald], shipsLost: 3 }, { importance: 30 }),
    mk("earthquake", {}, { fallen: [], ruinedHomes: 9 }, { importance: 35 }),
    mk("comet", {}, { name: "the Pale Visitor", months: 3 }, { importance: 20 }),
    mk("trade-boom", {}, { wares: "wool and salt", months: 10 }, { importance: 10 }),
    mk("road-built", {}, { from: 1, to: 2, name: "the high road between the Harrowmarch and the Stonedowns" }, { importance: 12 }),
  ];
}

/** Extra (non-canonical) samples plus one truly unknown type. */
export function extraSampleEvents(f: Fixture): EventRecord[] {
  sampleId = 900;
  const { kaerel, maeve, rival } = f.ids;
  return [
    mk("fortune-turn", { subject: rival }, { direction: "stumble", matter: "the tools were hung up and not taken down again" }),
    mk("rumor", {}, { of: rival, word: "the cellar meetings simply stopped" }),
    mk("grief-kept", { subject: maeve }, { against: rival, manner: "kept the grief like a whetstone, and used it daily" }),
    mk("tale-ended", {}, { of: kaerel, reason: "the thread frayed and the telling moved on" }),
    mk("secret-meeting", { a: rival, b: maeve }, { where: "the boathouse past the last lamp", barrier: "her marriage" }, { secret: true }),
    mk("search-mounted", {}, { found: "a dropped mitten, a cold fire ring, nothing that answered anything" }),
    mk("wholly-unknown-type", { subject: kaerel }, { matter: "an entry the chronicler could not classify" }),
  ];
}
