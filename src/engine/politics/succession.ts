/**
 * Succession: the kinship walker and the six laws of inheritance.
 *
 * The dynastic laws (male/absolute/female primogeniture) walk the pedigree
 * itself, with full representation: a dead eldest son's sons stand before a
 * living second son. The walk starts at the incumbent, descends through
 * eligible children in birth order, then climbs the ancestor chain so that
 * siblings, nephews, uncles and cousins follow in their proper places.
 *
 * Founder generations arrive without recorded parents, so every dynastic
 * walk is backstopped by a house tier: living blood members of the ruling
 * house (those who married in carry no claim). An heir drawn from the house
 * tier holds a weaker claim, and weak claims breed crises.
 */

import { fnv1a } from "../core/rng";
import type {
  Person,
  PersonId,
  Polity,
  SuccessionLaw,
  World,
} from "../core/types";
import {
  PF,
  ageOf,
  childrenByAge,
  isAdult,
  isLiving,
  livingHouseMembers,
  livingPerson,
} from "./helpers";

// ---------------------------------------------------------------------------
// The dynastic walker
// ---------------------------------------------------------------------------

type DynasticLaw = "male-primogeniture" | "absolute-primogeniture" | "female-primogeniture";

function lineSex(law: DynasticLaw): "f" | "m" | null {
  if (law === "male-primogeniture") return "m";
  if (law === "female-primogeniture") return "f";
  return null;
}

/**
 * Pre-order walk of a person's eligible descendants. For the sexed laws the
 * line runs strictly through that sex (agnatic or enatic); for absolute
 * primogeniture every child transmits. Dead links are traversed but not
 * listed, which is exactly primogeniture-with-representation.
 */
function walkDescendants(
  world: World,
  from: Person,
  law: DynasticLaw,
  visited: Set<PersonId>,
  out: PersonId[],
): void {
  const sex = lineSex(law);
  for (const child of childrenByAge(world, from)) {
    if (visited.has(child.id)) continue;
    visited.add(child.id);
    if (sex !== null && child.sex !== sex) continue; // excluded, and transmits nothing
    if (isLiving(world, child.id)) out.push(child.id);
    walkDescendants(world, child, law, visited, out);
  }
}

/** The incumbent's ancestor chain, nearest first, per the law's line. */
function ancestorAnchors(world: World, anchor: Person, law: DynasticLaw): Person[] {
  const anchors: Person[] = [anchor];
  if (law === "absolute-primogeniture") {
    // Breadth-first through both parents, two generations deep.
    let frontier: Person[] = [anchor];
    for (let depth = 0; depth < 2; depth++) {
      const next: Person[] = [];
      for (const node of frontier) {
        for (const pid of [node.father, node.mother]) {
          if (pid == null) continue;
          const parent = world.people.get(pid);
          if (parent && !anchors.some((a) => a.id === parent.id)) {
            anchors.push(parent);
            next.push(parent);
          }
        }
      }
      frontier = next;
    }
    return anchors;
  }
  // Sexed lines climb through one parent only: father for agnatic, mother
  // for enatic succession.
  let node: Person = anchor;
  for (let depth = 0; depth < 3; depth++) {
    const pid = law === "male-primogeniture" ? node.father : node.mother;
    if (pid == null) break;
    const parent = world.people.get(pid);
    if (!parent) break;
    anchors.push(parent);
    node = parent;
  }
  return anchors;
}

/**
 * The full dynastic order from an incumbent: descendants first, then the
 * incumbent's siblings and their lines, then uncles and cousins, and so on
 * up the chain. The incumbent and their ancestors are never listed (they
 * are predecessors, not heirs).
 */
export function dynasticLine(
  world: World,
  anchor: Person,
  law: DynasticLaw,
  limit: number,
): PersonId[] {
  const out: PersonId[] = [];
  const visited = new Set<PersonId>();
  const anchors = ancestorAnchors(world, anchor, law);
  for (const a of anchors) visited.add(a.id);
  for (const a of anchors) {
    walkDescendants(world, a, law, visited, out);
    if (out.length >= limit * 2) break; // plenty; keep the walk bounded
  }
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// House tier (backstop for shallow pedigrees) and the other laws
// ---------------------------------------------------------------------------

/** Blood members of the ruling house, ordered for the given law. */
function houseTier(world: World, polity: Polity, law: SuccessionLaw): Person[] {
  if (polity.rulingHouse == null) return [];
  const members = livingHouseMembers(world, polity.rulingHouse).filter(
    (p) => p.flags[PF.marriedIn] !== true && p.id !== polity.ruler,
  );
  const sex = law === "male-primogeniture" ? "m" : law === "female-primogeniture" ? "f" : null;
  const eligible = sex === null ? members : members.filter((p) => p.sex === sex);
  // Adults before children, elder before younger, id as the final tiebreak.
  eligible.sort((a, b) => {
    const adultA = isAdult(world, a) ? 0 : 1;
    const adultB = isAdult(world, b) ? 0 : 1;
    return adultA - adultB || a.born - b.born || a.id - b.id;
  });
  return eligible;
}

/** Deterministic election score: standing, silver tongue, and hunger. */
function electiveScore(world: World, p: Person): number {
  let score = p.status.rank * 12 + Math.min(30, p.notability / 8);
  score += (p.phenotype.aptitudes["oratory"] ?? 0) * 6;
  score += (p.phenotype.aptitudes["lore"] ?? 0) * 3;
  score += p.personality.ambition * 10;
  if (p.house != null) {
    const house = world.houses.get(p.house);
    if (house) score += Math.min(20, house.prestige / 3);
    if (house?.head === p.id) score += 10;
  }
  if (!isAdult(world, p)) score -= 40;
  return score;
}

/** Candidates a council would even consider: court, house heads, ruling kin. */
function electiveCandidates(world: World, polity: Polity): Person[] {
  const seen = new Set<PersonId>();
  const out: Person[] = [];
  const consider = (id: PersonId | null | undefined) => {
    if (id == null || seen.has(id)) return;
    seen.add(id);
    const p = livingPerson(world, id);
    if (p && p.id !== polity.ruler && isAdult(world, p)) out.push(p);
  };
  for (const role of [...polity.court.keys()].sort()) consider(polity.court.get(role));
  // House heads seated in the polity.
  for (const hid of [...world.houses.keys()].sort((a, b) => a - b)) {
    const h = world.houses.get(hid)!;
    if (h.seat == null) continue;
    const s = world.settlements.get(h.seat);
    if (s && s.polity === polity.id) consider(h.head);
  }
  if (polity.rulingHouse != null) {
    for (const p of livingHouseMembers(world, polity.rulingHouse)) {
      if (p.flags[PF.marriedIn] !== true) consider(p.id);
    }
  }
  return out;
}

/** Kin the lot may fall upon: the dynastic order plus adult house blood. */
function divineLotPool(world: World, polity: Polity, anchor: Person | null): Person[] {
  const seen = new Set<PersonId>();
  const out: Person[] = [];
  const add = (p: Person | null) => {
    if (p && !seen.has(p.id) && p.id !== polity.ruler) {
      seen.add(p.id);
      out.push(p);
    }
  };
  if (anchor) {
    for (const id of dynasticLine(world, anchor, "absolute-primogeniture", 12)) {
      add(livingPerson(world, id));
    }
  }
  for (const p of houseTier(world, polity, "divine-lot")) if (isAdult(world, p)) add(p);
  return out;
}

/** Stable pseudo-order for the lot, "as the omens currently read". */
function omenKey(world: World, polity: Polity, id: PersonId): number {
  const reign = polity.reigns.length > 0 ? polity.reigns[polity.reigns.length - 1].from : 0;
  return fnv1a(`${world.params.seed}|lot|${polity.id}|${reign}|${id}`);
}

// ---------------------------------------------------------------------------
// The public line, and heir choice
// ---------------------------------------------------------------------------

/** The person the walk anchors on: the sitting ruler, or the last to reign. */
export function successionAnchor(world: World, polity: Polity): Person | null {
  if (polity.ruler != null) {
    const p = world.people.get(polity.ruler);
    if (p) return p;
  }
  for (let i = polity.reigns.length - 1; i >= 0; i--) {
    const p = world.people.get(polity.reigns[i].ruler);
    if (p) return p;
  }
  if (polity.rulingHouse != null) {
    const house = world.houses.get(polity.rulingHouse);
    const head = house ? world.people.get(house.head ?? house.founder) : null;
    if (head) return head;
  }
  return null;
}

/**
 * Ordered succession candidates for the UI and for heir resolution.
 * Pure and deterministic: no rng, no services.
 */
export function successionLine(world: World, polity: Polity, limit = 10): PersonId[] {
  const law = polity.succession;
  const anchor = successionAnchor(world, polity);

  if (law === "seniority") {
    return houseTier(world, polity, law)
      .filter((p) => isAdult(world, p))
      .sort((a, b) => a.born - b.born || a.id - b.id)
      .slice(0, limit)
      .map((p) => p.id);
  }

  if (law === "elective-council") {
    return electiveCandidates(world, polity)
      .map((p) => ({ p, score: electiveScore(world, p) }))
      .sort((x, y) => y.score - x.score || x.p.id - y.p.id)
      .slice(0, limit)
      .map((x) => x.p.id);
  }

  if (law === "divine-lot") {
    return divineLotPool(world, polity, anchor)
      .sort((a, b) => omenKey(world, polity, a.id) - omenKey(world, polity, b.id) || a.id - b.id)
      .slice(0, limit)
      .map((p) => p.id);
  }

  // Dynastic laws: blood first, house backstop after.
  const out: PersonId[] = [];
  const seen = new Set<PersonId>();
  if (anchor) {
    for (const id of dynasticLine(world, anchor, law, limit)) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  if (out.length < limit) {
    for (const p of houseTier(world, polity, law)) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push(p.id);
      }
      if (out.length >= limit) break;
    }
  }
  return out.slice(0, limit);
}

export interface HeirChoice {
  heir: Person | null;
  /** "blood": pedigree walk; "house": backstop tier; "law": council/lot/etc. */
  tier: "blood" | "house" | "law";
  /** Rival candidates worth flagging if the claim is contested. */
  rivals: PersonId[];
}

/**
 * Resolve the heir under the polity's law. Deterministic except divine-lot,
 * whose caller passes a pick function (fed by ctx rng at death time).
 */
export function chooseHeir(
  world: World,
  polity: Polity,
  pickLot: ((pool: Person[]) => Person) | null,
): HeirChoice {
  const law = polity.succession;
  const anchor = successionAnchor(world, polity);

  if (law === "seniority" || law === "elective-council") {
    const line = successionLine(world, polity, 6);
    const heir = line.length > 0 ? (world.people.get(line[0]) ?? null) : null;
    return { heir, tier: "law", rivals: line.slice(1, 4) };
  }

  if (law === "divine-lot") {
    const pool = divineLotPool(world, polity, anchor);
    if (pool.length === 0) return { heir: null, tier: "law", rivals: [] };
    const heir = pickLot ? pickLot(pool) : pool[0];
    return {
      heir,
      tier: "law",
      rivals: pool
        .filter((p) => p.id !== heir.id)
        .slice(0, 3)
        .map((p) => p.id),
    };
  }

  // Dynastic laws.
  if (anchor) {
    const blood = dynasticLine(world, anchor, law, 6);
    if (blood.length > 0) {
      const heir = world.people.get(blood[0]) ?? null;
      return { heir, tier: "blood", rivals: blood.slice(1, 4) };
    }
  }
  const backstop = houseTier(world, polity, law);
  if (backstop.length > 0) {
    return {
      heir: backstop[0],
      tier: "house",
      rivals: backstop.slice(1, 4).map((p) => p.id),
    };
  }
  return { heir: null, tier: "house", rivals: [] };
}

/**
 * Claimant candidates when a succession collapses into crisis: the nearest
 * kin under a loosened law, then ambitious house blood, then rival heads.
 */
export function crisisClaimants(world: World, polity: Polity): PersonId[] {
  const seen = new Set<PersonId>();
  const out: PersonId[] = [];
  const add = (id: PersonId | null | undefined) => {
    if (id == null || seen.has(id) || id === polity.ruler) return;
    const p = livingPerson(world, id);
    if (!p) return;
    seen.add(id);
    out.push(id);
  };
  const anchor = successionAnchor(world, polity);
  if (anchor) {
    for (const id of dynasticLine(world, anchor, "absolute-primogeniture", 6)) add(id);
  }
  for (const p of houseTier(world, polity, "absolute-primogeniture")) {
    if (isAdult(world, p) && p.personality.ambition >= 0.35) add(p.id);
  }
  for (const p of electiveCandidates(world, polity)) add(p.id);
  return out.slice(0, 3);
}

/** Age a regent will no longer be needed (display helper for narrative). */
export function minorityEndsAt(world: World, heir: Person): number {
  const adulthood = world.cultures.get(heir.culture)?.adulthoodAge ?? 16;
  return Math.max(0, adulthood - ageOf(world, heir));
}
