/**
 * Test fixtures: a minimal fake world with a handmade language, cultures,
 * settlements, polities and people, plus a tick harness that mirrors how
 * engine.ts drives services (root.fork("tick", world.now) each month).
 */

import { Rng } from "../../core/rng";
import { makeDate } from "../../core/time";
import type {
  Culture,
  CultureId,
  CultureValue,
  Ctx,
  Language,
  LanguageId,
  Person,
  PersonId,
  PolityId,
  Region,
  RegionId,
  Religion,
  ReligionId,
  ReligionService,
  Services,
  Settlement,
  SettlementId,
  Sex,
  World,
} from "../../core/types";
import { createEmptyWorld, nextId, recordEvent } from "../../core/world";

export function makeLanguage(world: World, name = "Vessari"): Language {
  const id = nextId(world, "language") as LanguageId;
  const lang: Language = {
    id,
    name,
    family: "vessarin",
    parent: null,
    phonology: {
      consonants: ["k", "t", "n", "r", "s", "m", "l", "d", "v", "th", "sh"],
      vowels: ["a", "e", "i", "o", "u"],
      patterns: ["CV", "CVC", "V"],
      patternWeights: [3, 2, 1],
      finals: ["n", "r", "s", "l", "th"],
      orthography: [["kk", "ck"]],
      forbidden: ["uu", "ii"],
    },
    femaleEndings: ["a", "is"],
    maleEndings: ["n", "or"],
    patronymicF: ["", "sdota"],
    patronymicM: ["", "son"],
    lexicon: { fire: "ashka", sea: "maru" },
    monthNames: [
      "Fros",
      "Thaw",
      "Seed",
      "Rain",
      "Blos",
      "Hay",
      "Sun",
      "Sheaf",
      "Vint",
      "Fall",
      "Mist",
      "Dark",
    ],
  };
  world.languages.set(id, lang);
  return lang;
}

export interface CultureOpts {
  values?: CultureValue[];
  mysticism?: number;
  patriarchy?: number;
}

export function makeCulture(world: World, lang: Language, opts: CultureOpts = {}): Culture {
  const id = nextId(world, "culture") as CultureId;
  const culture: Culture = {
    id,
    name: "Vessarin",
    demonym: "Vessari",
    language: lang.id,
    parent: null,
    values: opts.values ?? ["kinship", "hospitality", "honor"],
    marriage: "monogamy",
    descent: "patrilineal",
    inheritance: "primogeniture",
    nameOrder: "given-family",
    ancestorNaming: 0.3,
    traditions: [],
    adulthoodAge: 16,
    marriageAgeF: 17,
    marriageAgeM: 20,
    colors: ["#884422", "#224488"],
    attitudes: {
      violence: 0.4,
      mysticism: opts.mysticism ?? 0.5,
      patriarchy: opts.patriarchy ?? 0.5,
      openness: 0.5,
    },
  };
  world.cultures.set(id, culture);
  return culture;
}

export function makeWorld(seed: string): World {
  return createEmptyWorld({
    seed,
    startPop: 60,
    popCap: 200,
    regions: 2,
    cultures: 1,
    startYear: 100,
  });
}

export function makeRegion(world: World, name = "Harrowmere"): Region {
  const id = nextId(world, "region") as RegionId;
  const region: Region = {
    id,
    name,
    biome: "plains",
    adjacent: [],
    settlements: [],
    x: 40,
    y: 40,
  };
  world.regions.set(id, region);
  return region;
}

export function makeSettlement(
  world: World,
  region: Region,
  polity: PolityId,
  opts: { name?: string; pop?: number; kind?: Settlement["kind"] } = {},
): Settlement {
  const id = nextId(world, "settlement") as SettlementId;
  const s: Settlement = {
    id,
    name: opts.name ?? `Stead${id}`,
    kind: opts.kind ?? "town",
    region: region.id,
    polity,
    abstractPop: opts.pop ?? 400,
    founded: makeDate(80, 1),
    economy: ["grain", "wool"],
    conditions: {},
  };
  world.settlements.set(id, s);
  region.settlements.push(id);
  return s;
}

export function makePolity(
  world: World,
  culture: Culture,
  religion: ReligionId,
  regions: RegionId[],
  capital: SettlementId,
): PolityId {
  const id = nextId(world, "polity") as PolityId;
  world.polities.set(id, {
    id,
    name: `Realm${id}`,
    kind: "chiefdom",
    capital,
    regions,
    ruler: null,
    rulerTitleM: "Chief",
    rulerTitleF: "Chieftess",
    rulingHouse: null,
    succession: "male-primogeniture",
    founded: makeDate(80, 1),
    reigns: [],
    relations: new Map(),
    court: new Map(),
    prestige: 10,
    culture: culture.id,
    religion,
  });
  return id;
}

export interface PersonOpts {
  sex?: Sex;
  ageYears?: number;
  piety?: number;
  volatility?: number;
  wrath?: number;
  profession?: Person["status"]["profession"];
  rareTraits?: string[];
  religion?: ReligionId;
}

export function makePerson(
  world: World,
  culture: Culture,
  religion: ReligionId,
  location: SettlementId,
  opts: PersonOpts = {},
): Person {
  const id = nextId(world, "person") as PersonId;
  const age = opts.ageYears ?? 30;
  const p: Person = {
    id,
    givenName: `Name${id}`,
    surname: `House${id % 7}`,
    epithet: "",
    nickname: "",
    sex: opts.sex ?? (id % 2 === 0 ? "f" : "m"),
    culture: culture.id,
    religion: opts.religion ?? religion,
    house: null,
    born: world.now - age * 12,
    died: null,
    deathCause: null,
    location,
    mother: null,
    father: null,
    legalFather: null,
    children: [],
    marriages: [],
    betrothed: null,
    pregnancy: null,
    genome: new Int16Array(0),
    phenotype: {
      skinTone: 0.4,
      hairColor: 2,
      hairTexture: 1,
      eyeColor: 3,
      heightScore: 0,
      buildScore: 0,
      faceShape: 0,
      noseShape: 0,
      jawShape: 0,
      browShape: 0,
      mouthShape: 0,
      earShape: 0,
      freckles: false,
      dimples: false,
      cleftChin: false,
      rareTraits: opts.rareTraits ?? [],
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
    },
    personality: {
      openness: 0,
      diligence: 0,
      sociability: 0,
      agreeableness: 0,
      volatility: opts.volatility ?? 0,
      courage: 0,
      ambition: 0.3,
      piety: opts.piety ?? 0.3,
      honor: 0,
      lust: 0.3,
      greed: 0.3,
      wrath: opts.wrath ?? 0.2,
      compassion: 0.5,
      traits: [],
    },
    status: {
      profession: opts.profession ?? "farmer",
      wealth: 2,
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
  world.people.set(id, p);
  world.alive.add(id);
  world.stats.alive = world.alive.size;
  return p;
}

/**
 * A full fixture: one language, two cultures (opts per polity), a generated
 * religion for each, two polities of two settlements, and a spread of
 * residents including priests and one Sighted person per polity.
 */
export interface TickFixture {
  world: World;
  root: Rng;
  service: ReligionService;
  religions: Religion[];
  polities: PolityId[];
}

export function makeTickFixture(
  seed: string,
  service: ReligionService,
  cultureOpts: CultureOpts[] = [
    { values: ["kinship", "hospitality", "honor"], mysticism: 0.5 },
    { values: ["seafaring", "trade", "revelry"], mysticism: 0.6 },
  ],
): TickFixture {
  const world = makeWorld(seed);
  const root = new Rng(seed, `test:${seed}`);
  const lang = makeLanguage(world);
  const religions: Religion[] = [];
  const polities: PolityId[] = [];

  cultureOpts.forEach((opts, i) => {
    const culture = makeCulture(world, lang, opts);
    const religion = service.generate(root.fork("religion", i), world, culture);
    religion.id = nextId(world, "religion") as ReligionId;
    religion.origin = culture.id;
    world.religions.set(religion.id, religion);
    religions.push(religion);

    const region = makeRegion(world, `Region${i}`);
    const town = makeSettlement(world, region, 0, { pop: 600 });
    const village = makeSettlement(world, region, 0, { pop: 180, kind: "village" });
    const pid = makePolity(world, culture, religion.id, [region.id], town.id);
    polities.push(pid);
    town.polity = pid;
    village.polity = pid;

    const seats: SettlementId[] = [town.id, town.id, village.id];
    const personRng = root.fork("people", i);
    for (let k = 0; k < 24; k++) {
      makePerson(world, culture, religion.id, seats[k % seats.length], {
        ageYears: 16 + ((k * 5) % 40),
        piety: personRng.next(),
        volatility: personRng.range(-0.5, 0.9),
        wrath: personRng.next() * 0.8,
        profession:
          k === 0 ? "priest" : k === 1 ? "midwife" : k % 5 === 0 ? "weaver" : "farmer",
        rareTraits: k === 3 ? ["the-sight"] : [],
      });
    }
  });

  return { world, root, service, religions, polities };
}

/** Advance the fake world by n monthly ticks, exactly as engine.ts would. */
export function runMonths(fix: TickFixture, months: number): void {
  for (let i = 0; i < months; i++) {
    fix.world.now += 1;
    const ctx: Ctx = {
      world: fix.world,
      services: {} as Services, // religion tick must not depend on other services
      rng: fix.root.fork("tick", fix.world.now),
      record: (ev) => recordEvent(fix.world, ev),
    };
    fix.service.tick(ctx);
  }
}

/** Serialize the chronicle for determinism comparisons. */
export function chronicleFingerprint(world: World): string {
  const events = [...world.events.values()].map((e) => ({
    id: e.id,
    type: e.type,
    date: e.date,
    participants: e.participants,
    data: e.data,
    location: e.location,
    region: e.region,
    importance: e.importance,
    causes: e.causes,
    secret: e.secret,
  }));
  return JSON.stringify(events);
}
