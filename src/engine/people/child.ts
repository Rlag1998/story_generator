/**
 * Birth of a child: genome from parents, naming per culture, descent and
 * legitimacy (including hidden paternity), and the birth chronicle event.
 */

import type {
  EventId,
  EventRecord,
  Person,
  PersonId,
  Services,
  Sex,
  World,
} from "../core/types";
import type { Rng } from "../core/rng";
import { nextId, recordEvent } from "../core/world";
import { rareTraitDef } from "../core/appearance";
import { activeMarriages, clamp, livingPerson, regionOf } from "./helpers";

export interface ChildOpts {
  litterIndex?: number;
  litterMates?: PersonId[];
  /** Total litter size (1 single, 2 twins, 3 triplets). */
  litter?: number;
  /** Conceived outside marriage. */
  illicit?: boolean;
  /** Causal parent events for the birth record. */
  causes?: EventId[];
}

export interface ChildResult {
  person: Person;
  birthEvent: EventRecord;
}

/**
 * Deliver one baby. The pregnancy code calls this once per litter member;
 * worldgen calls it (via the service) for founding-family children.
 */
export function createChildInternal(
  rng: Rng,
  world: World,
  services: Services,
  mother: Person,
  father: Person | null,
  opts?: ChildOpts,
): ChildResult {
  const id = nextId(world, "person") as PersonId;
  const litter = opts?.litter ?? (opts?.litterMates ? opts.litterMates.length + 1 : 1);
  const litterIndex = opts?.litterIndex ?? 0;
  const illicit = opts?.illicit ?? false;

  const sex: Sex = rng.fork("sex").chance(0.5) ? "f" : "m";

  // Genome: an unknown father is modeled as a wandering stranger of the
  // mother's people (keeps meiosis honest without inventing a person).
  const fatherGenome =
    father?.genome ?? services.genetics.founderGenome(rng.fork("stranger"), mother.culture);
  const genome = services.genetics.reproduce(rng.fork("genome"), mother.genome, fatherGenome);
  const phenotype = services.genetics.express(genome, sex, rng.fork("express"));
  const personality = services.genetics.basePersonality(phenotype, rng.fork("personality"));

  // Legitimacy: the mother's husband is the acknowledged father when he is
  // not the man who sired the child.
  const husbandId = activeMarriages(mother)[0]?.spouse ?? null;
  const husband = husbandId != null ? (world.people.get(husbandId) ?? null) : null;
  const legalFatherId =
    husband && (father === null || husband.id !== father.id) ? husband.id : null;
  const acknowledged = legalFatherId != null ? husband : father;

  // Descent decides house, culture and faith.
  const culture = world.cultures.get(mother.culture);
  const descent = culture?.descent ?? "cognatic";
  let house = mother.house;
  let cultureId = mother.culture;
  let religionId = mother.religion;
  if (descent === "patrilineal") {
    if (acknowledged) {
      house = acknowledged.house;
      cultureId = acknowledged.culture;
      religionId = acknowledged.religion;
    }
  } else if (descent === "cognatic") {
    house = acknowledged?.house ?? mother.house;
  }

  // Naming.
  const givenName = services.culture.babyName(rng.fork("name"), world, mother, acknowledged, sex);
  const surname = services.culture.babySurname(world, mother, acknowledged, sex, givenName);

  const rank = Math.max(mother.status.rank, acknowledged?.status.rank ?? 0);
  const wealth = Math.round(
    (mother.status.wealth + (acknowledged?.status.wealth ?? mother.status.wealth)) / 2,
  );

  const person: Person = {
    id,
    givenName,
    surname,
    epithet: "",
    nickname: "",
    sex,
    culture: cultureId,
    religion: religionId,
    house,
    born: world.now,
    died: null,
    deathCause: null,
    location: mother.location,
    mother: mother.id,
    father: father?.id ?? null,
    legalFather: legalFatherId,
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
      rank,
      titles: [],
      literate: false,
    },
    illnesses: [],
    injuries: [],
    storylines: [],
    notability: 0,
    litterMates: [...(opts?.litterMates ?? [])],
    flags: {},
  };

  world.people.set(id, person);
  world.alive.add(id);
  world.stats.totalBorn += 1;

  mother.children.push(id);
  if (acknowledged && !acknowledged.children.includes(id)) acknowledged.children.push(id);
  // A hidden sire keeps no list; the pedigree (person.father) knows the truth.

  // The chronicle takes note.
  const visibleRares = phenotype.rareTraits.filter((k) => rareTraitDef(k)?.visible === true);
  let importance = 8;
  if (rank >= 3) importance += 2;
  if (rank >= 5) importance += 2;
  importance += Math.min(6, visibleRares.length * 3);
  importance = clamp(importance, 8, 16);

  // Scandal: a married woman's child by another man is a truth kept dark.
  const scandalous = illicit && legalFatherId != null;

  const participants: Record<string, PersonId> = { subject: id, mother: mother.id };
  if (scandalous && father) {
    participants.father = father.id;
    participants.legalFather = legalFatherId!;
  } else if (acknowledged) {
    participants.father = acknowledged.id;
  }

  const data: Record<string, unknown> = { litter, litterIndex };
  if (illicit) data.illicit = true;
  if (visibleRares.length > 0) data.rareTraits = visibleRares;

  const birthEvent = recordEvent(world, {
    type: "birth",
    date: world.now,
    participants,
    data,
    location: mother.location,
    region: regionOf(world, mother.location),
    importance,
    causes: opts?.causes ?? [],
    storyline: null,
    secret: scandalous,
  });

  return { person, birthEvent };
}

/** Cross-link a delivered litter's members after all are created. */
export function linkLitter(world: World, ids: PersonId[]): void {
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p) continue;
    p.litterMates = ids.filter((o) => o !== id);
  }
}

/** Convenience used by pregnancy code: is this person's spouse this father? */
export function fatherIsHusband(world: World, mother: Person, fatherId: PersonId): boolean {
  const husband = activeMarriages(mother)[0]?.spouse ?? null;
  return husband !== null && husband === fatherId;
}

export { livingPerson };
