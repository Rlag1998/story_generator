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

/**
 * Recursion depth cap. Each expansion step halves the possible contribution,
 * so ancestors beyond this horizon contribute < 2^-12 ≈ 0.0002 — far below
 * any gate the simulation applies (cousin marriages sit at 0.0625). Without
 * the cap, centuries-old interlocked pedigrees make the exact recursion
 * explore hundreds of thousands of ancestor pairs per query (~20ms each),
 * which was the dominant cost of the marriage market in late-history worlds.
 */
const MAX_DEPTH = 12;

export function inbreeding(world: World, motherId: PersonId, fatherId: PersonId): number {
  if (motherId === fatherId) return 0.5;
  const memo = new Map<number, number>();
  // Numeric pair key: ids stay far below 2^26 in practice (bounded population
  // over bounded centuries), so a*2^26+b is collision-free within a run.
  const PAIR = 1 << 26;

  const parents = (id: PersonId): [PersonId | null, PersonId | null] => {
    const p = world.people.get(id);
    return p ? [p.mother, p.father] : [null, null];
  };

  const kin = (a: PersonId | null, b: PersonId | null, depth: number): number => {
    if (a == null || b == null) return 0;
    if (depth > MAX_DEPTH) return 0;
    const key = (a < b ? a * PAIR + b : b * PAIR + a);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let val: number;
    if (a === b) {
      // Self-coancestry carries the individual's own inbreeding.
      const [ma, pa] = parents(a);
      val = 0.5 * (1 + kin(ma, pa, depth + 1));
    } else {
      // Expand the younger individual (larger id) toward its parents.
      const younger = a < b ? b : a;
      const other = a < b ? a : b;
      const [m, f] = parents(younger);
      val = 0.5 * (kin(m, other, depth + 1) + kin(f, other, depth + 1));
    }
    memo.set(key, val);
    return val;
  };

  return Math.min(kin(motherId, fatherId, 0), 0.5);
}
