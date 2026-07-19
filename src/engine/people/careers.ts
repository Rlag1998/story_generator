/**
 * Careers: profession choice from aptitude, parentage, rank, sex customs
 * and the local economy; apprenticeships for craft-bound youths; the
 * taking-up of work at adulthood; retirement in old age.
 */

import type {
  Aptitude,
  Ctx,
  Culture,
  EventId,
  Person,
  ProfessionKey,
  Settlement,
  World,
} from "../core/types";
import type { Rng } from "../core/rng";
import { sortedIds } from "../core/world";
import { F, adulthoodAgeOf, ageOf, clamp, whereabouts } from "./helpers";

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

export const APTITUDE_PROFESSIONS: Record<Aptitude, ProfessionKey[]> = {
  war: ["soldier", "guard"],
  craft: ["smith", "carpenter", "mason", "weaver", "potter"],
  lore: ["scribe", "scholar", "healer"],
  music: ["bard"],
  oratory: ["priest", "judge", "courtier"],
  trade: ["merchant", "peddler", "innkeeper"],
  healing: ["healer", "midwife"],
  intrigue: ["thief", "smuggler"],
  husbandry: ["farmer", "herder", "falconer"],
  seafaring: ["sailor", "fisher"],
};

type WeightPair = [ProfessionKey, number];

const ECON_PROFESSIONS: Record<string, WeightPair[]> = {
  fishing: [["fisher", 3], ["sailor", 1]],
  shipwrights: [["carpenter", 2.5], ["sailor", 1.5]],
  salt: [["peddler", 1], ["merchant", 0.8]],
  grain: [["farmer", 3], ["baker", 0.8], ["brewer", 0.6]],
  horses: [["herder", 2.5]],
  wool: [["herder", 2], ["weaver", 1.6]],
  timber: [["carpenter", 2.2], ["hunter", 1]],
  furs: [["hunter", 2.4], ["peddler", 0.6]],
  charcoal: [["hunter", 0.8], ["smith", 0.8]],
  ore: [["miner", 3], ["smith", 1.4]],
  quarries: [["mason", 2.4], ["miner", 1.4]],
  vineyards: [["farmer", 2.2], ["brewer", 1.2]],
  gems: [["miner", 2.4], ["merchant", 0.8]],
  goats: [["herder", 2.4]],
  reeds: [["weaver", 1.4], ["fisher", 0.8]],
  eels: [["fisher", 2.6]],
  peat: [["farmer", 1.6]],
  herds: [["herder", 2.8]],
  hides: [["herder", 1.4], ["peddler", 0.8]],
  cattle: [["herder", 2.4]],
  barley: [["farmer", 2.4], ["brewer", 1.4]],
};

const VILLAGE_BASE: WeightPair[] = [
  ["farmer", 2.5],
  ["herder", 0.5],
  ["hunter", 0.4],
  ["weaver", 0.8],
  ["carpenter", 0.5],
  ["smith", 0.5],
  ["brewer", 0.4],
  ["baker", 0.4],
  ["potter", 0.3],
  ["healer", 0.25],
  ["midwife", 0.3],
  ["priest", 0.25],
  ["servant", 0.5],
  ["peddler", 0.3],
  ["guard", 0.2],
];

const TOWN_EXTRA: WeightPair[] = [
  ["merchant", 1.2],
  ["innkeeper", 0.6],
  ["scribe", 0.5],
  ["servant", 1.2],
  ["guard", 0.8],
  ["mason", 0.5],
  ["artist", 0.2],
  ["bard", 0.25],
  ["judge", 0.1],
  ["gravedigger", 0.12],
  ["thief", 0.15],
  ["gardener", 0.2],
];

const PORT_EXTRA: WeightPair[] = [
  ["sailor", 2.2],
  ["fisher", 1.2],
  ["merchant", 1.4],
  ["smuggler", 0.3],
];

const STRONGHOLD_EXTRA: WeightPair[] = [
  ["soldier", 2.2],
  ["guard", 1.4],
  ["servant", 1.4],
  ["falconer", 0.2],
];

const TEMPLE_EXTRA: WeightPair[] = [
  ["priest", 1.6],
  ["monastic", 1.2],
  ["scribe", 0.8],
  ["gardener", 0.4],
];

/** Professions closed or narrowed by custom in patriarchal cultures. */
const MALE_CODED = new Set<ProfessionKey>([
  "soldier",
  "guard",
  "miner",
  "smith",
  "mason",
  "sailor",
  "judge",
  "carpenter",
  "hunter",
]);

const FEMALE_FAVORED = new Set<ProfessionKey>([
  "weaver",
  "healer",
  "midwife",
  "servant",
  "brewer",
  "baker",
]);

/** Crafts learned at a master's bench, worth an apprenticed event. */
export const CRAFT_PROFESSIONS = new Set<ProfessionKey>([
  "smith",
  "carpenter",
  "mason",
  "weaver",
  "potter",
  "brewer",
  "baker",
  "scribe",
  "artist",
]);

// ---------------------------------------------------------------------------
// Choice
// ---------------------------------------------------------------------------

/**
 * Choose a fitting profession for a person coming into their working years.
 */
export function chooseProfession(
  rng: Rng,
  world: World,
  p: Person,
  settlement: Settlement | null,
  culture: Culture | null,
): ProfessionKey {
  const rank = p.status.rank;

  // The high-born do not plough.
  if (rank >= 4) {
    return rng.weightedPairs<ProfessionKey>([
      ["noble", 5],
      ["courtier", 2.5],
      ["falconer", 0.3],
    ]);
  }
  if (rank === 3) {
    return rng.weightedPairs<ProfessionKey>([
      ["courtier", 2],
      ["steward", 2],
      ["scholar", 1],
      ["merchant", 1.5],
      ["judge", 0.5],
      ["soldier", 1],
      ["falconer", 0.4],
    ]);
  }

  const weights = new Map<ProfessionKey, number>();
  const add = (key: ProfessionKey, w: number) => {
    weights.set(key, (weights.get(key) ?? 0) + w);
  };
  for (const [k, w] of VILLAGE_BASE) add(k, w);
  const kind = settlement?.kind ?? "village";
  if (kind === "town" || kind === "city") for (const [k, w] of TOWN_EXTRA) add(k, w);
  if (kind === "port") for (const [k, w] of PORT_EXTRA) add(k, w);
  if (kind === "stronghold") for (const [k, w] of STRONGHOLD_EXTRA) add(k, w);
  if (kind === "temple-town") for (const [k, w] of TEMPLE_EXTRA) add(k, w);
  for (const tag of settlement?.economy ?? []) {
    const pairs = ECON_PROFESSIONS[tag];
    if (pairs) for (const [k, w] of pairs) add(k, w);
  }

  // Blood tells: a parent's trade pulls hard, the same-sex parent hardest.
  const pull = (parentId: number | null, factor: number) => {
    if (parentId == null) return;
    const parent = world.people.get(parentId);
    if (!parent) return;
    const prof =
      parent.status.profession !== "none"
        ? parent.status.profession
        : (parent.flags[F.formerProfession] as ProfessionKey | undefined);
    if (prof && prof !== "none" && prof !== "ruler" && prof !== "noble") add(prof, factor);
  };
  const ackFather = p.legalFather ?? p.father;
  if (p.sex === "m") {
    pull(ackFather, 2.5);
    pull(p.mother, 0.8);
  } else {
    pull(p.mother, 2.5);
    pull(ackFather, 0.8);
  }

  // Gifts show early and are noticed.
  for (const apt of Object.keys(APTITUDE_PROFESSIONS) as Aptitude[]) {
    const v = p.phenotype.aptitudes[apt] ?? 0;
    if (v <= 0) continue;
    for (const key of APTITUDE_PROFESSIONS[apt]) {
      const base = weights.get(key);
      if (base !== undefined) weights.set(key, base * (1 + v * 0.9));
      else weights.set(key, 0.15 * (1 + v * 0.9));
    }
  }

  // Custom narrows the field.
  const patriarchy = culture?.attitudes.patriarchy ?? 0.5;
  const religion = world.religions.get(p.religion) ?? null;
  for (const key of [...weights.keys()]) {
    let w = weights.get(key)!;
    if (p.sex === "f") {
      if (key === "priest" || key === "monastic") {
        if (religion && religion.clergyGender === "m") w = 0;
      }
      if (MALE_CODED.has(key)) w *= 1 - patriarchy * 0.92;
      if (FEMALE_FAVORED.has(key)) w *= 1 + patriarchy * 0.8;
    } else {
      if (key === "midwife") w = 0;
      if (key === "priest" || key === "monastic") {
        if (religion && religion.clergyGender === "f") w = 0;
      }
      if (FEMALE_FAVORED.has(key) && key !== "brewer" && key !== "baker") w *= 1 - patriarchy * 0.6;
    }
    weights.set(key, w);
  }

  const keys = [...weights.keys()];
  const vals = keys.map((k) => weights.get(k)!);
  if (keys.length === 0) return "farmer";
  return rng.weighted(keys, vals);
}

/** The aptitude (if any) whose value is prodigy-grade for this profession. */
export function prodigyAptitude(p: Person, prof: ProfessionKey): Aptitude | null {
  for (const apt of Object.keys(APTITUDE_PROFESSIONS) as Aptitude[]) {
    const v = p.phenotype.aptitudes[apt] ?? 0;
    if (v >= 3 && APTITUDE_PROFESSIONS[apt].includes(prof)) return apt;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Monthly career step
// ---------------------------------------------------------------------------

export function careerTick(
  ctx: Ctx,
  p: Person,
  rng: Rng,
  settlement: Settlement | null,
  culture: Culture | null,
): void {
  const world = ctx.world;
  const age = ageOf(world, p);
  const adulthood = adulthoodAgeOf(world, p);

  // Retirement: old hands lay down their tools.
  if (
    p.status.profession !== "none" &&
    p.status.profession !== "ruler" &&
    p.status.profession !== "noble" &&
    age >= 68 &&
    rng.fork("retire").chance(0.012)
  ) {
    const former = p.status.profession;
    p.flags[F.retired] = true;
    p.flags[F.formerProfession] = former;
    p.status.profession = "none";
    ctx.record({
      type: "retired",
      date: world.now,
      participants: { subject: p.id },
      data: { profession: former },
      ...whereabouts(world, p),
      importance: 2,
      causes: [],
      storyline: null,
      secret: false,
    });
    return;
  }
  if (p.flags[F.retired] === true) return;
  if (p.status.profession !== "none") return;

  // Youths of common stock may be bound to a craft master.
  if (age >= 12 && age < adulthood && p.status.rank <= 2 && p.flags[F.apprenticeCraft] === undefined) {
    if (rng.fork("apprentice-roll").chance(0.055)) {
      const intended = chooseProfession(rng.fork("apprentice-choice"), world, p, settlement, culture);
      if (CRAFT_PROFESSIONS.has(intended)) {
        const master = findMaster(world, p, intended);
        const participants: Record<string, number> = { subject: p.id };
        if (master != null) participants.master = master;
        const ev = ctx.record({
          type: "apprenticed",
          date: world.now,
          participants,
          data: { craft: intended },
          ...whereabouts(world, p),
          importance: 3,
          causes: [],
          storyline: null,
          secret: false,
        });
        p.flags[F.apprenticeCraft] = intended;
        p.flags[F.apprenticeEvent] = ev.id;
      }
    }
    return;
  }

  // Adulthood: take up work.
  if (age >= adulthood) {
    const apprenticed = p.flags[F.apprenticeCraft];
    const prof: ProfessionKey =
      typeof apprenticed === "string"
        ? (apprenticed as ProfessionKey)
        : chooseProfession(rng.fork("choice"), world, p, settlement, culture);
    p.status.profession = prof;
    if (prof === "scribe" || prof === "scholar" || prof === "priest" || prof === "monastic" || prof === "judge" || prof === "steward") {
      p.status.literate = true;
    }
    const causes: EventId[] = [];
    const appEv = p.flags[F.apprenticeEvent];
    if (typeof appEv === "number") causes.push(appEv);
    const prodigy = prodigyAptitude(p, prof);
    ctx.record({
      type: "took-profession",
      date: world.now,
      participants: { subject: p.id },
      data: prodigy ? { profession: prof, prodigy: true, aptitude: prodigy } : { profession: prof },
      ...whereabouts(world, p),
      importance: prodigy ? 8 : 3,
      causes,
      storyline: null,
      secret: false,
    });
    delete p.flags[F.apprenticeCraft];
    delete p.flags[F.apprenticeEvent];
  }
}

/** Lowest-id living local practitioner of a craft, to stand as master. */
function findMaster(world: World, apprentice: Person, craft: ProfessionKey): number | null {
  if (apprentice.location == null) return null;
  for (const id of sortedIds(world.people)) {
    if (id === apprentice.id) continue;
    const q = world.people.get(id)!;
    if (q.died !== null) continue;
    if (q.location !== apprentice.location) continue;
    if (q.status.profession === craft) return id;
  }
  return null;
}
