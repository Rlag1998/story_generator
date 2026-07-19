/**
 * Test kit for the story module: a fabricated miniature world plus
 * deterministic stub services (with spies), so arcs can be exercised in
 * isolation from the real people/social/politics modules.
 */

import { Rng } from "../core/rng";
import { yearOf } from "../core/time";
import { createEmptyWorld, nextId, recordEvent } from "../core/world";
import type {
  Aptitude,
  Culture,
  Ctx,
  EventId,
  Genome,
  House,
  Language,
  Person,
  PersonId,
  Personality,
  Phenotype,
  Polity,
  ProfessionKey,
  Region,
  Religion,
  Services,
  Settlement,
  Sex,
  World,
} from "../core/types";
import { createStoryService } from "./index";

// ---------------------------------------------------------------------------
// Stub world fixtures
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
    lexicon: { fire: "karn", stone: "dros", memory: "vessa" },
    monthNames: Array.from({ length: 12 }, (_, i) => `M${i + 1}`),
  };
}

function makeCulture(id: number, languageId: number): Culture {
  return {
    id,
    name: "Testarin",
    demonym: "Testari",
    language: languageId,
    parent: null,
    values: ["kinship", "craftsmanship", "honor"],
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
    attitudes: { violence: 0.5, mysticism: 0.6, patriarchy: 0.5, openness: 0.5 },
  };
}

function makeReligion(id: number, cultureId: number, name = "The Quiet Water"): Religion {
  return {
    id,
    name,
    adherentName: "Stillfolk",
    shape: "animist",
    deities: [],
    virtues: ["patience"],
    sins: ["oathbreaking"],
    holyDays: [],
    clergyTitle: "Springkeeper",
    clergyCelibate: false,
    clergyGender: "any",
    funeralRite: "Given to the river under a grey dawn.",
    afterlife: "The stream carries all back.",
    origin: cultureId,
    parent: null,
    founder: null,
    zeal: 0.5,
    tenets: ["Still water sees the truth."],
  };
}

function makePhenotype(rng: Rng): Phenotype {
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

function makePersonality(rng: Rng): Personality {
  return {
    openness: rng.range(-0.5, 0.5),
    diligence: rng.range(-0.5, 0.5),
    sociability: rng.range(-0.5, 0.5),
    agreeableness: rng.range(-0.5, 0.5),
    volatility: rng.range(-0.5, 0.5),
    courage: rng.range(-0.5, 0.5),
    ambition: rng.next(),
    piety: rng.next(),
    honor: rng.range(-0.5, 0.5),
    lust: rng.next(),
    greed: rng.next(),
    wrath: rng.next(),
    compassion: rng.next(),
    traits: [],
  };
}

export interface PersonOpts {
  sex?: Sex;
  ageYears?: number;
  location?: number;
  house?: number | null;
  rank?: number;
  wealth?: number;
  profession?: ProfessionKey;
  religion?: number;
  personality?: Partial<Personality>;
  aptitudes?: Partial<Record<Aptitude, number>>;
  rareTraits?: string[];
  givenName?: string;
}

// ---------------------------------------------------------------------------
// Spies + stub services
// ---------------------------------------------------------------------------

export interface Spies {
  kills: { person: PersonId; cause: string; killer?: PersonId; event?: EventId }[];
  schisms: { parent: number; founder: PersonId }[];
  opinionAdjusts: { a: PersonId; b: PersonId; delta: number }[];
  memories: { person: PersonId; about: PersonId | null; event: EventId }[];
}

export function makeStubServices(harness: () => TestHarness): { services: Services; spies: Spies } {
  const spies: Spies = { kills: [], schisms: [], opinionAdjusts: [], memories: [] };

  const services: Services = {
    language: {
      generate: () => makeLanguage(0),
      derive: (_rng, parent) => ({ ...makeLanguage(0), parent: parent.id }),
      givenName: (rng) => "N" + rng.int(1000),
      familyName: (rng) => "F" + rng.int(1000),
      patronymic: (_lang, fatherGiven) => fatherGiven + "sson",
      placeName: (rng) => "P" + rng.int(1000),
      deityName: (rng) => "D" + rng.int(1000),
      epithet: (_rng, _lang, theme) => "the " + theme.charAt(0).toUpperCase() + theme.slice(1),
      word: (rng, lang, concept) => lang.lexicon[concept] ?? "w" + rng.int(100),
    },
    culture: {
      generate: (_rng, _world, language) => makeCulture(0, language.id),
      derive: (_rng, _world, parent, language) => ({ ...makeCulture(0, language.id), parent: parent.id }),
      fullName: (_world, person) => `${person.givenName} ${person.surname}`.trim(),
      babyName: (rng, _world, _mother, _father, sex) => (sex === "f" ? "Ba" : "Bo") + rng.int(100),
      babySurname: (_world, mother) => mother.surname,
    },
    religion: {
      generate: (_rng, _world, culture) => makeReligion(0, culture.id),
      schism: (_rng, world, parent, founder) => {
        spies.schisms.push({ parent: parent.id, founder: founder.id });
        const id = nextId(world, "religion");
        const r = makeReligion(id, parent.origin, "The New Flame");
        r.parent = parent.id;
        r.founder = founder.id;
        world.religions.set(id, r);
        return r;
      },
      tick: () => {},
    },
    genetics: {
      genomeLength: () => 4,
      founderGenome: () => new Int16Array(8) as Genome,
      reproduce: () => new Int16Array(8) as Genome,
      express: (_g, _s, rng) => makePhenotype(rng),
      litterSize: () => 1,
      resemblance: () => 0.5,
      inbreeding: () => 0,
      basePersonality: (_ph, rng) => makePersonality(rng),
    },
    portrait: {
      portraitSVG: () => "<svg/>",
      bannerSVG: () => "<svg/>",
    },
    people: {
      createFounder: () => {
        throw new Error("testkit: use h.addPerson");
      },
      createChild: () => {
        throw new Error("testkit: use h.addPerson");
      },
      tick: () => {},
      marriageTick: () => {},
      kill: (ctx, person, cause, opts) => {
        // Mirror of the real module's essentials: death event + bookkeeping.
        if (person.died !== null) return;
        spies.kills.push({ person: person.id, cause, killer: opts?.killer, event: opts?.event });
        person.died = ctx.world.now;
        person.deathCause = cause;
        ctx.world.alive.delete(person.id);
        ctx.world.stats.totalDied += 1;
        const participants: Record<string, PersonId> = { subject: person.id };
        if (opts?.killer != null) participants.killer = opts.killer;
        ctx.record({
          type: "death",
          date: ctx.world.now,
          participants,
          data: { cause, ageYears: Math.floor((ctx.world.now - person.born) / 12) },
          location: person.location,
          region: person.location != null ? (ctx.world.settlements.get(person.location)?.region ?? null) : null,
          importance: 10,
          causes: opts?.event != null ? [opts.event] : [],
          storyline: null,
          secret: false,
        });
      },
      age: (world, p) => Math.max(0, Math.floor(((p.died ?? world.now) - p.born) / 12)),
      lifeStage: (world, p) => {
        const age = Math.max(0, Math.floor(((p.died ?? world.now) - p.born) / 12));
        if (age < 3) return "infant";
        if (age < 12) return "child";
        if (age < 16) return "youth";
        if (age < 60) return "adult";
        return "elder";
      },
    },
    social: {
      tick: () => {},
      getOpinion: (world, a, b) => world.relationships.get(a)?.get(b)?.opinion ?? 0,
      setRelation: (world, a, b, rel) => {
        let inner = world.relationships.get(a);
        if (!inner) {
          inner = new Map();
          world.relationships.set(a, inner);
        }
        inner.set(b, rel);
      },
      getRelation: (world, a, b) => world.relationships.get(a)?.get(b) ?? null,
      adjustOpinion: (world, a, b, delta) => {
        spies.opinionAdjusts.push({ a, b, delta });
        const inner = world.relationships.get(a);
        const rel = inner?.get(b);
        if (rel) {
          rel.opinion = Math.max(-100, Math.min(100, rel.opinion + delta));
        } else {
          let m = inner;
          if (!m) {
            m = new Map();
            world.relationships.set(a, m);
          }
          m.set(b, { kind: delta >= 0 ? "friend" : "rival", since: world.now, opinion: Math.max(-100, Math.min(100, delta)) });
        }
      },
      addMemory: (world, person, memory) => {
        spies.memories.push({ person, about: memory.about, event: memory.event });
        const list = world.memories.get(person) ?? [];
        list.push(memory);
        world.memories.set(person, list);
      },
      closeKin: () => false,
    },
    politics: {
      found: () => {},
      tick: () => {},
      onDeath: () => {},
      successionLine: (world, polity, limit) => {
        // The harness can pin a line per polity; default: empty.
        const h = harness();
        const line = h.successionLines.get(polity.id) ?? [];
        return line.slice(0, limit ?? line.length).filter((id) => world.alive.has(id));
      },
    },
    story: createStoryService(),
    economy: { tick: () => {} },
    narrative: {
      renderEvent: (_world, ev) => `[${ev.type}]`,
      renderHeadline: (_world, ev) => ev.type,
      renderLife: (_world, person) => person.givenName,
      shortName: (_world, p) => p.givenName,
    },
  };

  return { services, spies };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

export interface TestWorldOpts {
  seed?: string;
  settlements?: number;
  startYear?: number;
  popCap?: number;
}

export interface TestHarness {
  world: World;
  services: Services;
  spies: Spies;
  root: Rng;
  culture: Culture;
  religion: Religion;
  settlements: Settlement[];
  successionLines: Map<number, PersonId[]>;
  addPerson(opts?: PersonOpts): Person;
  addHouse(name: string, seat: number | null): House;
  addPolity(capital: number, ruler: PersonId | null): Polity;
  /** Advance one month, running only the story service (isolation). */
  tick(): void;
  mkCtx(): Ctx;
}

export function makeTestWorld(opts?: TestWorldOpts): TestHarness {
  const seed = opts?.seed ?? "story-test";
  const world = createEmptyWorld({
    seed,
    startPop: 0,
    popCap: opts?.popCap ?? 500,
    regions: 1,
    cultures: 1,
    startYear: opts?.startYear ?? 100,
  });
  const root = new Rng(seed, `test:${seed}`);

  let harness: TestHarness;
  const { services, spies } = makeStubServices(() => harness);

  const lang = makeLanguage(nextId(world, "language"));
  world.languages.set(lang.id, lang);
  const culture = makeCulture(nextId(world, "culture"), lang.id);
  world.cultures.set(culture.id, culture);
  const religion = makeReligion(nextId(world, "religion"), culture.id);
  world.religions.set(religion.id, religion);

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
  // A far region so elopements have somewhere to run.
  const farRegion: Region = {
    id: nextId(world, "region"),
    name: "Farmark",
    biome: "hills",
    adjacent: [],
    settlements: [],
    x: 80,
    y: 20,
  };
  world.regions.set(farRegion.id, farRegion);

  const settlements: Settlement[] = [];
  const nSettlements = Math.max(2, opts?.settlements ?? 2);
  for (let i = 0; i < nSettlements; i++) {
    const inFar = i === nSettlements - 1;
    const home = inFar ? farRegion : region;
    const settlement: Settlement = {
      id: nextId(world, "settlement"),
      name: i === 0 ? "Harrowfen" : inFar ? "Farholt" : `Thornmere${i}`,
      kind: "village",
      region: home.id,
      polity: 0,
      abstractPop: 200,
      founded: world.now,
      economy: ["grain"],
      conditions: {},
    };
    world.settlements.set(settlement.id, settlement);
    home.settlements.push(settlement.id);
    settlements.push(settlement);
  }

  let nameCounter = 0;

  harness = {
    world,
    services,
    spies,
    root,
    culture,
    religion,
    settlements,
    successionLines: new Map(),

    addPerson(popts?: PersonOpts): Person {
      const id = nextId(world, "person") as PersonId;
      const rng = root.fork("person", id);
      const age = popts?.ageYears ?? 30;
      const sex: Sex = popts?.sex ?? (id % 2 === 0 ? "f" : "m");
      const personality = { ...makePersonality(rng.fork("pers")), ...(popts?.personality ?? {}) };
      const phenotype = makePhenotype(rng.fork("ph"));
      if (popts?.aptitudes) phenotype.aptitudes = { ...popts.aptitudes };
      if (popts?.rareTraits) phenotype.rareTraits = [...popts.rareTraits];
      const p: Person = {
        id,
        givenName: popts?.givenName ?? `Name${++nameCounter}`,
        surname: "Test",
        epithet: "",
        nickname: "",
        sex,
        culture: culture.id,
        religion: popts?.religion ?? religion.id,
        house: popts?.house ?? null,
        born: world.now - age * 12,
        died: null,
        deathCause: null,
        location: popts?.location ?? settlements[0].id,
        mother: null,
        father: null,
        legalFather: null,
        children: [],
        marriages: [],
        betrothed: null,
        pregnancy: null,
        genome: new Int16Array(8) as Genome,
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
      world.people.set(id, p);
      world.alive.add(id);
      world.stats.totalBorn += 1;
      return p;
    },

    addHouse(name: string, seat: number | null): House {
      const id = nextId(world, "house");
      const house: House = {
        id,
        name,
        motto: "Test and Hold",
        founder: 0,
        founded: world.now,
        head: null,
        seat,
        culture: culture.id,
        parent: null,
        prestige: 10,
        bannerSeed: name,
        feuds: new Map(),
      };
      world.houses.set(id, house);
      return house;
    },

    addPolity(capital: number, ruler: PersonId | null): Polity {
      const id = nextId(world, "polity");
      const polity: Polity = {
        id,
        name: "Testreach",
        kind: "chiefdom",
        capital,
        regions: [region.id],
        ruler,
        rulerTitleM: "Chief",
        rulerTitleF: "Chieftess",
        rulingHouse: null,
        succession: "male-primogeniture",
        founded: world.now,
        reigns: [],
        relations: new Map(),
        court: new Map(),
        prestige: 20,
        culture: culture.id,
        religion: religion.id,
      };
      world.polities.set(id, polity);
      const s = world.settlements.get(capital);
      if (s) s.polity = id;
      return polity;
    },

    tick(): void {
      world.now += 1;
      world.stats.year = yearOf(world.now);
      const ctx = harness.mkCtx();
      services.story.tick(ctx);
      world.stats.alive = world.alive.size;
    },

    mkCtx(): Ctx {
      return {
        world,
        services,
        rng: root.fork("tick", world.now),
        record: (ev) => recordEvent(world, ev),
      };
    },
  };

  return harness;
}

/** Marry two people in place (mirrors worldgen's quiet marriages). */
export function marry(world: World, a: Person, b: Person): void {
  a.marriages.push({ spouse: b.id, date: world.now, active: true });
  b.marriages.push({ spouse: a.id, date: world.now, active: true });
}

/** Stable digest of the chronicle for determinism tests. */
export function chronicleDigest(world: World): string {
  const events = [...world.events.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const e = world.events.get(id)!;
      return `${e.id}|${e.type}|${e.date}|${JSON.stringify(e.participants)}|${JSON.stringify(e.data)}|${e.importance}|${e.causes.join(",")}|${e.storyline}|${e.secret}`;
    });
  const lines = [...world.storylines.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const s = world.storylines.get(id)!;
      return `${s.id}|${s.kind}|${s.stage}|${s.resolved}|${s.outcome}|${s.events.join(",")}|${JSON.stringify(s.cast)}`;
    });
  return JSON.stringify({ events, lines });
}
