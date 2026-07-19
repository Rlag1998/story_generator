/**
 * The monthly social tick. Bounded work:
 *  - one pass over active affairs (few) for discovery hazards,
 *  - a deterministic rng-sample of living adults (~1/6 of the population)
 *    each considering at most ONE social move this month,
 *  - a yearly settling pass (memory fade, relation drift, feud cooling)
 *    at year's end.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, PersonId } from "../core/types";
import { livingIds } from "../core/world";
import { monthOf } from "../core/time";
import {
  F,
  SettlementIndex,
  adulthoodAgeOf,
  buildSettlementIndex,
  isMarried,
} from "./helpers";
import { countKind } from "./relations";
import { decayMemories } from "./memory";
import { decayRelations } from "./decay";
import { decayFeuds } from "./feuds";
import {
  doMend,
  mendCandidate,
  oathCandidate,
  swearOath,
  tryFriendship,
} from "./friendship";
import { escalate, pickEscalationTarget, tryRivalry } from "./rivalry";
import { affairWatch, hasAffair, hasLover, tryAffair, tryPining, tryRomance } from "./romance";

/** Fraction of living adults who weigh a social move each month. */
export const SAMPLE_RATE = 1 / 6;

export function socialTick(ctx: Ctx): void {
  const world = ctx.world;
  const ids = livingIds(world);

  // Affairs run their monthly discovery hazard, sampled or not.
  affairWatch(ctx, ids);

  // The month's sampled adults each consider one move.
  const sampled = monthSample(ctx, ids);
  const index = buildSettlementIndex(world, ids);
  for (const id of sampled) {
    const p = world.people.get(id);
    if (!p || p.died !== null) continue; // a duel earlier this month, perhaps
    considerMove(ctx, p, index);
  }

  // Year's end: the fabric settles.
  if (monthOf(world.now) === 12) {
    decayMemories(world);
    decayRelations(ctx);
    decayFeuds(ctx);
  }
}

/**
 * Deterministic rng-sample of living adults for this month, ascending id.
 * Exported for tests (bounded-work assertions).
 */
export function monthSample(ctx: Ctx, ids: PersonId[]): PersonId[] {
  const world = ctx.world;
  const out: PersonId[] = [];
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p || p.location == null) continue;
    if (p.flags[F.emigrated] === true) continue;
    if (ctx.services.people.age(world, p) < adulthoodAgeOf(world, p)) continue;
    if (ctx.rng.fork("social", "sample", id).chance(SAMPLE_RATE)) out.push(id);
  }
  return out;
}

/**
 * Weigh the moves open to this person and take at most one. "Idle"
 * carries most of the weight: most months, most people simply live.
 */
function considerMove(ctx: Ctx, p: Person, index: SettlementIndex): void {
  const world = ctx.world;
  const per = p.personality;
  const age = ctx.services.people.age(world, p);
  const married = isMarried(p);

  const moves: [string, number][] = [["idle", 4.5]];
  const acts = new Map<string, (rng: Rng) => void>();
  const add = (key: string, weight: number, act: (rng: Rng) => void): void => {
    moves.push([key, weight]);
    acts.set(key, act);
  };

  const escTarget = pickEscalationTarget(ctx, p);
  if (escTarget) {
    add("escalate", 2.2 + Math.max(0, per.wrath) * 0.8, (rng) =>
      escalate(ctx, p, escTarget, rng),
    );
  }
  if (typeof p.flags[F.pining] === "number") {
    add("pine", 1.6, (rng) => tryPining(ctx, p, rng));
  }
  if (
    married &&
    age <= 58 &&
    per.lust >= 0.55 &&
    per.honor <= 0.35 &&
    !hasAffair(p)
  ) {
    add("affair", 0.35 + per.lust * 0.8, (rng) => tryAffair(ctx, p, index, rng));
  }
  if (
    !married &&
    p.betrothed === null &&
    age <= 58 &&
    !hasLover(world, p) &&
    typeof p.flags[F.pining] !== "number"
  ) {
    add("romance", 1.4 + Math.max(0, per.sociability) * 0.5 + per.lust * 0.4, (rng) =>
      tryRomance(ctx, p, index, rng),
    );
  }
  if (
    countKind(world, p.id, "rival") + countKind(world, p.id, "nemesis") < 2 &&
    per.ambition + Math.max(0, per.wrath) >= 0.5
  ) {
    add("rivalry", 0.5 + per.ambition * 0.8, (rng) => tryRivalry(ctx, p, index, rng));
  }
  if (countKind(world, p.id, "friend") + countKind(world, p.id, "sworn") < 5) {
    add("friend", 1.1 + Math.max(0, per.sociability) * 0.7, (rng) =>
      tryFriendship(ctx, p, index, rng),
    );
  }
  const oathWith = oathCandidate(ctx, p);
  if (oathWith) {
    add("oath", 0.6, (rng) => swearOath(ctx, p, oathWith, rng));
  }
  const mendWith = mendCandidate(ctx, p);
  if (mendWith) {
    add("mend", 0.6 + per.compassion * 0.7, (rng) => doMend(ctx, p, mendWith, rng));
  }

  const rng = ctx.rng.fork("social", "move", p.id);
  const key = rng.weightedPairs(moves);
  const act = acts.get(key);
  if (act) act(rng.fork(key));
}
