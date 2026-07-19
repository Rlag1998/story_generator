/**
 * Founder-generation people: adults conjured whole at worldgen, with
 * culture-flavored genomes, names per naming convention, and a trade in
 * hand. Founders record no events; their lives before year one are the
 * world's unwritten past.
 */

import type {
  CultureId,
  HouseId,
  Person,
  PersonId,
  ProfessionKey,
  ReligionId,
  Services,
  SettlementId,
  Sex,
  World,
} from "../core/types";
import type { Rng } from "../core/rng";
import { nextId } from "../core/world";
import { F, clamp } from "./helpers";
import { chooseProfession } from "./careers";

export interface FounderOpts {
  culture: CultureId;
  religion: ReligionId;
  location: SettlementId;
  house: HouseId | null;
  sex?: Sex;
  ageYears?: number;
  rank?: number;
}

export function createFounder(
  rng: Rng,
  world: World,
  services: Services,
  opts: FounderOpts,
): Person {
  const id = nextId(world, "person") as PersonId;
  const sex: Sex = opts.sex ?? (rng.fork("sex").chance(0.5) ? "f" : "m");
  const ageYears = opts.ageYears ?? rng.fork("age").intIn(16, 50);
  const extraMonths = rng.fork("birth-month").int(12);
  const born = world.now - ageYears * 12 - extraMonths;

  const genome = services.genetics.founderGenome(rng.fork("genome"), opts.culture);
  const phenotype = services.genetics.express(genome, sex, rng.fork("express"));
  const personality = services.genetics.basePersonality(phenotype, rng.fork("personality"));

  // Naming honors the culture's convention.
  const culture = world.cultures.get(opts.culture) ?? null;
  const lang = culture ? (world.languages.get(culture.language) ?? null) : null;
  let givenName = `Founder ${id}`;
  let surname = "";
  if (lang) {
    givenName = services.language.givenName(rng.fork("given"), lang, sex);
    const order = culture?.nameOrder ?? "given-only";
    if (order === "given-family" || order === "family-given") {
      surname = services.language.familyName(rng.fork("family"), lang);
    } else if (order === "given-patronymic") {
      // A father who exists only as a name, lost to the years before year one.
      const fatherGiven = services.language.givenName(rng.fork("father-name"), lang, "m");
      surname = services.language.patronymic(lang, fatherGiven, sex);
    }
  }

  const rank =
    opts.rank ??
    rng.fork("rank").weightedPairs<number>([
      [1, 0.8],
      [2, 0.18],
      [0, 0.02],
    ]);
  const wealthRng = rng.fork("wealth");
  const wealth =
    rank <= 0
      ? 0
      : rank === 1
        ? wealthRng.intIn(1, 2)
        : rank === 2
          ? wealthRng.intIn(2, 3)
          : rank >= 4
            ? wealthRng.intIn(3, 5)
            : 3;

  const person: Person = {
    id,
    givenName,
    surname,
    epithet: "",
    nickname: "",
    sex,
    culture: opts.culture,
    religion: opts.religion,
    house: opts.house,
    born,
    died: null,
    deathCause: null,
    location: opts.location,
    mother: null,
    father: null,
    legalFather: null,
    children: [],
    marriages: [],
    betrothed: null,
    pregnancy: null,
    genome,
    phenotype,
    personality,
    status: {
      profession: "none",
      wealth: clamp(wealth, 0, 5),
      rank: clamp(rank, 0, 5),
      titles: [],
      literate: false,
    },
    illnesses: [],
    injuries: [],
    storylines: [],
    notability: 0,
    litterMates: [],
    flags: { [F.founder]: true },
  };

  // Working adults arrive with a trade already in hand.
  const adulthood = culture?.adulthoodAge ?? 16;
  if (ageYears >= adulthood && ageYears < 70) {
    const settlement = world.settlements.get(opts.location) ?? null;
    const prof: ProfessionKey = chooseProfession(
      rng.fork("profession"),
      world,
      person,
      settlement,
      culture,
    );
    person.status.profession = prof;
  }
  person.status.literate =
    rank >= 3 ||
    ["scribe", "scholar", "priest", "monastic", "judge", "steward"].includes(
      person.status.profession,
    ) ||
    rng.fork("letters").chance(culture?.values.includes("learning") ? 0.15 : 0.05);

  world.people.set(id, person);
  world.alive.add(id);
  world.stats.totalBorn += 1;
  // No events: founders walk out of the unrecorded past.
  return person;
}
