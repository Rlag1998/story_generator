/**
 * The relationship store and opinion arithmetic.
 *
 * Each direction is stored separately (a's view of b and b's view of a),
 * so opinion can be asymmetric. When no relation is stored, getOpinion
 * falls back to a baseline of blood, marriage, house feud, and tribe;
 * once a relation exists, personal history dominates and kinship colors
 * it at half weight. Strong negative memories hold a grudge ceiling that
 * warmth cannot rise above.
 */

import type {
  PersonId,
  RelKind,
  Relationship,
  World,
} from "../core/types";
import { sortedIds } from "../core/world";
import { clamp } from "./helpers";
import { parentIdsOf, grandparentIdsOf } from "./kinship";

export function getRelation(world: World, a: PersonId, b: PersonId): Relationship | null {
  return world.relationships.get(a)?.get(b) ?? null;
}

export function setRelation(world: World, a: PersonId, b: PersonId, rel: Relationship): void {
  let inner = world.relationships.get(a);
  if (!inner) {
    inner = new Map();
    world.relationships.set(a, inner);
  }
  inner.set(b, rel);
}

export function removeRelation(world: World, a: PersonId, b: PersonId): void {
  const inner = world.relationships.get(a);
  if (!inner) return;
  inner.delete(b);
  if (inner.size === 0) world.relationships.delete(a);
}

/**
 * Shift a's opinion of b. Creates a stored relation when none exists
 * (warm deltas seed a plain bond, cold ones a grievance), so that hatred
 * for a killer or gratitude for a rescue persists even between strangers.
 */
export function adjustOpinion(world: World, a: PersonId, b: PersonId, delta: number): void {
  if (a === b || delta === 0) return;
  if (!world.people.has(a) || !world.people.has(b)) return;
  const existing = getRelation(world, a, b);
  if (existing) {
    existing.opinion = clamp(Math.round(existing.opinion + delta), -100, 100);
    if (existing.kind === "rival" && existing.opinion <= -75) existing.kind = "nemesis";
  } else {
    setRelation(world, a, b, {
      kind: delta >= 0 ? "friend" : "rival",
      since: world.now,
      opinion: clamp(Math.round(delta), -100, 100),
    });
  }
}

/** Count of a's outgoing relations of a given kind. */
export function countKind(world: World, a: PersonId, kind: RelKind): number {
  const inner = world.relationships.get(a);
  if (!inner) return 0;
  let n = 0;
  for (const rel of inner.values()) {
    if (rel.kind === kind) n += 1;
  }
  return n;
}

/** Ids a has stored relations toward, ascending. */
export function relationIdsOf(world: World, a: PersonId): PersonId[] {
  const inner = world.relationships.get(a);
  if (!inner) return [];
  return sortedIds(inner);
}

/** Does a have any outgoing relation of the given kind? */
export function hasKind(world: World, a: PersonId, kind: RelKind): boolean {
  const inner = world.relationships.get(a);
  if (!inner) return false;
  for (const rel of inner.values()) {
    if (rel.kind === kind) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Opinion baselines
// ---------------------------------------------------------------------------

/**
 * Warmth owed to blood and marriage when nothing personal is stored:
 * parent/child +40, spouse +35, sibling +30 (a hair more for litter-mates),
 * grandparent +22, uncle/aunt +16, first cousin +12.
 */
export function kinBonus(world: World, a: PersonId, b: PersonId): number {
  const pa = world.people.get(a);
  const pb = world.people.get(b);
  if (!pa || !pb) return 0;
  const parentsA = parentIdsOf(world, a);
  const parentsB = parentIdsOf(world, b);
  if (parentsA.includes(b) || parentsB.includes(a)) return 40;
  if (pa.marriages.some((m) => m.active && m.spouse === b)) return 35;
  if (parentsA.some((x) => parentsB.includes(x))) {
    return pa.litterMates.includes(b) ? 34 : 30;
  }
  const grandsA = grandparentIdsOf(world, a);
  const grandsB = grandparentIdsOf(world, b);
  if (grandsA.includes(b) || grandsB.includes(a)) return 22;
  if (grandsA.some((g) => parentsB.includes(g)) || grandsB.some((g) => parentsA.includes(g))) {
    return 16;
  }
  if (grandsA.some((g) => grandsB.includes(g))) return 12;
  return 0;
}

/**
 * House standing: a feud between houses weighs on every member pair
 * (up to -58 at full intensity); shared house membership warms slightly.
 */
export function feudPenalty(world: World, a: PersonId, b: PersonId): number {
  const pa = world.people.get(a);
  const pb = world.people.get(b);
  if (!pa || !pb) return 0;
  if (pa.house == null || pb.house == null) return 0;
  if (pa.house === pb.house) return 8;
  const intensity = Math.max(
    world.houses.get(pa.house)?.feuds.get(pb.house) ?? 0,
    world.houses.get(pb.house)?.feuds.get(pa.house) ?? 0,
  );
  return -Math.round(58 * intensity);
}

/**
 * Strong negative memories hold a grudge: a ceiling opinion cannot rise
 * above while the wound stays heavy. Null when no such memory exists.
 */
export function grudgeCeiling(world: World, a: PersonId, b: PersonId): number | null {
  const mems = world.memories.get(a);
  if (!mems) return null;
  let ceiling: number | null = null;
  for (const m of mems) {
    if (m.about !== b) continue;
    if (m.feeling > -0.6 || m.weight < 1.5) continue;
    const c = -12 - Math.round(m.weight * 4);
    if (ceiling === null || c < ceiling) ceiling = c;
  }
  return ceiling;
}

/**
 * a's current opinion of b, -100..100. Stored history dominates when
 * present; kinship still colors it at half weight. Without history the
 * baseline is kin + feud + small same-culture/same-faith affinities.
 */
export function getOpinion(world: World, a: PersonId, b: PersonId): number {
  if (a === b) return 100;
  const rel = getRelation(world, a, b);
  const kin = kinBonus(world, a, b);
  const feud = feudPenalty(world, a, b);
  let total: number;
  if (rel) {
    total = rel.opinion + Math.round(kin / 2) + feud;
  } else {
    const pa = world.people.get(a);
    const pb = world.people.get(b);
    let affinity = 0;
    if (pa && pb) {
      if (pa.culture === pb.culture) affinity += 5;
      if (pa.religion === pb.religion) affinity += 5;
    }
    total = kin + feud + affinity;
  }
  const ceiling = grudgeCeiling(world, a, b);
  if (ceiling !== null && total > ceiling) total = ceiling;
  return clamp(Math.round(total), -100, 100);
}
