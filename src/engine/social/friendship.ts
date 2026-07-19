/**
 * Friendships: kindled among neighbors of like age and temperament,
 * deepened by years into sworn oaths, and mended with gifts and
 * reconciliations when they sour.
 */

import type { Rng } from "../core/rng";
import type { Ctx, EventId, Person, PersonId } from "../core/types";
import {
  F,
  SettlementIndex,
  adulthoodAgeOf,
  clamp,
  livingPerson,
  pairWhereabouts,
  personalityCompat,
} from "./helpers";
import { BONDS, GESTURES, GIFTS, OATHS, TRADE_BONDS } from "./phrases";
import {
  adjustOpinion,
  getOpinion,
  getRelation,
  relationIdsOf,
  removeRelation,
  setRelation,
} from "./relations";
import { closeKin } from "./kinship";
import { addMemory } from "./memory";
import { clearStage, escFlagsOf } from "./rivalry";

// ---------------------------------------------------------------------------
// Forming friendships
// ---------------------------------------------------------------------------

/** friendship-formed, importance 3. */
export function tryFriendship(ctx: Ctx, p: Person, index: SettlementIndex, rng: Rng): void {
  const world = ctx.world;
  if (p.location == null) return;
  const myAge = ctx.services.people.age(world, p);
  const locals = index.get(p.location) ?? [];

  const candidates: Person[] = [];
  const weights: number[] = [];
  for (const cid of locals) {
    if (cid === p.id) continue;
    const q = world.people.get(cid);
    if (!q || q.died !== null) continue;
    const qAge = ctx.services.people.age(world, q);
    if (qAge < adulthoodAgeOf(world, q)) continue;
    const gap = Math.abs(myAge - qAge);
    if (gap > 20) continue;
    if (getRelation(world, p.id, cid) !== null) continue;
    if (closeKin(world, p.id, cid)) continue; // kin are kin already
    const compat = personalityCompat(p.personality, q.personality);
    if (compat < 0.35) continue;
    const opinion = getOpinion(world, p.id, cid);
    if (opinion < -10) continue;
    let w = Math.exp(-(gap * gap) / 72) * (0.4 + compat);
    w *= 1 + opinion / 80;
    if (q.status.profession === p.status.profession && p.status.profession !== "none") w *= 1.25;
    if (q.sex === p.sex) w *= 1.15;
    if (w > 0.02) {
      candidates.push(q);
      weights.push(w);
    }
  }
  if (candidates.length === 0) return;
  const q = rng.fork("pick").weighted(candidates, weights);
  const compat = personalityCompat(p.personality, q.personality);
  if (!rng.fork("click").chance(0.35 + compat * 0.45)) return;

  const sharedTrade = q.status.profession === p.status.profession && p.status.profession !== "none";
  const bond = sharedTrade
    ? rng.fork("bond").pick(TRADE_BONDS)
    : rng.fork("bond").pick(BONDS);
  const ev = ctx.record({
    type: "friendship-formed",
    date: world.now,
    participants: { a: p.id, b: q.id },
    // bond: what the friendship grew out of.
    data: { bond },
    ...pairWhereabouts(world, p, q),
    importance: 3,
    causes: [],
    storyline: null,
    secret: false,
  });
  const noise = rng.fork("warmth");
  setRelation(world, p.id, q.id, { kind: "friend", since: world.now, opinion: 24 + noise.int(8) });
  setRelation(world, q.id, p.id, { kind: "friend", since: world.now, opinion: 20 + noise.int(8) });
  p.flags[F.friendEvPrefix + q.id] = ev.id;
  q.flags[F.friendEvPrefix + p.id] = ev.id;
  addMemory(world, p.id, { event: ev.id, weight: 1.4, about: q.id, feeling: 0.55 });
  addMemory(world, q.id, { event: ev.id, weight: 1.4, about: p.id, feeling: 0.55 });
}

// ---------------------------------------------------------------------------
// Sworn oaths
// ---------------------------------------------------------------------------

/** Both under arms, or both blooded: such friendships harden faster. */
function battleForged(a: Person, b: Person): boolean {
  const armed = (p: Person) =>
    p.status.profession === "soldier" ||
    p.status.profession === "guard" ||
    typeof p.flags[F.duelVictor] === "number";
  return armed(a) && armed(b);
}

/**
 * A friend fit for oath-swearing: long standing (or battle-forged) and
 * deep mutual regard, present in the same settlement. A sworn companion
 * is a once-in-a-life bond: anyone already sworn stands apart. Best pair
 * wins; ties break to the lower id.
 */
export function oathCandidate(ctx: Ctx, p: Person): Person | null {
  const world = ctx.world;
  if (hasSworn(world, p.id)) return null;
  let best: Person | null = null;
  let bestScore = -Infinity;
  for (const oid of relationIdsOf(world, p.id)) {
    const rel = getRelation(world, p.id, oid);
    if (!rel || rel.kind !== "friend") continue;
    const q = livingPerson(world, oid);
    if (!q || q.location == null || q.location !== p.location) continue;
    if (hasSworn(world, oid)) continue;
    const back = getRelation(world, oid, p.id);
    if (!back || back.kind !== "friend") continue;
    const forged = battleForged(p, q);
    const months = world.now - rel.since;
    if (months < (forged ? 48 : 96)) continue;
    const threshold = forged ? 40 : 45;
    if (rel.opinion < threshold || back.opinion < threshold) continue;
    const score = rel.opinion + back.opinion;
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best;
}

function hasSworn(world: Ctx["world"], id: PersonId): boolean {
  const inner = world.relationships.get(id);
  if (!inner) return false;
  for (const rel of inner.values()) {
    if (rel.kind === "sworn") return true;
  }
  return false;
}

/** oath-sworn, importance 8, kind "sworn". */
export function swearOath(ctx: Ctx, p: Person, q: Person, rng: Rng): void {
  const world = ctx.world;
  if (!rng.fork("resolve").chance(0.18 + Math.max(0, p.personality.honor) * 0.2)) return;
  const causes: EventId[] = [];
  const seed = p.flags[F.friendEvPrefix + q.id];
  if (typeof seed === "number") causes.push(seed);
  const forged = battleForged(p, q);
  const data: Record<string, unknown> = { oath: rng.fork("oath").pick(OATHS) };
  if (forged) data.battleForged = true;
  const ev = ctx.record({
    type: "oath-sworn",
    date: world.now,
    participants: { a: p.id, b: q.id },
    data,
    ...pairWhereabouts(world, p, q),
    importance: 8,
    causes,
    storyline: null,
    secret: false,
  });
  for (const [x, y] of [
    [p, q],
    [q, p],
  ] as const) {
    const rel = getRelation(world, x.id, y.id);
    if (rel) {
      rel.kind = "sworn";
      rel.opinion = clamp(rel.opinion + 15, -100, 100);
    } else {
      setRelation(world, x.id, y.id, { kind: "sworn", since: world.now, opinion: 60 });
    }
    addMemory(world, x.id, { event: ev.id, weight: 3, about: y.id, feeling: 0.85 });
  }
}

// ---------------------------------------------------------------------------
// Mending: reconciliation and gifts
// ---------------------------------------------------------------------------

export interface MendTarget {
  other: Person;
  mode: "reconcile" | "gift";
}

/**
 * Someone worth making peace with: a rival not yet beyond words, or a
 * close bond (friend, sworn, lover, spouse) gone cold toward us. The
 * sorest such bond is chosen; ties break to the lower id.
 */
export function mendCandidate(ctx: Ctx, p: Person): MendTarget | null {
  const world = ctx.world;
  const per = p.personality;

  // Reconciliation with a rival takes some grace to attempt at all.
  if (per.compassion >= 0.3 || per.honor >= 0.4) {
    for (const oid of relationIdsOf(world, p.id)) {
      const rel = getRelation(world, p.id, oid);
      if (!rel || rel.kind !== "rival") continue;
      if (rel.opinion <= -45) continue; // too deep to cross yet
      const q = livingPerson(world, oid);
      if (!q || q.location == null || q.location !== p.location) continue;
      return { other: q, mode: "reconcile" };
    }
  }

  // A close bond gone cold: warm it with a gift.
  let best: Person | null = null;
  let sorest = 26; // only bonds cooler than this want mending
  const consider = (q: Person | null) => {
    if (!q || q.location == null || q.location !== p.location) return;
    const theirView = getOpinion(world, q.id, p.id);
    if (theirView < sorest) {
      sorest = theirView;
      best = q;
    }
  };
  for (const oid of relationIdsOf(world, p.id)) {
    const rel = getRelation(world, p.id, oid);
    if (!rel) continue;
    if (rel.kind !== "friend" && rel.kind !== "sworn" && rel.kind !== "lover") continue;
    consider(livingPerson(world, oid));
  }
  for (const m of p.marriages) {
    if (m.active) consider(livingPerson(world, m.spouse));
  }
  if (best) return { other: best, mode: "gift" };
  return null;
}

/** reconciliation importance 4; gift importance 3. */
export function doMend(ctx: Ctx, p: Person, target: MendTarget, rng: Rng): void {
  const world = ctx.world;
  const q = target.other;
  if (target.mode === "reconcile") {
    if (!rng.fork("resolve").chance(0.4 + p.personality.compassion * 0.3)) return;
    const causes: EventId[] = [];
    const { escEv } = escFlagsOf(world, p.id, q.id);
    if (escEv !== null) causes.push(escEv);
    else {
      const seed = p.flags[F.rivalEvPrefix + q.id];
      if (typeof seed === "number") causes.push(seed);
    }
    const ev = ctx.record({
      type: "reconciliation",
      date: world.now,
      participants: { a: p.id, b: q.id },
      // gesture: how the peace was made.
      data: { gesture: rng.fork("gesture").pick(GESTURES) },
      ...pairWhereabouts(world, p, q),
      importance: 4,
      causes,
      storyline: null,
      secret: false,
    });
    clearStage(world, p.id, q.id);
    adjustOpinion(world, p.id, q.id, 24);
    adjustOpinion(world, q.id, p.id, 24);
    addMemory(world, p.id, { event: ev.id, weight: 2, about: q.id, feeling: 0.6 });
    addMemory(world, q.id, { event: ev.id, weight: 2, about: p.id, feeling: 0.6 });
    // If the grievance has truly drained, the rivalry is over.
    const mine = getRelation(world, p.id, q.id);
    const theirs = getRelation(world, q.id, p.id);
    if (mine && theirs && mine.opinion >= -4 && theirs.opinion >= -4) {
      removeRelation(world, p.id, q.id);
      removeRelation(world, q.id, p.id);
      delete p.flags[F.rivalEvPrefix + q.id];
      delete q.flags[F.rivalEvPrefix + p.id];
    }
  } else {
    if (!rng.fork("resolve").chance(0.55)) return;
    const ev = ctx.record({
      type: "gift",
      date: world.now,
      participants: { giver: p.id, receiver: q.id },
      // gift: the object given.
      data: { gift: rng.fork("gift").pick(GIFTS) },
      ...pairWhereabouts(world, p, q),
      importance: 3,
      causes: [],
      storyline: null,
      secret: false,
    });
    adjustOpinion(world, q.id, p.id, 16);
    adjustOpinion(world, p.id, q.id, 6);
    addMemory(world, q.id, { event: ev.id, weight: 1.2, about: p.id, feeling: 0.5 });
  }
}
