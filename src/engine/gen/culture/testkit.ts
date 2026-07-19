/**
 * Test fixtures for the culture module: a fabricated language, world and
 * pedigree small enough to reason about by hand. Not imported by runtime
 * code; only the *.test.ts files use this.
 */

import { makeDate } from "../../core/time";
import type {
  Culture,
  House,
  Language,
  Person,
  PersonId,
  Personality,
  Phenotype,
  Sex,
  World,
} from "../../core/types";
import { createEmptyWorld, nextId } from "../../core/world";

export function makeTestLanguage(overrides?: Partial<Language>): Language {
  const lang: Language = {
    id: 1,
    name: "Vessari",
    family: "vessic",
    parent: null,
    phonology: {
      consonants: ["k", "t", "s", "v", "r", "n", "l", "m", "d"],
      vowels: ["a", "e", "i", "o"],
      patterns: ["CV", "CVC", "VC"],
      patternWeights: [3, 2.5, 1],
      finals: ["n", "r", "s", "l", "th"],
      orthography: [],
      forbidden: ["kk", "vv"],
    },
    femaleEndings: ["a", "i", "eth"],
    maleEndings: ["", "an", "or"],
    patronymicF: ["", "sdottir"],
    patronymicM: ["", "sson"],
    lexicon: {
      sea: "mereth",
      sky: "valan",
      fire: "aska",
      iron: "jarn",
      salt: "salda",
    },
    monthNames: [
      "Fross", "Thaw", "Seed", "Rain", "Bloom", "Hay",
      "Harvest", "Ember", "Slaughter", "Frost", "Dark", "Yule",
    ],
    ...overrides,
  };
  return lang;
}

export function makeTestWorld(): World {
  return createEmptyWorld({
    seed: "test-seed",
    startPop: 10,
    popCap: 100,
    regions: 1,
    cultures: 1,
    startYear: 100,
  });
}

/** Insert a language into the world with a fresh id. */
export function addLanguage(world: World, lang: Language): Language {
  lang.id = nextId(world, "language");
  world.languages.set(lang.id, lang);
  return lang;
}

/** Insert a culture into the world with a fresh id. */
export function addCulture(world: World, culture: Culture): Culture {
  culture.id = nextId(world, "culture");
  world.cultures.set(culture.id, culture);
  return culture;
}

/** Insert a house into the world with a fresh id. */
export function addHouse(world: World, name: string, culture: number): House {
  const id = nextId(world, "house");
  const house: House = {
    id,
    name,
    motto: "Test before all",
    founder: 0,
    founded: makeDate(50, 1),
    head: null,
    seat: null,
    culture,
    parent: null,
    prestige: 10,
    bannerSeed: "test-banner",
    feuds: new Map(),
  };
  world.houses.set(id, house);
  return house;
}

function dummyPhenotype(): Phenotype {
  return {
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

function dummyPersonality(): Personality {
  return {
    openness: 0,
    diligence: 0,
    sociability: 0,
    agreeableness: 0,
    volatility: 0,
    courage: 0,
    ambition: 0.3,
    piety: 0.3,
    honor: 0,
    lust: 0.3,
    greed: 0.3,
    wrath: 0.3,
    compassion: 0.3,
    traits: [],
  };
}

export interface TestPersonOpts {
  givenName: string;
  sex: Sex;
  culture: number;
  surname?: string;
  house?: number | null;
  born?: number;
  died?: number | null;
  mother?: PersonId | null;
  father?: PersonId | null;
  legalFather?: PersonId | null;
  rank?: number;
}

/** Create and register a fully-populated Person with sensible defaults. */
export function addPerson(world: World, opts: TestPersonOpts): Person {
  const id = nextId(world, "person") as PersonId;
  const person: Person = {
    id,
    givenName: opts.givenName,
    surname: opts.surname ?? "",
    epithet: "",
    nickname: "",
    sex: opts.sex,
    culture: opts.culture,
    religion: 1,
    house: opts.house ?? null,
    born: opts.born ?? makeDate(70, 1),
    died: opts.died ?? null,
    deathCause: opts.died != null ? "test" : null,
    location: null,
    mother: opts.mother ?? null,
    father: opts.father ?? null,
    legalFather: opts.legalFather ?? null,
    children: [],
    marriages: [],
    betrothed: null,
    pregnancy: null,
    genome: new Int16Array(0),
    phenotype: dummyPhenotype(),
    personality: dummyPersonality(),
    status: {
      profession: "none",
      wealth: 1,
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
  world.people.set(id, person);
  if (person.died === null) world.alive.add(id);
  // Maintain children arrays for provided parents.
  const linkChild = (pid: PersonId | null | undefined) => {
    if (pid == null) return;
    const parent = world.people.get(pid);
    if (parent && !parent.children.includes(id)) parent.children.push(id);
  };
  linkChild(person.mother);
  linkChild(person.father);
  return person;
}
