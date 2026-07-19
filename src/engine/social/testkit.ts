/**
 * Test kit for the social module: a fabricated miniature world plus
 * minimal deterministic stub services. The social service under test is
 * the real one; everything else (people, genetics, ...) is stubbed so the
 * module can be exercised in isolation, per the module-isolation contract.
 */

import { Rng } from "../core/rng";
import { yearOf, yearsBetween } from "../core/time";
import { createEmptyWorld, nextId, recordEvent } from "../core/world";
import type {
  Aptitude,
  Culture,
  Ctx,
  House,
  Language,
  Person,
  PersonId,
  Personality,
  Phenotype,
  Region,
  Religion,
  Services,
  Settlement,
  Sex,
  World,
} from "../core/types";
import { createSocialService } from "./index";

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

export interface TestCultureOpts {
  violence?: number;
  adulthoodAge?: number;
  values?: Culture["values"];
}

function makeCulture(id: number, languageId: number, opts?: TestCultureOpts): Culture {
  return {
    id,
    name: `Testarin${id}`,
    demonym: `Testari${id}`,
    language: languageId,
    parent: null,
    values: opts?.values ?? ["kinship", "craftsmanship", "hospitality"],
    marriage: "monogamy",
    descent: "patrilineal",
    inheritance: "primogeniture",
    nameOrder: "given-family",
    ancestorNaming: 0.1,
    traditions: [],
    adulthoodAge: opts?.adulthoodAge ?? 16,
    marriageAgeF: 18,
    marriageAgeM: 21,
    colors: ["#334455", "#aabbcc"],
    attitudes: {
      violence: opts?.violence ?? 0.4,
      mysticism: 0.5,
      patriarchy: 0.5,
      openness: 0.5,
    },
  };
}

function makeReligion(id: number, cultureId: number): Religion {
  return {
    id,
    name: `The Quiet Water ${id}`,
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
    courage: rng.range(-0.3, 0.3),
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
// Spies & controls
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

export interface StubControls {
  /** Fixed resemblance returned for all pairs (default 0.2). */
  resemblance: number;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export interface TestWorldOpts extends TestCultureOpts {
  seed?: string;
  settlements?: number;
  startYear?: number;
}

export interface TestHarness {
  world: World;
  services: Services;
  spies: Spies;
  controls: StubControls;
  root: Rng;
  cultures: Culture[];
  religions: Religion[];
  settlements: Settlement[];
  houses: House[];
  /** Advance one month, running only the social tick (module isolation). */
  tick: () => void;
  /** A ctx for direct service calls at the current month. */
  mkCtx: () => Ctx;
  addPerson: (opts?: TestPersonOpts) => Person;
  marry: (a: Person, b: Person) => void;
}

export interface TestPersonOpts {
  sex?: Sex;
  ageYears?: number;
  location?: number | null;
  culture?: number;
  religion?: number;
  house?: number | null;
  rank?: number;
  wealth?: number;
  profession?: Person["status"]["profession"];
  personality?: Partial<Personality>;
  aptitudes?: Partial<Record<Aptitude, number>>;
  mother?: PersonId | null;
  father?: PersonId | null;
  legalFather?: PersonId | null;
  givenName?: string;
}

export function makeTestWorld(opts?: TestWorldOpts): TestHarness {
  const seed = opts?.seed ?? "social-test";
  const world = createEmptyWorld({
    seed,
    startPop: 0,
    popCap: 500,
    regions: 1,
    cultures: 2,
    startYear: opts?.startYear ?? 80,
  });
  const root = new Rng(seed, `test:${seed}`);
  const spies: Spies = { kills: [] };
  const controls: StubControls = { resemblance: 0.2 };

  const lang = makeLanguage(nextId(world, "language"));
  world.languages.set(lang.id, lang);
  const cultures = [
    makeCulture(nextId(world, "culture"), lang.id, opts),
    makeCulture(nextId(world, "culture"), lang.id, opts),
  ];
  for (const c of cultures) world.cultures.set(c.id, c);
  const religions = [
    makeReligion(nextId(world, "religion"), cultures[0].id),
    makeReligion(nextId(world, "religion"), cultures[1].id),
  ];
  for (const r of religions) world.religions.set(r.id, r);

  const region: Region = {
    id: nextId(world, "region"),
    name: "Testmark",
    biome: "plains",
    adjacent: [],
    settlements: [],
    x: 50,
    y: 50,
  };
  world.regions.set(region.id, region);

  const settlements: Settlement[] = [];
  const nSettlements = opts?.settlements ?? 2;
  for (let s = 0; s < nSettlements; s++) {
    const settlement: Settlement = {
      id: nextId(world, "settlement"),
      name: s === 0 ? "Harrowfen" : `Thornmere${s}`,
      kind: "village",
      region: region.id,
      polity: 0,
      abstractPop: 200,
      founded: world.now,
      economy: ["grain"],
      conditions: {},
    };
    world.settlements.set(settlement.id, settlement);
    region.settlements.push(settlement.id);
    settlements.push(settlement);
  }

  const houses: House[] = [];
  for (let i = 0; i < 2; i++) {
    const house: House = {
      id: nextId(world, "house"),
      name: i === 0 ? "House Maren" : "House Durroch",
      motto: "Hold Fast",
      founder: 0,
      founded: world.now,
      head: null,
      seat: settlements[0].id,
      culture: cultures[0].id,
      parent: null,
      prestige: 10,
      bannerSeed: `banner-${i}`,
      feuds: new Map(),
    };
    world.houses.set(house.id, house);
    houses.push(house);
  }

  let personCounter = 0;
  const addPerson = (popts?: TestPersonOpts): Person => {
    const id = nextId(world, "person");
    personCounter += 1;
    const prng = root.fork("person", personCounter);
    const sex: Sex = popts?.sex ?? (personCounter % 2 === 0 ? "m" : "f");
    const ageYears = popts?.ageYears ?? 25;
    const personality = { ...defaultPersonality(prng.fork("per")), ...popts?.personality };
    const phenotype = defaultPhenotype(prng.fork("ph"));
    if (popts?.aptitudes) phenotype.aptitudes = { ...popts.aptitudes };
    const person: Person = {
      id,
      givenName: popts?.givenName ?? `P${id}`,
      surname: "Test",
      epithet: "",
      nickname: "",
      sex,
      culture: popts?.culture ?? cultures[0].id,
      religion: popts?.religion ?? religions[0].id,
      house: popts?.house ?? null,
      born: world.now - ageYears * 12,
      died: null,
      deathCause: null,
      location: popts?.location === undefined ? settlements[0].id : popts.location,
      mother: popts?.mother ?? null,
      father: popts?.father ?? null,
      legalFather: popts?.legalFather ?? null,
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
        rank: popts?.rank ?? 1,
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
    // Register on parents' children lists.
    for (const pid of [person.mother, person.father]) {
      if (pid == null) continue;
      const parent = world.people.get(pid);
      if (parent && !parent.children.includes(id)) parent.children.push(id);
    }
    return person;
  };

  const marry = (a: Person, b: Person): void => {
    a.marriages.push({ spouse: b.id, date: world.now, active: true });
    b.marriages.push({ spouse: a.id, date: world.now, active: true });
  };

  const services = makeStubServices(spies, controls);

  const mkCtx = (): Ctx => ({
    world,
    services,
    rng: root.fork("tick", world.now),
    record: (ev) => recordEvent(world, ev),
  });

  const tick = (): void => {
    world.now += 1;
    world.stats.year = yearOf(world.now);
    services.social.tick(mkCtx());
    world.stats.alive = world.alive.size;
  };

  return {
    world,
    services,
    spies,
    controls,
    root,
    cultures,
    religions,
    settlements,
    houses,
    tick,
    mkCtx,
    addPerson,
    marry,
  };
}

// ---------------------------------------------------------------------------
// Stub services (social is the real one under test)
// ---------------------------------------------------------------------------

function makeStubServices(spies: Spies, controls: StubControls): Services {
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
      word: () => "word",
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
      resemblance: () => controls.resemblance,
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
          region: person.location != null
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
    social: createSocialService(),
    politics: {
      found: () => {},
      tick: () => {},
      onDeath: () => {},
      successionLine: () => [],
    },
    story: { tick: () => {} },
    economy: { tick: () => {} },
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

/** Stable digest of chronicle, relationships, memories, flags, feuds. */
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
        importance: e.importance,
        causes: e.causes,
        secret: e.secret,
        revealed: e.revealed,
      };
    });
  const relationships = [...world.relationships.keys()]
    .sort((a, b) => a - b)
    .map((a) => {
      const inner = world.relationships.get(a)!;
      return [
        a,
        [...inner.keys()]
          .sort((x, y) => x - y)
          .map((b) => {
            const r = inner.get(b)!;
            return [b, r.kind, r.since, r.opinion];
          }),
      ];
    });
  const memories = [...world.memories.keys()]
    .sort((a, b) => a - b)
    .map((id) => [
      id,
      world.memories.get(id)!.map((m) => [m.event, m.about, m.feeling, Number(m.weight.toFixed(6))]),
    ]);
  const flags = [...world.people.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const p = world.people.get(id)!;
      const keys = Object.keys(p.flags).sort();
      return [id, keys.map((k) => [k, p.flags[k]]), p.died, p.injuries];
    });
  const feuds = [...world.houses.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const h = world.houses.get(id)!;
      return [
        id,
        [...h.feuds.keys()].sort((x, y) => x - y).map((o) => [o, Number((h.feuds.get(o) ?? 0).toFixed(6))]),
      ];
    });
  return JSON.stringify({ events, relationships, memories, flags, feuds });
}
