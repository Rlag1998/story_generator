/**
 * Test kit for the economy module: a fabricated miniature world with varied
 * geography (coast+port, plains town, marsh, mountains) plus minimal
 * deterministic stub services. The economy service under test is the real
 * one; everything else is stubbed, per the module-isolation contract.
 */

import { Rng } from "../core/rng";
import { yearOf, yearsBetween } from "../core/time";
import { createEmptyWorld, nextId, recordEvent } from "../core/world";
import type {
  Aptitude,
  Biome,
  Ctx,
  Culture,
  Language,
  Person,
  PersonId,
  Personality,
  Phenotype,
  ProfessionKey,
  Region,
  Religion,
  Services,
  Settlement,
  SettlementKind,
  Sex,
  World,
} from "../core/types";
import { createEconomyService } from "./index";

// ---------------------------------------------------------------------------
// Fabricated world pieces
// ---------------------------------------------------------------------------

function makeLanguage(id: number): Language {
  return {
    id,
    name: "Testari",
    family: "test",
    parent: null,
    phonology: {
      consonants: ["k", "r", "t", "n", "s"],
      vowels: ["a", "e", "i", "o"],
      patterns: ["CV", "CVC"],
      patternWeights: [3, 1],
      finals: ["n", "s"],
      orthography: [],
      forbidden: [],
    },
    femaleEndings: ["a"],
    maleEndings: [""],
    patronymicF: ["", "sdota"],
    patronymicM: ["", "sson"],
    lexicon: {},
    monthNames: Array.from({ length: 12 }, (_, i) => `Month${i + 1}`),
  };
}

function makeCulture(id: number, languageId: number): Culture {
  return {
    id,
    name: "Testarin",
    demonym: "Testari",
    language: languageId,
    parent: null,
    values: ["kinship", "craftsmanship", "trade"],
    marriage: "monogamy",
    descent: "patrilineal",
    inheritance: "primogeniture",
    nameOrder: "given-family",
    ancestorNaming: 0.1,
    traditions: [],
    adulthoodAge: 16,
    marriageAgeF: 18,
    marriageAgeM: 21,
    colors: ["#334455", "#aabbcc"],
    attitudes: { violence: 0.4, mysticism: 0.5, patriarchy: 0.5, openness: 0.5 },
  };
}

function makeReligion(id: number, cultureId: number): Religion {
  return {
    id,
    name: "The Quiet Water",
    adherentName: "Stillfolk",
    shape: "animist",
    deities: [],
    virtues: ["patience"],
    sins: ["oathbreaking"],
    holyDays: [],
    clergyTitle: "Springkeeper",
    clergyCelibate: false,
    clergyGender: "any",
    funeralRite: "The dead are given to the river.",
    afterlife: "The stream carries all back.",
    origin: cultureId,
    parent: null,
    founder: null,
    zeal: 0.3,
    tenets: [],
  };
}

function defaultPhenotype(rng: Rng): Phenotype {
  return {
    skinTone: 0.4,
    hairColor: rng.int(10),
    hairTexture: rng.int(4),
    eyeColor: rng.int(9),
    heightScore: rng.range(-1, 1),
    buildScore: rng.range(-1, 1),
    faceShape: rng.int(6),
    noseShape: rng.int(6),
    jawShape: rng.int(6),
    browShape: rng.int(6),
    mouthShape: rng.int(6),
    earShape: rng.int(6),
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
  };
}

function defaultPersonality(rng: Rng): Personality {
  return {
    openness: rng.range(-0.3, 0.3),
    diligence: rng.range(-0.3, 0.3),
    sociability: rng.range(-0.2, 0.5),
    agreeableness: rng.range(-0.2, 0.5),
    volatility: rng.range(-0.4, 0.2),
    courage: rng.range(-0.4, 0.2),
    ambition: rng.range(0.1, 0.6),
    piety: rng.range(0.2, 0.7),
    honor: rng.range(-0.4, 0.7),
    lust: rng.range(0.05, 0.85),
    greed: rng.range(0.1, 0.5),
    wrath: rng.range(0, 0.4),
    compassion: rng.range(0.2, 0.7),
    traits: [],
  };
}

// ---------------------------------------------------------------------------
// Spies & harness
// ---------------------------------------------------------------------------

export interface KillCall {
  id: PersonId;
  cause: string;
  killer?: PersonId;
  event?: number;
}

export interface Spies {
  kills: KillCall[];
}

export interface TestPersonOpts {
  sex?: Sex;
  ageYears?: number;
  location?: number | null;
  profession?: ProfessionKey;
  wealth?: number;
  courage?: number;
  aptitudes?: Partial<Record<Aptitude, number>>;
  givenName?: string;
  polityCulture?: boolean;
}

export interface TestHarness {
  world: World;
  services: Services;
  spies: Spies;
  root: Rng;
  regions: Region[];
  settlements: Settlement[];
  /** By name for convenient lookup: "Gullhaven", "Threll", ... */
  byName: Record<string, Settlement>;
  /** Advance one month, running only the economy tick. */
  tick: () => void;
  /** A ctx for direct calls at the current month. */
  mkCtx: () => Ctx;
  addPerson: (opts?: TestPersonOpts) => Person;
}

export interface TestWorldOpts {
  seed?: string;
  startYear?: number;
  /** Skip default resident seeding (start with an empty population). */
  unpeopled?: boolean;
}

interface SettlementSpec {
  name: string;
  kind: SettlementKind;
  pop: number;
}

interface RegionSpec {
  name: string;
  biome: Biome;
  settlements: SettlementSpec[];
}

const GEOGRAPHY: RegionSpec[] = [
  {
    name: "Saltmere",
    biome: "coast",
    settlements: [
      { name: "Gullhaven", kind: "port", pop: 450 },
      { name: "Netherby", kind: "village", pop: 160 },
    ],
  },
  {
    name: "Threllwold",
    biome: "plains",
    settlements: [
      { name: "Threll", kind: "town", pop: 520 },
      { name: "Barleywick", kind: "village", pop: 200 },
    ],
  },
  {
    name: "Fenmarch",
    biome: "marsh",
    settlements: [
      { name: "Eelham", kind: "village", pop: 140 },
      { name: "Reedholt", kind: "village", pop: 110 },
    ],
  },
  {
    name: "Stonefall",
    biome: "mountains",
    settlements: [
      { name: "Craghold", kind: "stronghold", pop: 320 },
      { name: "Underfell", kind: "village", pop: 130 },
    ],
  },
];

/** Adjacency: chain plus one cross-link (Saltmere touches Fenmarch). */
const ADJACENT: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [0, 2],
];

const PROFESSIONS_BY_KIND: Record<SettlementKind, ProfessionKey[]> = {
  port: ["sailor", "fisher", "fisher", "merchant", "innkeeper", "farmer", "weaver", "farmer"],
  town: ["merchant", "peddler", "innkeeper", "smith", "baker", "farmer", "farmer", "weaver"],
  city: ["merchant", "merchant", "innkeeper", "smith", "scribe", "servant", "farmer", "baker"],
  village: ["farmer", "farmer", "farmer", "herder", "hunter", "midwife", "carpenter", "farmer"],
  stronghold: ["soldier", "guard", "smith", "servant", "farmer", "farmer", "steward", "farmer"],
  "temple-town": ["priest", "monastic", "servant", "farmer", "farmer", "scribe", "baker", "farmer"],
};

const AGE_CYCLE = [34, 29, 41, 8, 62, 25, 17, 50];

export function makeEconWorld(opts?: TestWorldOpts): TestHarness {
  const seed = opts?.seed ?? "econ-test";
  const world = createEmptyWorld({
    seed,
    startPop: 0,
    popCap: 500,
    regions: GEOGRAPHY.length,
    cultures: 1,
    startYear: opts?.startYear ?? 100,
  });
  const root = new Rng(seed, `test:${seed}`);
  const spies: Spies = { kills: [] };

  const lang = makeLanguage(nextId(world, "language"));
  world.languages.set(lang.id, lang);
  const culture = makeCulture(nextId(world, "culture"), lang.id);
  world.cultures.set(culture.id, culture);
  const religion = makeReligion(nextId(world, "religion"), culture.id);
  world.religions.set(religion.id, religion);

  const regions: Region[] = [];
  const settlements: Settlement[] = [];
  const byName: Record<string, Settlement> = {};
  for (let i = 0; i < GEOGRAPHY.length; i++) {
    const spec = GEOGRAPHY[i];
    const region: Region = {
      id: nextId(world, "region"),
      name: spec.name,
      biome: spec.biome,
      adjacent: [],
      settlements: [],
      x: 20 + i * 20,
      y: 40,
    };
    world.regions.set(region.id, region);
    regions.push(region);
    for (const sspec of spec.settlements) {
      const s: Settlement = {
        id: nextId(world, "settlement"),
        name: sspec.name,
        kind: sspec.kind,
        region: region.id,
        polity: 0,
        abstractPop: sspec.pop,
        founded: world.now,
        economy: sspec.kind === "port" ? ["fishing", "salt"] : ["grain", "wool"],
        conditions: {},
      };
      world.settlements.set(s.id, s);
      region.settlements.push(s.id);
      settlements.push(s);
      byName[s.name] = s;
    }
  }
  for (const [a, b] of ADJACENT) {
    regions[a].adjacent.push(regions[b].id);
    regions[b].adjacent.push(regions[a].id);
  }

  let personCounter = 0;
  const addPerson = (popts?: TestPersonOpts): Person => {
    const id = nextId(world, "person");
    personCounter += 1;
    const prng = root.fork("person", personCounter);
    const sex: Sex = popts?.sex ?? (personCounter % 2 === 0 ? "m" : "f");
    const ageYears = popts?.ageYears ?? 30;
    const personality = defaultPersonality(prng.fork("per"));
    if (popts?.courage !== undefined) personality.courage = popts.courage;
    const phenotype = defaultPhenotype(prng.fork("ph"));
    if (popts?.aptitudes) phenotype.aptitudes = { ...popts.aptitudes };
    const person: Person = {
      id,
      givenName: popts?.givenName ?? `P${id}`,
      surname: "Test",
      epithet: "",
      nickname: "",
      sex,
      culture: culture.id,
      religion: religion.id,
      house: null,
      born: world.now - ageYears * 12,
      died: null,
      deathCause: null,
      location: popts?.location === undefined ? settlements[0].id : popts.location,
      mother: null,
      father: null,
      legalFather: null,
      children: [],
      marriages: [],
      betrothed: null,
      pregnancy: null,
      genome: new Int16Array(16),
      phenotype,
      personality,
      status: {
        profession: popts?.profession ?? "farmer",
        wealth: popts?.wealth ?? 2,
        rank: 1,
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
    world.people.set(id, person);
    world.alive.add(id);
    world.stats.totalBorn += 1;
    return person;
  };

  // Default residents: a working cross-section per settlement, plus one
  // brave soul apiece (for rescue mechanics).
  if (!opts?.unpeopled) {
    for (const s of settlements) {
      const professions = PROFESSIONS_BY_KIND[s.kind];
      for (let i = 0; i < professions.length; i++) {
        addPerson({
          location: s.id,
          profession: AGE_CYCLE[i] < 14 ? "none" : professions[i],
          ageYears: AGE_CYCLE[i],
        });
      }
      addPerson({
        location: s.id,
        profession: "hunter",
        ageYears: 28,
        courage: 0.7,
        aptitudes: { war: 2 },
        givenName: `Brave-${s.name}`,
      });
    }
  }

  const services = makeStubServices(spies);

  const mkCtx = (): Ctx => ({
    world,
    services,
    rng: root.fork("tick", world.now),
    record: (ev) => recordEvent(world, ev),
  });

  const tick = (): void => {
    world.now += 1;
    world.stats.year = yearOf(world.now);
    services.economy.tick(mkCtx());
    world.stats.alive = world.alive.size;
  };

  return { world, services, spies, root, regions, settlements, byName, tick, mkCtx, addPerson };
}

// ---------------------------------------------------------------------------
// Stub services (economy is the real one under test)
// ---------------------------------------------------------------------------

function makeStubServices(spies: Spies): Services {
  const services: Services = {
    language: {
      generate: () => makeLanguage(0),
      derive: (_rng, parent) => ({ ...makeLanguage(0), parent: parent.id }),
      givenName: () => "Name",
      familyName: () => "Family",
      patronymic: (_lang, fatherGiven) => fatherGiven + "sson",
      placeName: () => "Place",
      deityName: () => "Deity",
      epithet: (_rng, _lang, theme) => "the " + theme,
      // Deterministic pseudo-words from the provided rng stream.
      word: (rng) => {
        const heads = ["ska", "vor", "mer", "run", "dath", "os", "gril", "then"];
        const tails = ["va", "eth", "un", "ir", "ost", "al"];
        return rng.pick(heads) + rng.pick(tails);
      },
    },
    culture: {
      generate: () => makeCulture(0, 0),
      derive: (_rng, _world, parent) => ({ ...makeCulture(0, 0), parent: parent.id }),
      fullName: (_world, person) => `${person.givenName} ${person.surname}`.trim(),
      babyName: () => "Baby",
      babySurname: () => "Test",
    },
    religion: {
      generate: () => makeReligion(0, 0),
      schism: (_rng, _world, parent) => ({ ...makeReligion(0, parent.origin), parent: parent.id }),
      tick: () => {},
    },
    genetics: {
      genomeLength: () => 8,
      founderGenome: () => new Int16Array(16),
      reproduce: () => new Int16Array(16),
      express: (_genome, _sex, rng) => defaultPhenotype(rng),
      litterSize: () => 1,
      resemblance: () => 0.2,
      inbreeding: () => 0,
      basePersonality: (_ph, rng) => defaultPersonality(rng),
    },
    portrait: {
      portraitSVG: () => "<svg/>",
      bannerSVG: () => "<svg/>",
    },
    people: {
      createFounder: () => {
        throw new Error("createFounder not stubbed; use harness.addPerson");
      },
      createChild: () => {
        throw new Error("createChild not stubbed; use harness.addPerson");
      },
      tick: () => {},
      marriageTick: () => {},
      kill: (ctx, person, cause, opts) => {
        spies.kills.push({ id: person.id, cause, killer: opts?.killer, event: opts?.event });
        if (person.died !== null) return;
        person.died = ctx.world.now;
        person.deathCause = cause;
        ctx.world.alive.delete(person.id);
        ctx.world.stats.totalDied += 1;
        for (const m of person.marriages) {
          if (m.active) {
            m.active = false;
            m.endDate = ctx.world.now;
            m.endReason = "death";
          }
        }
        const participants: Record<string, PersonId> = { subject: person.id };
        if (opts?.killer != null) participants.killer = opts.killer;
        ctx.record({
          type: "death",
          date: ctx.world.now,
          participants,
          data: { cause, ageYears: yearsBetween(person.born, ctx.world.now) },
          location: person.location,
          region:
            person.location != null
              ? (ctx.world.settlements.get(person.location)?.region ?? null)
              : null,
          importance: 10,
          causes: opts?.event != null ? [opts.event] : [],
          storyline: null,
          secret: false,
        });
      },
      age: (world, p) => {
        const until = p.died !== null && p.died < world.now ? p.died : world.now;
        return Math.max(0, yearsBetween(p.born, until));
      },
      lifeStage: (world, p) => {
        const a = services.people.age(world, p);
        if (a < 3) return "infant";
        if (a < 12) return "child";
        if (a < 16) return "youth";
        if (a < 60) return "adult";
        return "elder";
      },
    },
    social: {
      tick: () => {},
      getOpinion: () => 0,
      setRelation: () => {},
      getRelation: () => null,
      adjustOpinion: () => {},
      addMemory: () => {},
      closeKin: () => false,
    },
    politics: {
      found: () => {},
      tick: () => {},
      onDeath: () => {},
      successionLine: () => [],
    },
    story: { tick: () => {} },
    economy: createEconomyService(),
    narrative: {
      renderEvent: (_world, ev) => `[${ev.type}]`,
      renderHeadline: (_world, ev) => ev.type,
      renderLife: (_world, person) => person.givenName,
      shortName: (_world, p) => p.givenName,
    },
  };
  return services;
}

// ---------------------------------------------------------------------------
// Digest for determinism tests
// ---------------------------------------------------------------------------

/** Stable digest of chronicle, conditions, wealth, pops, econ state. */
export function worldDigest(world: World): string {
  const events = [...world.events.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const e = world.events.get(id)!;
      return {
        id: e.id,
        type: e.type,
        date: e.date,
        participants: e.participants,
        data: e.data,
        location: e.location,
        region: e.region,
        importance: e.importance,
        causes: e.causes,
      };
    });
  const settlements = [...world.settlements.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const s = world.settlements.get(id)!;
      const keys = Object.keys(s.conditions).sort();
      return [id, s.abstractPop, keys.map((k) => [k, s.conditions[k]])];
    });
  const people = [...world.people.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const p = world.people.get(id)!;
      return [id, p.status.wealth, p.died, p.deathCause, p.injuries];
    });
  const worldConditions = Object.keys(world.conditions)
    .sort()
    .map((k) => [k, world.conditions[k]]);
  return JSON.stringify({ events, settlements, people, worldConditions });
}
