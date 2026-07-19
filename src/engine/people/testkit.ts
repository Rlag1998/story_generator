/**
 * Test kit: a fabricated miniature world plus minimal deterministic stub
 * services, so the people module can be exercised in isolation.
 */

import { Rng } from "../core/rng";
import { makeDate, yearOf } from "../core/time";
import { createEmptyWorld, nextId, recordEvent } from "../core/world";
import type {
  Aptitude,
  Culture,
  Ctx,
  DescentRule,
  Genome,
  Language,
  MarriageCustom,
  NameOrder,
  Person,
  PersonId,
  Personality,
  Phenotype,
  Region,
  Religion,
  Services,
  Settlement,
  SettlementKind,
  Sex,
  World,
} from "../core/types";
import { createPeopleService } from "./index";

// ---------------------------------------------------------------------------
// Stub building blocks
// ---------------------------------------------------------------------------

const CONS = ["k", "r", "t", "n", "s", "v", "l", "m"];
const VOWS = ["a", "e", "i", "o", "u"];
const APTS: Aptitude[] = [
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
];

function syl(rng: Rng): string {
  return CONS[rng.int(CONS.length)] + VOWS[rng.int(VOWS.length)];
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function makeLanguage(id: number): Language {
  return {
    id,
    name: "Testari",
    family: "test",
    parent: null,
    phonology: {
      consonants: CONS,
      vowels: VOWS,
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
    lexicon: { sickness: "vess", fever: "karn" },
    monthNames: Array.from({ length: 12 }, (_, i) => `Month${i + 1}`),
  };
}

export interface TestCultureOpts {
  marriage?: MarriageCustom;
  descent?: DescentRule;
  nameOrder?: NameOrder;
  adulthoodAge?: number;
}

function makeCulture(id: number, languageId: number, opts?: TestCultureOpts): Culture {
  return {
    id,
    name: "Testarin",
    demonym: "Testari",
    language: languageId,
    parent: null,
    values: ["kinship", "craftsmanship", "hospitality"],
    marriage: opts?.marriage ?? "monogamy",
    descent: opts?.descent ?? "patrilineal",
    inheritance: "primogeniture",
    nameOrder: opts?.nameOrder ?? "given-family",
    ancestorNaming: 0.1,
    traditions: [
      {
        key: "first-spear",
        name: "The First Spear",
        description: "At majority each youth carries a spear to the boundary stone and back.",
        hooks: ["coming-of-age"],
      },
      {
        key: "cord-binding",
        name: "The Binding of Cords",
        description: "Bride and groom bind wrists with a woven cord dyed in house colors.",
        hooks: ["wedding"],
      },
    ],
    adulthoodAge: opts?.adulthoodAge ?? 16,
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
    virtues: ["patience", "candor"],
    sins: ["oathbreaking"],
    holyDays: [{ name: "First Thaw", month: 3, theme: "renewal" }],
    clergyTitle: "Springkeeper",
    clergyCelibate: false,
    clergyGender: "any",
    funeralRite: "The dead are given to the river under a grey dawn.",
    afterlife: "The stream carries all back to the source.",
    origin: cultureId,
    parent: null,
    founder: null,
    zeal: 0.3,
    tenets: ["Still water sees the truth."],
  };
}

// ---------------------------------------------------------------------------
// Stub services
// ---------------------------------------------------------------------------

export interface Spies {
  onDeath: PersonId[];
  memories: { person: PersonId; about: PersonId | null; event: number }[];
  opinionAdjusts: { a: PersonId; b: PersonId; delta: number }[];
}

export interface StubControls {
  /** Force litter size for all conceptions (null = default behavior). */
  forcedLitter: number | null;
  /** Fixed inbreeding coefficient returned for all pairs. */
  inbreeding: number;
}

const GENOME_LOCI = 8;

function makePhenotype(genome: Genome, sex: Sex, rng: Rng): Phenotype {
  const aptitudes: Partial<Record<Aptitude, number>> = {};
  if (rng.chance(0.3)) aptitudes[APTS[rng.int(APTS.length)]] = rng.intIn(1, 3);
  return {
    skinTone: 0.4,
    hairColor: Math.abs(genome[0] ?? 0) % 10,
    hairTexture: Math.abs(genome[1] ?? 0) % 4,
    eyeColor: Math.abs(genome[2] ?? 0) % 9,
    heightScore: rng.range(-1, 1),
    buildScore: rng.range(-1, 1),
    faceShape: rng.int(6),
    noseShape: rng.int(6),
    jawShape: rng.int(6),
    browShape: rng.int(6),
    mouthShape: rng.int(6),
    earShape: rng.int(6),
    freckles: rng.chance(0.2),
    dimples: rng.chance(0.1),
    cleftChin: rng.chance(0.1),
    rareTraits: rng.chance(0.02) ? ["silver-streak"] : [],
    tempOpenness: rng.range(-0.5, 0.5),
    tempDiligence: rng.range(-0.5, 0.5),
    tempSociability: rng.range(-0.5, 0.5),
    tempAgreeableness: rng.range(-0.5, 0.5),
    tempVolatility: rng.range(-0.5, 0.5),
    aptitudes,
    constitution: rng.range(-0.5, 0.5),
    fertilityMod: rng.range(0.85, 1.15),
    twinningMod: 1,
    longevityMod: rng.range(0.9, 1.1),
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

export function makeStubServices(): { services: Services; spies: Spies; controls: StubControls } {
  const spies: Spies = { onDeath: [], memories: [], opinionAdjusts: [] };
  const controls: StubControls = { forcedLitter: null, inbreeding: 0 };

  const givenName = (rng: Rng, lang: Language, sex: Sex): string => {
    const base = syl(rng) + syl(rng);
    return cap(sex === "f" ? base + "a" : base + (rng.chance(0.4) ? "n" : ""));
  };

  const services: Services = {
    language: {
      generate: () => makeLanguage(0),
      derive: (rng, parent) => ({ ...makeLanguage(0), parent: parent.id }),
      givenName,
      familyName: (rng) => cap(syl(rng) + syl(rng)),
      patronymic: (lang, fatherGiven, childSex) =>
        fatherGiven + (childSex === "f" ? lang.patronymicF[1] : lang.patronymicM[1]),
      placeName: (rng) => cap(syl(rng) + syl(rng)),
      deityName: (rng) => cap(syl(rng) + syl(rng)),
      epithet: (rng, _lang, theme) => "the " + cap(theme),
      word: (rng, lang, concept) => lang.lexicon[concept] ?? syl(rng) + syl(rng),
    },
    culture: {
      generate: (rng, world, language) => makeCulture(0, language.id),
      derive: (rng, world, parent, language) => ({ ...makeCulture(0, language.id), parent: parent.id }),
      fullName: (world, person) =>
        person.surname.length > 0 ? `${person.givenName} ${person.surname}` : person.givenName,
      babyName: (rng, world, mother, _father, sex) => {
        const culture = world.cultures.get(mother.culture)!;
        const lang = world.languages.get(culture.language)!;
        return givenName(rng, lang, sex);
      },
      babySurname: (world, mother, father, sex, _given) => {
        const culture = world.cultures.get(mother.culture)!;
        const lang = world.languages.get(culture.language)!;
        switch (culture.nameOrder) {
          case "given-family":
          case "family-given":
            return father?.surname ?? mother.surname;
          case "given-patronymic":
            return (father?.givenName ?? "Orn") + (sex === "f" ? lang.patronymicF[1] : lang.patronymicM[1]);
          case "given-only":
            return "";
        }
      },
    },
    religion: {
      generate: (rng, world, culture) => makeReligion(0, culture.id),
      schism: (rng, world, parent) => ({ ...makeReligion(0, parent.origin), parent: parent.id }),
      tick: () => {},
    },
    genetics: {
      genomeLength: () => GENOME_LOCI,
      founderGenome: (rng) => {
        const g = new Int16Array(GENOME_LOCI * 2);
        for (let i = 0; i < g.length; i++) g[i] = rng.int(4);
        return g;
      },
      reproduce: (rng, mother, father) => {
        const g = new Int16Array(GENOME_LOCI * 2);
        for (let i = 0; i < GENOME_LOCI; i++) {
          g[2 * i] = mother[2 * i + rng.int(2)] ?? 0;
          g[2 * i + 1] = father[2 * i + rng.int(2)] ?? 0;
        }
        return g;
      },
      express: (genome, sex, rng) => makePhenotype(genome, sex, rng),
      litterSize: (rng) =>
        controls.forcedLitter !== null ? controls.forcedLitter : rng.chance(0.018) ? 2 : 1,
      resemblance: () => 0.5,
      inbreeding: () => controls.inbreeding,
      basePersonality: (_ph, rng) => makePersonality(rng),
    },
    portrait: {
      portraitSVG: () => "<svg/>",
      bannerSVG: () => "<svg/>",
    },
    people: createPeopleService(),
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
        const rel = world.relationships.get(a)?.get(b);
        if (rel) rel.opinion = Math.max(-100, Math.min(100, rel.opinion + delta));
      },
      addMemory: (world, person, memory) => {
        spies.memories.push({ person, about: memory.about, event: memory.event });
        const list = world.memories.get(person) ?? [];
        list.push(memory);
        world.memories.set(person, list);
      },
      closeKin: (world, a, b) => stubCloseKin(world, a, b),
    },
    politics: {
      found: () => {},
      tick: () => {},
      onDeath: (_ctx, deceased) => {
        spies.onDeath.push(deceased.id);
      },
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

  return { services, spies, controls };
}

function parentsOf(world: World, id: PersonId): PersonId[] {
  const p = world.people.get(id);
  if (!p) return [];
  return [p.mother, p.father, p.legalFather].filter((x): x is PersonId => x != null);
}

function stubCloseKin(world: World, a: PersonId, b: PersonId): boolean {
  if (a === b) return true;
  const pa = parentsOf(world, a);
  const pb = parentsOf(world, b);
  if (pa.includes(b) || pb.includes(a)) return true; // parent-child
  if (pa.some((x) => pb.includes(x))) return true; // siblings/half-siblings
  const ga = pa.flatMap((p) => parentsOf(world, p));
  const gb = pb.flatMap((p) => parentsOf(world, p));
  if (ga.includes(b) || gb.includes(a)) return true; // grandparent
  if (ga.some((g) => pb.includes(g)) || gb.some((g) => pa.includes(g))) return true; // uncle-niece
  return false;
}

// ---------------------------------------------------------------------------
// Fabricated world
// ---------------------------------------------------------------------------

export interface TestWorldOpts extends TestCultureOpts {
  seed?: string;
  /** Founder couples to seed. */
  couples?: number;
  popCap?: number;
  settlements?: number;
  settlementKind?: SettlementKind;
  startYear?: number;
}

export interface TestHarness {
  world: World;
  services: Services;
  spies: Spies;
  controls: StubControls;
  root: Rng;
  culture: Culture;
  religion: Religion;
  settlements: Settlement[];
  /** Advance one month, running marriageTick then people tick (engine order). */
  tick: () => void;
  /** A ctx for direct service calls at the current month. */
  mkCtx: () => Ctx;
  founders: Person[];
}

export function makeTestWorld(opts?: TestWorldOpts): TestHarness {
  const seed = opts?.seed ?? "people-test";
  const couples = opts?.couples ?? 10;
  const world = createEmptyWorld({
    seed,
    startPop: couples * 2,
    popCap: opts?.popCap ?? 400,
    regions: 1,
    cultures: 1,
    startYear: opts?.startYear ?? 40,
  });
  const { services, spies, controls } = makeStubServices();
  const root = new Rng(seed, `test:${seed}`);

  const lang = makeLanguage(nextId(world, "language"));
  world.languages.set(lang.id, lang);
  const culture = makeCulture(nextId(world, "culture"), lang.id, opts);
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

  const settlements: Settlement[] = [];
  const nSettlements = opts?.settlements ?? 2;
  for (let s = 0; s < nSettlements; s++) {
    const settlement: Settlement = {
      id: nextId(world, "settlement"),
      name: s === 0 ? "Harrowfen" : `Thornmere${s}`,
      kind: opts?.settlementKind ?? "village",
      region: region.id,
      polity: 0,
      abstractPop: 200,
      founded: world.now,
      economy: ["grain", "wool"],
      conditions: {},
    };
    world.settlements.set(settlement.id, settlement);
    region.settlements.push(settlement.id);
    settlements.push(settlement);
  }

  // Founder couples, engine-style.
  const founders: Person[] = [];
  const popRng = root.fork("founders");
  for (let i = 0; i < couples; i++) {
    const famRng = popRng.fork("family", i);
    const location = settlements[i % settlements.length].id;
    const wife = services.people.createFounder(famRng.fork("w"), world, services, {
      culture: culture.id,
      religion: religion.id,
      location,
      house: null,
      sex: "f",
      ageYears: famRng.fork("wage").intIn(18, 30),
    });
    const husband = services.people.createFounder(famRng.fork("h"), world, services, {
      culture: culture.id,
      religion: religion.id,
      location,
      house: null,
      sex: "m",
      ageYears: famRng.fork("hage").intIn(20, 34),
    });
    wife.marriages.push({ spouse: husband.id, date: world.now, active: true });
    husband.marriages.push({ spouse: wife.id, date: world.now, active: true });
    founders.push(wife, husband);
  }

  const mkCtx = (): Ctx => ({
    world,
    services,
    rng: root.fork("tick", world.now),
    record: (ev) => recordEvent(world, ev),
  });

  const tick = (): void => {
    world.now += 1;
    world.stats.year = yearOf(world.now);
    const ctx = mkCtx();
    services.people.marriageTick(ctx);
    services.people.tick(ctx);
    world.stats.alive = world.alive.size;
  };

  return { world, services, spies, controls, root, culture, religion, settlements, tick, mkCtx, founders };
}

/** Stable digest of a world's chronicle + demographic outcomes. */
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
        importance: e.importance,
        causes: e.causes,
        secret: e.secret,
      };
    });
  const people = [...world.people.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const p = world.people.get(id)!;
      return {
        id: p.id,
        name: `${p.givenName} ${p.surname}`.trim(),
        sex: p.sex,
        born: p.born,
        died: p.died,
        cause: p.deathCause,
        profession: p.status.profession,
        marriages: p.marriages.length,
        children: p.children,
        litterMates: p.litterMates,
        location: p.location,
      };
    });
  return JSON.stringify({ events, people, stats: world.stats });
}

export { makeDate };
