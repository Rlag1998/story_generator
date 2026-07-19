/**
 * The yearly settling of the social fabric: bonds warm with company and
 * fade with distance, grudges hold their floor, stale acquaintance is
 * pruned, and relations to the long-dead are laid down (the memories
 * remain; the chronicle forgets nothing).
 */

import type { Ctx, Person, PersonId, Relationship } from "../core/types";
import { livingIds } from "../core/world";
import { F, clamp } from "./helpers";
import { grudgeCeiling, removeRelation } from "./relations";

/** Months after a death before relations to the dead are laid down. */
const MOURNING_HOLD = 24;
/** Months a relation must age before triviality prunes it. */
const PRUNE_AGE = 48;

export function decayRelations(ctx: Ctx): void {
  const world = ctx.world;
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (!p) continue;
    const inner = world.relationships.get(id);
    if (!inner) continue;
    const others = [...inner.keys()].sort((a, b) => a - b);
    for (const otherId of others) {
      const rel = inner.get(otherId);
      if (!rel) continue;
      const other = world.people.get(otherId);

      // Relations to the dead are laid down after a mourning season.
      if (!other || (other.died !== null && world.now - other.died >= MOURNING_HOLD)) {
        removeRelation(world, id, otherId);
        cleanupPairFlags(p, otherId);
        continue;
      }
      if (other.died !== null) continue; // freshly dead: hold as-is

      rel.opinion = drift(p, other, rel);
      const ceiling = grudgeCeiling(world, id, otherId);
      if (ceiling !== null && rel.opinion > ceiling) rel.opinion = ceiling;

      // Trivial old acquaintance fades from the ledger entirely.
      if (
        Math.abs(rel.opinion) <= 5 &&
        rel.kind !== "sworn" &&
        world.now - rel.since >= PRUNE_AGE
      ) {
        removeRelation(world, id, otherId);
        cleanupPairFlags(p, otherId);
      }
    }
  }
}

/**
 * One year's drift for a relation. Company deepens bonds toward their
 * natural resting warmth; distance thins them toward indifference.
 * Rivalry aggravates with proximity; a nemesis never truly cools.
 */
function drift(p: Person, other: Person, rel: Relationship): number {
  const together = other.location != null && other.location === p.location;
  const o = rel.opinion;
  let next: number;
  switch (rel.kind) {
    case "sworn":
      next = together ? o + Math.round((65 - o) * 0.2) : Math.round(o * 0.985);
      break;
    case "lover":
      next = together ? o + Math.round((55 - o) * 0.25) : Math.round(o * 0.96);
      break;
    case "friend":
      next = together ? o + Math.round((48 - o) * 0.25) : Math.round(o * 0.93);
      break;
    case "mentor":
    case "ward":
      next = Math.round(o * 0.97);
      break;
    case "rival":
      next = together ? o + Math.round((-35 - o) * 0.15) : Math.round(o * 0.9);
      break;
    case "nemesis":
      next = together ? o + Math.round((-70 - o) * 0.1) : Math.round(o * 0.97);
      break;
  }
  return clamp(next, -100, 100);
}

/** Remove pair-scoped bookkeeping flags for a relation being laid down. */
export function cleanupPairFlags(p: Person, otherId: PersonId): void {
  delete p.flags[F.friendEvPrefix + otherId];
  delete p.flags[F.rivalEvPrefix + otherId];
  delete p.flags[F.romanceEvPrefix + otherId];
  delete p.flags[F.affairEvPrefix + otherId];
  if (p.id < otherId) {
    delete p.flags[F.escStagePrefix + otherId];
    delete p.flags[F.escEvPrefix + otherId];
  }
  if (p.flags[F.pining] === otherId) delete p.flags[F.pining];
}
