/**
 * Pedigree kinship. closeKin covers relations up to the second degree:
 * parent/child, grandparent/grandchild, siblings and half-siblings,
 * uncles/aunts and nephews/nieces, and first cousins. Legal fathers count
 * as blood for these purposes; the world treats acknowledged lines as kin
 * whether or not the midwife would agree.
 */

import type { PersonId, World } from "../core/types";

/** Distinct parent ids (mother, father, legal father), unsorted is fine. */
export function parentIdsOf(world: World, id: PersonId): PersonId[] {
  const p = world.people.get(id);
  if (!p) return [];
  const out: PersonId[] = [];
  for (const pid of [p.mother, p.father, p.legalFather]) {
    if (pid != null && !out.includes(pid)) out.push(pid);
  }
  return out;
}

/** Distinct grandparent ids through every parental line. */
export function grandparentIdsOf(world: World, id: PersonId): PersonId[] {
  const out: PersonId[] = [];
  for (const pid of parentIdsOf(world, id)) {
    for (const gid of parentIdsOf(world, pid)) {
      if (!out.includes(gid)) out.push(gid);
    }
  }
  return out;
}

/** Kin check up to 2nd degree, used by marriage/inheritance/drama. */
export function closeKin(world: World, a: PersonId, b: PersonId): boolean {
  if (a === b) return true;
  const parentsA = parentIdsOf(world, a);
  const parentsB = parentIdsOf(world, b);

  // Parent and child.
  if (parentsA.includes(b) || parentsB.includes(a)) return true;

  // Siblings and half-siblings (any shared parent, legal lines included).
  if (parentsA.some((x) => parentsB.includes(x))) return true;

  const grandsA = grandparentIdsOf(world, a);
  const grandsB = grandparentIdsOf(world, b);

  // Grandparent and grandchild.
  if (grandsA.includes(b) || grandsB.includes(a)) return true;

  // Uncle/aunt and nephew/niece: one's parent is the other's sibling,
  // i.e. a parent of one shares a parent with the other.
  if (grandsA.some((g) => parentsB.includes(g))) return true;
  if (grandsB.some((g) => parentsA.includes(g))) return true;

  // First cousins: a shared grandparent.
  if (grandsA.some((g) => grandsB.includes(g))) return true;

  return false;
}

/** Living siblings (any shared parent), ascending id, excluding self. */
export function siblingIdsOf(world: World, id: PersonId): PersonId[] {
  const out = new Set<PersonId>();
  for (const pid of parentIdsOf(world, id)) {
    const parent = world.people.get(pid);
    if (!parent) continue;
    for (const cid of parent.children) {
      if (cid !== id) out.add(cid);
    }
  }
  return [...out].sort((a, b) => a - b);
}
