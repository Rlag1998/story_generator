/**
 * Pedigree inbreeding coefficient (Wright's F).
 *
 * The inbreeding coefficient of a hypothetical child equals the kinship
 * (coancestry) coefficient of its two parents, computed by the standard
 * recursion. Recursing on the younger individual's parents (parents always
 * carry smaller ids than their children in this world, so ids fall as we walk
 * up) makes the pedigree a DAG that terminates at founders, and memoization
 * keeps a query cheap. This yields the familiar values automatically and
 * without the double-counting that plagues naive common-ancestor walks:
 * parent-child and full-sibling unions 0.25, half-sib 0.125, first cousins
 * 0.0625, and it correctly compounds when lines fold back on themselves.
 *
 * Rising homozygosity from such unions is exactly what lets rare recessive
 * traits surface and cluster in intermarried bloodlines.
 */

import type { PersonId, World } from "../core/types";

export function inbreeding(world: World, motherId: PersonId, fatherId: PersonId): number {
  if (motherId === fatherId) return 0.5;
  const memo = new Map<string, number>();

  const parents = (id: PersonId): [PersonId | null, PersonId | null] => {
    const p = world.people.get(id);
    return p ? [p.mother, p.father] : [null, null];
  };

  const kin = (a: PersonId | null, b: PersonId | null): number => {
    if (a == null || b == null) return 0;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let val: number;
    if (a === b) {
      // Self-coancestry carries the individual's own inbreeding.
      const [ma, pa] = parents(a);
      val = 0.5 * (1 + kin(ma, pa));
    } else {
      // Expand the younger individual (larger id) toward its parents.
      const younger = a < b ? b : a;
      const other = a < b ? a : b;
      const [m, f] = parents(younger);
      val = 0.5 * (kin(m, other) + kin(f, other));
    }
    memo.set(key, val);
    return val;
  };

  return Math.min(kin(motherId, fatherId), 0.5);
}
