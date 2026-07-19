/**
 * Test kit: fabricated miniature worlds plus deterministic stub services so
 * the politics module can be exercised in isolation. The people stub's
 * kill() mirrors the production cascade (death event, then politics.onDeath)
 * so succession tests run end to end.
 */

import { Rng } from "../core/rng";
import { makeDate, yearOf } from "../core/time";
import { createEmptyWorld, nextId, recordEvent } from "../core/world";
import type {
  Aptitude,
  Culture,
  CultureValue,
  Ctx,
  DescentRule,
  EventRecord,
  Genome,
  House,
  HouseId,
  InheritanceCustom,
  Language,
  Person,
  PersonId,
  Personality,
  Phenotype,
  Polity,
  PolityId,
  Region,
  RegionId,
  Religion,
  Services,
  Settlement,
  SettlementId,
  SettlementKind,
  Sex,
  SuccessionLaw,
  World,
} from "../core/types";
import { createPoliticsService } from "./index";

// ---------------------------------------------------------------------------
// Stub world-gen entities
// ---------------------------------------------------------------------------

const CONS = ["k", "r", "t", "n", "s", "v", "l", "m", "d", "b"];
const VOWS = ["a", "e", "i", "o", "u"];

function syl(rng: Rng): string {
  return CONS[rng.int(CONS.length)] + VOWS[rng.int(VOWS.length)];
}

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

export function makeLanguage(id: number): Language {
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
    lexicon: {},
    monthNames: Array.from({ length: 12 }, (_, i) => `Month${i + 1}`),
  };
}

export interface TestCultureOpts {
  values?: CultureValue[];
  descent?: DescentRule;
  inheritance?: InheritanceCustom;
  patriarchy?: number;
  adulthoodAge?: number;
}

export function makeCulture(id: number, languageId: number, opts?: TestCultureOpts): Culture {
  return {
    id,
    name: "Testarin",
    demonym: "Testari",
    language: languageId,
    parent: null,
    values: opts?.values ?? ["kinship", "honor", "craftsmanship"],
    marriage: "monogamy",
    descent: opts?.descent ?? "patrilineal",
    inheritance: opts?.inheritance ?? "primogeniture",
    nameOrder: "given-family",
    ancestorNaming: 0.1,
    traditions: [],
    adulthoodAge: opts?.adulthoodAge ?? 16,
    marriageAgeF: 18,
    marriageAgeM: 21,
    colors: ["#334455", "#aabbcc"],
    attitudes: {
      violence: 0.4,
      mysticism: 0.4,
      patriarchy: opts?.patriarchy ?? 0.5,
      openness: 0.5,
    },
  };
}

export function makeReligion(id: number, cultureId: number, zeal = 0.3): Religion {
  return {
    id,
    name: "The Quiet Water",
    adherentName: "Stillfolk",
    shape: "animist",
    deities: [],
    virtues: ["patience", "candor"],
    sins: ["oathbreaking"],
    holyDays: [],
    clergyTitle: "Springkeeper",
    clergyCelibate: false,
    clergyGender: "any",
    funeralRite: "The dead are given to the river under a grey dawn.",
    afterlife: "The stream carries all back to the source.",
    origin: cultureId,
    parent: null,
    founder: null,
    zeal,
    tenets: ["Still water sees the truth."],
  };
}

// ---------------------------------------------------------------------------
// Deterministic person fabrication
// ---------------------------------------------------------------------------

const GENOME_LOCI = 4;

function makePhenotype(rng: Rng): Phenotype {
  const aptitudes: Partial<Record<Aptitude, number>> = {};
  if (rng.chance(0.35)) {
    const apts: Aptitude[] = ["war", "trade", "lore", "music", "intrigue", "oratory"];
    aptitudes[apts[rng.int(apts.length)]] = rng.intIn(1, 3);
  }
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
    aptitudes,
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
    wrath: rng.next() * 0.5,
    compassion: rng.next(),
    traits: [],
  };
}

export interface SpawnOpts {
  sex?: Sex;
  ageYears?: number;
  born?: number;
  culture?: number;
  religion?: number;
  location?: SettlementId | null;
  house?: HouseId | null;
  rank?: number;
  profession?: Person["status"]["profession"];
  mother?: PersonId | null;
  father?: PersonId | null;
  ambition?: number;
  courage?: number;
  name?: string;
  dead?: boolean;
}

/** Fabricate a person directly (for dynasty tests), wiring parent links. */
export function spawn(world: World, opts: SpawnOpts): Person {
  const id = nextId(world, "person") as PersonId;
  const rng = new Rng(`spawn-${world.params.seed}-${id}`, `spawn:${id}`);
  const sex: Sex = opts.sex ?? (rng.chance(0.5) ? "f" : "m");
  const born = opts.born ?? world.now - (opts.ageYears ?? 30) * 12;
  const person: Person = {
    id,
    givenName: opts.name ?? cap(syl(rng) + syl(rng)) + (sex === "f" ? "a" : ""),
    surname: "",
    epithet: "",
    nickname: "",
    sex,
    culture: opts.culture ?? 1,
    religion: opts.religion ?? 1,
    house: opts.house ?? null,
    born,
    died: null,
    deathCause: null,
    location: opts.location === undefined ? 1 : opts.location,
    mother: opts.mother ?? null,
    father: opts.father ?? null,
    legalFather: null,
    children: [],
    marriages: [],
    betrothed: null,
    pregnancy: null,
    genome: new Int16Array(GENOME_LOCI * 2) as Genome,
    phenotype: makePhenotype(rng),
    personality: makePersonality(rng),
    status: {
      profession: opts.profession ?? "none",
      wealth: 2,
      rank: opts.rank ?? 1,
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
  if (opts.ambition !== undefined) person.personality.ambition = opts.ambition;
  if (opts.courage !== undefined) person.personality.courage = opts.courage;
  for (const pid of [opts.mother, opts.father]) {
    if (pid != null) world.people.get(pid)?.children.push(id);
  }
  world.people.set(id, person);
  if (opts.dead) {
    person.died = world.now - 12;
    person.deathCause = "long dead";
  } else {
    world.alive.add(id);
  }
  world.stats.totalBorn += 1;
  return person;
}

// ---------------------------------------------------------------------------
// Stub services
// ---------------------------------------------------------------------------

export interface Spies {
  kills: { id: PersonId; cause: string; event: number | null }[];
}

export function makeStubServices(): { services: Services; spies: Spies } {
  const spies: Spies = { kills: [] };

  const services: Services = {
    language: {
      generate: () => makeLanguage(0),
      derive: (_rng, parent) => ({ ...makeLanguage(0), parent: parent.id }),
      givenName: (rng, _lang, sex) => cap(syl(rng) + syl(rng)) + (sex === "f" ? "a" : ""),
      familyName: (rng) => cap(syl(rng) + syl(rng)),
      patronymic: (lang, fatherGiven, childSex) =>
        fatherGiven + (childSex === "f" ? lang.patronymicF[1] : lang.patronymicM[1]),
      placeName: (rng) => cap(syl(rng) + syl(rng) + syl(rng)),
      deityName: (rng) => cap(syl(rng) + syl(rng)),
      epithet: (_rng, _lang, theme) => "the " + cap(theme),
      word: (rng) => syl(rng) + syl(rng),
    },
    culture: {
      generate: (_rng, _world, language) => makeCulture(0, language.id),
      derive: (_rng, _world, parent, language) => ({
        ...makeCulture(0, language.id),
        parent: parent.id,
      }),
      fullName: (_world, person) =>
        person.surname.length > 0 ? `${person.givenName} ${person.surname}` : person.givenName,
      babyName: (rng, _world, _mother, _father, sex) =>
        cap(syl(rng) + syl(rng)) + (sex === "f" ? "a" : ""),
      babySurname: () => "",
    },
    religion: {
      generate: (_rng, _world, culture) => makeReligion(0, culture.id),
      schism: (_rng, _world, parent) => ({ ...makeReligion(0, parent.origin), parent: parent.id }),
      tick: () => {},
    },
    genetics: {
      genomeLength: () => GENOME_LOCI,
      founderGenome: () => new Int16Array(GENOME_LOCI * 2) as Genome,
      reproduce: () => new Int16Array(GENOME_LOCI * 2) as Genome,
      express: (_genome, _sex, rng) => makePhenotype(rng),
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
      createFounder(rng, world, _services, opts) {
        const p = spawn(world, {
          sex: opts.sex ?? (rng.fork("sex").chance(0.5) ? "f" : "m"),
          ageYears: opts.ageYears ?? rng.fork("age").intIn(18, 50),
          culture: opts.culture,
          religion: opts.religion,
          location: opts.location,
          house: opts.house,
          rank: opts.rank ?? 1,
        });
        // Founders arrive with a trade in hand where the test cares.
        if (p.status.rank <= 2) p.status.profession = "farmer";
        return p;
      },
      createChild(_rng, world, _services, mother, father) {
        return spawn(world, {
          ageYears: 0,
          born: world.now,
          culture: mother.culture,
          religion: mother.religion,
          location: mother.location,
          house: father?.house ?? mother.house,
          mother: mother.id,
          father: father?.id ?? null,
        });
      },
      tick: () => {},
      marriageTick: () => {},
      kill(ctx, person, cause, opts) {
        if (person.died !== null) return;
        person.died = ctx.world.now;
        person.deathCause = cause;
        ctx.world.alive.delete(person.id);
        ctx.world.stats.totalDied += 1;
        spies.kills.push({ id: person.id, cause, event: opts?.event ?? null });
        const ev = ctx.record({
          type: "death",
          date: ctx.world.now,
          participants: { subject: person.id },
          data: { cause, ageYears: Math.floor((ctx.world.now - person.born) / 12) },
          location: person.location,
          region:
            person.location != null
              ? (ctx.world.settlements.get(person.location)?.region ?? null)
              : null,
          importance: 8 + person.status.rank * 5,
          causes: opts?.event != null ? [opts.event] : [],
          storyline: null,
          secret: false,
        });
        void ev;
        ctx.services.politics.onDeath(ctx, person);
      },
      age: (world, p) => Math.max(0, Math.floor(((p.died ?? world.now) - p.born) / 12)),
      lifeStage: (world, p) => {
        const a = Math.max(0, Math.floor(((p.died ?? world.now) - p.born) / 12));
        return a < 3 ? "infant" : a < 12 ? "child" : a < 16 ? "youth" : a < 60 ? "adult" : "elder";
      },
    },
    social: {
      tick: () => {},
      getOpinion: () => 0,
      setRelation: () => {},
      getRelation: () => null,
      adjustOpinion: () => {},
      addMemory: () => {},
      closeKin: (world, a, b) => {
        if (a === b) return true;
        const pa = world.people.get(a);
        const pb = world.people.get(b);
        if (!pa || !pb) return false;
        const parentsA = [pa.mother, pa.father].filter((x) => x != null);
        const parentsB = [pb.mother, pb.father].filter((x) => x != null);
        if (parentsA.includes(b) || parentsB.includes(a)) return true;
        return parentsA.some((x) => parentsB.includes(x));
      },
    },
    politics: createPoliticsService(),
    story: { tick: () => {} },
    economy: { tick: () => {} },
    narrative: {
      renderEvent: (_world, ev) => `[${ev.type}]`,
      renderHeadline: (_world, ev) => String(ev.type),
      renderLife: (_world, person) => person.givenName,
      shortName: (_world, p) => p.givenName,
    },
  };

  return { services, spies };
}

// ---------------------------------------------------------------------------
// A generated political world (runs found() over fabricated geography)
// ---------------------------------------------------------------------------

export interface PoliticalWorldOpts extends TestCultureOpts {
  seed?: string;
  cultures?: number;
  regionsPerCulture?: number;
  settlementsPerRegion?: number;
  zeal?: number;
  startYear?: number;
  commonersPerSettlement?: number;
  soldiersPerSettlement?: number;
}

export interface PoliticalHarness {
  world: World;
  services: Services;
  spies: Spies;
  root: Rng;
  mkCtx: () => Ctx;
  /** Advance one month, running only the politics tick. */
  tick: () => void;
}

export function makePoliticalWorld(opts?: PoliticalWorldOpts): PoliticalHarness {
  const seed = opts?.seed ?? "politics-test";
  const nCultures = opts?.cultures ?? 2;
  const regionsPer = opts?.regionsPerCulture ?? 2;
  const world = createEmptyWorld({
    seed,
    startPop: 100,
    popCap: 800,
    regions: nCultures * regionsPer,
    cultures: nCultures,
    startYear: opts?.startYear ?? 40,
  });
  const { services, spies } = makeStubServices();
  const root = new Rng(seed, `test:${seed}`);

  const settlementKinds: SettlementKind[] = ["town", "village", "stronghold"];
  const cultureIds: number[] = [];
  for (let c = 0; c < nCultures; c++) {
    const lang = makeLanguage(nextId(world, "language"));
    world.languages.set(lang.id, lang);
    const culture = makeCulture(nextId(world, "culture"), lang.id, opts);
    world.cultures.set(culture.id, culture);
    const religion = makeReligion(nextId(world, "religion"), culture.id, opts?.zeal ?? 0.3);
    world.religions.set(religion.id, religion);
    cultureIds.push(culture.id);
  }

  const regionIds: RegionId[] = [];
  for (let r = 0; r < nCultures * regionsPer; r++) {
    const region: Region = {
      id: nextId(world, "region"),
      name: `Mark${r + 1}`,
      biome: "plains",
      adjacent: [],
      settlements: [],
      x: 10 + r * 12,
      y: 40,
    };
    world.regions.set(region.id, region);
    regionIds.push(region.id);
  }
  for (let r = 1; r < regionIds.length; r++) {
    const a = world.regions.get(regionIds[r - 1])!;
    const b = world.regions.get(regionIds[r])!;
    a.adjacent.push(b.id);
    b.adjacent.push(a.id);
  }

  const perRegion = opts?.settlementsPerRegion ?? 2;
  for (let r = 0; r < regionIds.length; r++) {
    const region = world.regions.get(regionIds[r])!;
    for (let s = 0; s < perRegion; s++) {
      const settlement: Settlement = {
        id: nextId(world, "settlement"),
        name: `Stead${r + 1}x${s + 1}`,
        kind: settlementKinds[(r + s) % settlementKinds.length],
        region: region.id,
        polity: 0,
        abstractPop: 150 + s * 120 + r * 10,
        founded: world.now,
        economy: ["grain"],
        conditions: {},
      };
      world.settlements.set(settlement.id, settlement);
      region.settlements.push(settlement.id);
    }
  }

  services.politics.found(root.fork("politics"), world, services);

  // Commoners (and levies) so wars have someone to bleed.
  const commoners = opts?.commonersPerSettlement ?? 4;
  const soldiers = opts?.soldiersPerSettlement ?? 3;
  for (const sid of [...world.settlements.keys()].sort((a, b) => a - b)) {
    const settlement = world.settlements.get(sid)!;
    const region = world.regions.get(settlement.region)!;
    const rIdx = regionIds.indexOf(region.id);
    const cIdx = Math.min(nCultures - 1, Math.floor((rIdx * nCultures) / regionIds.length));
    for (let i = 0; i < commoners + soldiers; i++) {
      const p = spawn(world, {
        ageYears: 20 + ((i * 3) % 25),
        culture: cultureIds[cIdx],
        religion: cultureIds[cIdx],
        location: sid,
        rank: 1,
      });
      p.status.profession = i < soldiers ? "soldier" : "farmer";
    }
  }
  world.stats.alive = world.alive.size;

  const mkCtx = (): Ctx => ({
    world,
    services,
    rng: root.fork("tick", world.now),
    record: (ev) => recordEvent(world, ev),
  });

  const tick = (): void => {
    world.now += 1;
    world.stats.year = yearOf(world.now);
    services.politics.tick(mkCtx());
    world.stats.alive = world.alive.size;
  };

  return { world, services, spies, root, mkCtx, tick };
}

// ---------------------------------------------------------------------------
// A hand-built dynasty world (for surgical succession tests)
// ---------------------------------------------------------------------------

export interface DynastyHarness extends PoliticalHarness {
  polity: Polity;
  house: House;
  culture: Culture;
  settlement: Settlement;
}

export interface DynastyOpts extends TestCultureOpts {
  seed?: string;
  law?: SuccessionLaw;
}

export function makeDynastyWorld(opts?: DynastyOpts): DynastyHarness {
  const seed = opts?.seed ?? "dynasty-test";
  const world = createEmptyWorld({
    seed,
    startPop: 20,
    popCap: 400,
    regions: 1,
    cultures: 1,
    startYear: 60,
  });
  const { services, spies } = makeStubServices();
  const root = new Rng(seed, `test:${seed}`);

  const lang = makeLanguage(nextId(world, "language"));
  world.languages.set(lang.id, lang);
  const culture = makeCulture(nextId(world, "culture"), lang.id, opts);
  world.cultures.set(culture.id, culture);
  const religion = makeReligion(nextId(world, "religion"), culture.id);
  world.religions.set(religion.id, religion);

  const region: Region = {
    id: nextId(world, "region"),
    name: "Kingsmark",
    biome: "plains",
    adjacent: [],
    settlements: [],
    x: 50,
    y: 50,
  };
  world.regions.set(region.id, region);
  const settlement: Settlement = {
    id: nextId(world, "settlement"),
    name: "Harrowmere",
    kind: "stronghold",
    region: region.id,
    polity: 0,
    abstractPop: 500,
    founded: world.now,
    economy: ["grain"],
    conditions: {},
  };
  world.settlements.set(settlement.id, settlement);
  region.settlements.push(settlement.id);

  const house: House = {
    id: nextId(world, "house"),
    name: "House Maren",
    motto: "The Line Unbroken",
    founder: 0,
    founded: world.now - 600,
    head: null,
    seat: settlement.id,
    culture: culture.id,
    parent: null,
    prestige: 30,
    bannerSeed: `${seed}:House Maren#1`,
    feuds: new Map(),
  };
  world.houses.set(house.id, house);

  const polity: Polity = {
    id: nextId(world, "polity"),
    name: "Marenhal",
    kind: "kingdom",
    capital: settlement.id,
    regions: [region.id],
    ruler: null,
    rulerTitleM: "King",
    rulerTitleF: "Queen",
    rulingHouse: house.id,
    succession: opts?.law ?? "male-primogeniture",
    founded: world.now - 600,
    reigns: [],
    relations: new Map(),
    court: new Map(),
    prestige: 50,
    culture: culture.id,
    religion: religion.id,
  };
  world.polities.set(polity.id, polity);
  settlement.polity = polity.id;

  const mkCtx = (): Ctx => ({
    world,
    services,
    rng: root.fork("tick", world.now),
    record: (ev) => recordEvent(world, ev),
  });

  const tick = (): void => {
    world.now += 1;
    world.stats.year = yearOf(world.now);
    services.politics.tick(mkCtx());
    world.stats.alive = world.alive.size;
  };

  return { world, services, spies, root, mkCtx, tick, polity, house, culture, settlement };
}

/** Seat a ruler on a dynasty-world throne without ceremony. */
export function enthrone(h: DynastyHarness, ruler: Person): void {
  h.polity.ruler = ruler.id;
  h.polity.reigns.push({ ruler: ruler.id, from: h.world.now - 120, to: null });
  ruler.status.rank = 5;
  ruler.status.profession = "ruler";
  if (h.house.head === null) h.house.head = ruler.id;
}

/** Stable digest of the chronicle plus polity bookkeeping. */
export function politicsDigest(world: World): string {
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
      };
    });
  const polities = [...world.polities.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const p = world.polities.get(id)!;
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        ruler: p.ruler,
        rulingHouse: p.rulingHouse,
        succession: p.succession,
        regions: p.regions,
        reigns: p.reigns,
        prestige: p.prestige,
        relations: [...p.relations.keys()]
          .sort((a, b) => a - b)
          .map((k) => [k, p.relations.get(k)!.stance]),
        court: [...p.court.keys()].sort().map((r) => [r, p.court.get(r)]),
      };
    });
  const houses = [...world.houses.keys()]
    .sort((a, b) => a - b)
    .map((id) => {
      const h = world.houses.get(id)!;
      return { id: h.id, name: h.name, head: h.head, motto: h.motto, seat: h.seat, parent: h.parent };
    });
  return JSON.stringify({ events, polities, houses });
}

export { makeDate };
export type { EventRecord };
