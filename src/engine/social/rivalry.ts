/**
 * Rivalries and their escalation. Rivalries kindle from ambition clashes
 * in a shared trade, from inheritance resentment between siblings, and
 * from romantic competition. Once formed they can heat month by month:
 * insult, then quarrel, then a brawl, or a duel where the culture holds
 * violence honorable. Duels wound, kill, or end in a yield; the dead
 * leave grudges and house feuds behind them.
 */

import type { Rng } from "../core/rng";
import type { Ctx, EventId, EventRecord, Person, PersonId, World } from "../core/types";
import {
  F,
  SettlementIndex,
  adulthoodAgeOf,
  clamp,
  cultureOf,
  livingPerson,
  pairWhereabouts,
  settlementName,
  warApt,
} from "./helpers";
import { BRAWL_MARKS, DUEL_SCARS, QUARREL_MATTERS, SLIGHTS, professionRivalry } from "./phrases";
import {
  adjustOpinion,
  getRelation,
  relationIdsOf,
  setRelation,
} from "./relations";
import { closeKin, siblingIdsOf } from "./kinship";
import { addMemory } from "./memory";
import { bumpFeudBetweenPersons } from "./feuds";

// ---------------------------------------------------------------------------
// Escalation stage flags (held on the lower id of the pair)
// ---------------------------------------------------------------------------

export function escFlagsOf(
  world: World,
  a: PersonId,
  b: PersonId,
): { stage: string | null; escEv: EventId | null } {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const holder = world.people.get(lo);
  if (!holder) return { stage: null, escEv: null };
  const stage = holder.flags[F.escStagePrefix + hi];
  const escEv = holder.flags[F.escEvPrefix + hi];
  return {
    stage: typeof stage === "string" ? stage : null,
    escEv: typeof escEv === "number" ? escEv : null,
  };
}

function setStage(world: World, a: PersonId, b: PersonId, stage: string, ev: EventId): void {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const holder = world.people.get(lo);
  if (!holder) return;
  holder.flags[F.escStagePrefix + hi] = stage;
  holder.flags[F.escEvPrefix + hi] = ev;
}

export function clearStage(world: World, a: PersonId, b: PersonId): void {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const holder = world.people.get(lo);
  if (!holder) return;
  delete holder.flags[F.escStagePrefix + hi];
  delete holder.flags[F.escEvPrefix + hi];
}

/** The matter a rivalry is over, recovered from its founding event. */
export function rivalryReason(world: World, p: Person, q: Person, rng: Rng): string {
  const seed = p.flags[F.rivalEvPrefix + q.id] ?? q.flags[F.rivalEvPrefix + p.id];
  if (typeof seed === "number") {
    const ev = world.events.get(seed);
    const over = ev?.data["over"];
    if (typeof over === "string") return over;
  }
  return rng.pick(QUARREL_MATTERS);
}

// ---------------------------------------------------------------------------
// Forming rivalries
// ---------------------------------------------------------------------------

interface RivalrySeed {
  other: Person;
  over: string;
  weight: number;
  causes: EventId[];
}

/** rivalry-formed, importance 4. */
export function tryRivalry(ctx: Ctx, p: Person, index: SettlementIndex, rng: Rng): void {
  const world = ctx.world;
  const seeds: RivalrySeed[] = [];
  const known = (oid: PersonId) => getRelation(world, p.id, oid) !== null;

  // Ambition clashing in a shared trade.
  if (p.location != null && p.status.profession !== "none" && p.personality.ambition >= 0.5) {
    const locals = index.get(p.location) ?? [];
    for (const cid of locals) {
      if (cid === p.id || known(cid)) continue;
      const q = world.people.get(cid);
      if (!q || q.died !== null) continue;
      if (q.status.profession !== p.status.profession) continue;
      if (q.personality.ambition < 0.5) continue;
      if (ctx.services.people.age(world, q) < adulthoodAgeOf(world, q)) continue;
      if (closeKin(world, p.id, cid)) continue;
      seeds.push({
        other: q,
        over: professionRivalry(p.status.profession, settlementName(world, p.location)),
        weight: 0.3 + (p.personality.ambition + q.personality.ambition) / 2,
        causes: [],
      });
    }
  }

  // Inheritance resentment: the younger covets the elder's portion.
  if (p.personality.greed + p.personality.ambition >= 0.9) {
    for (const sid of siblingIdsOf(world, p.id)) {
      if (known(sid)) continue;
      const s = livingPerson(world, sid);
      if (!s || s.born >= p.born) continue; // only elders stand to take
      const estateParent = estateParentOf(world, p, s);
      if (!estateParent) continue;
      seeds.push({
        other: s,
        over:
          estateParent.sex === "f"
            ? "the elder's claim to their mother's portion"
            : "the elder's claim to their father's portion",
        weight: 0.4 + p.personality.greed * 0.8 + p.personality.ambition * 0.4,
        causes: [],
      });
    }
  }

  // Romantic competition: the one who holds the beloved's heart.
  const pineAt = p.flags[F.pining];
  if (typeof pineAt === "number") {
    const beloved = livingPerson(world, pineAt);
    if (beloved) {
      const holder = heartHolderOf(world, beloved, p.id);
      if (holder && !known(holder.id) && !closeKin(world, p.id, holder.id)) {
        const causes: EventId[] = [];
        const romanceEv = beloved.flags[F.romanceEvPrefix + holder.id];
        if (typeof romanceEv === "number") causes.push(romanceEv);
        seeds.push({
          other: holder,
          over: `the favor of ${beloved.givenName}`,
          weight: 0.5 + p.personality.lust * 0.6 + Math.max(0, p.personality.wrath) * 0.3,
          causes,
        });
      }
    }
  }

  if (seeds.length === 0) return;
  const seed = rng.fork("pick").weighted(seeds, seeds.map((s) => s.weight));
  const q = seed.other;
  const ev = ctx.record({
    type: "rivalry-formed",
    date: world.now,
    participants: { a: p.id, b: q.id },
    // over: the matter contended.
    data: { over: seed.over },
    ...pairWhereabouts(world, p, q),
    importance: 4,
    causes: seed.causes,
    storyline: null,
    secret: false,
  });
  const noise = rng.fork("heat");
  setRelation(world, p.id, q.id, { kind: "rival", since: world.now, opinion: -26 - noise.int(7) });
  setRelation(world, q.id, p.id, { kind: "rival", since: world.now, opinion: -18 - noise.int(7) });
  p.flags[F.rivalEvPrefix + q.id] = ev.id;
  q.flags[F.rivalEvPrefix + p.id] = ev.id;
  addMemory(world, p.id, { event: ev.id, weight: 1.6, about: q.id, feeling: -0.5 });
  addMemory(world, q.id, { event: ev.id, weight: 1.6, about: p.id, feeling: -0.5 });
}

/** A shared parent whose estate is worth coveting, or null. */
function estateParentOf(world: World, a: Person, b: Person): Person | null {
  const shared: PersonId[] = [];
  for (const pid of [a.mother, a.father, a.legalFather]) {
    if (pid == null) continue;
    if (pid === b.mother || pid === b.father || pid === b.legalFather) {
      if (!shared.includes(pid)) shared.push(pid);
    }
  }
  shared.sort((x, y) => x - y);
  for (const pid of shared) {
    const parent = world.people.get(pid);
    if (!parent) continue;
    if (parent.status.rank >= 2 || parent.status.wealth >= 3 || parent.house != null) {
      return parent;
    }
  }
  return null;
}

/** Who holds the beloved's heart: an active spouse, else a stored lover. */
function heartHolderOf(world: World, beloved: Person, excluding: PersonId): Person | null {
  for (const s of beloved.marriages.filter((m) => m.active).map((m) => m.spouse).sort((x, y) => x - y)) {
    if (s === excluding) continue;
    const holder = livingPerson(world, s);
    if (holder) return holder;
  }
  for (const oid of relationIdsOf(world, beloved.id)) {
    if (oid === excluding) continue;
    const rel = getRelation(world, beloved.id, oid);
    if (rel && rel.kind === "lover") {
      const holder = livingPerson(world, oid);
      if (holder) return holder;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Escalation: insult -> quarrel -> brawl | duel
// ---------------------------------------------------------------------------

/**
 * The rival most worth confronting this month: coldest opinion first,
 * present in the same settlement, still alive. Ties break to lower id.
 */
export function pickEscalationTarget(ctx: Ctx, p: Person): Person | null {
  const world = ctx.world;
  let best: Person | null = null;
  let coldest = -15; // only genuinely soured rivalries escalate
  for (const oid of relationIdsOf(world, p.id)) {
    const rel = getRelation(world, p.id, oid);
    if (!rel || (rel.kind !== "rival" && rel.kind !== "nemesis")) continue;
    if (rel.opinion >= coldest) continue;
    const q = livingPerson(world, oid);
    if (!q || q.location == null || q.location !== p.location) continue;
    coldest = rel.opinion;
    best = q;
  }
  return best;
}

export function escalate(ctx: Ctx, p: Person, q: Person, rng: Rng): void {
  const world = ctx.world;
  const per = p.personality;
  const { stage, escEv } = escFlagsOf(world, p.id, q.id);
  const feuding = p.house != null && q.house != null && p.house !== q.house;
  const heat = clamp(
    0.3 +
      Math.max(0, per.wrath) * 0.3 +
      Math.max(0, per.volatility) * 0.12 -
      Math.max(0, per.agreeableness) * 0.15 +
      (feuding ? 0.1 : 0),
    0.08,
    0.85,
  );
  if (!rng.fork("go").chance(heat)) {
    // Tempers bank their coals; sometimes the whole matter cools.
    if (stage !== null && rng.fork("cool").chance(0.25)) clearStage(world, p.id, q.id);
    return;
  }
  if (stage === null) insult(ctx, p, q, rng);
  else if (stage === "insult") quarrel(ctx, p, q, escEv, rng);
  else resolveEscalation(ctx, p, q, escEv, rng);
}

/** insult, importance 3. */
function insult(ctx: Ctx, p: Person, q: Person, rng: Rng): void {
  const world = ctx.world;
  const causes: EventId[] = [];
  const seed = p.flags[F.rivalEvPrefix + q.id];
  if (typeof seed === "number") causes.push(seed);
  const ev = ctx.record({
    type: "insult",
    date: world.now,
    participants: { subject: p.id, target: q.id },
    // slight: the offense given, as a noun clause.
    data: { slight: rng.fork("slight").pick(SLIGHTS) },
    ...pairWhereabouts(world, p, q),
    importance: 3,
    causes,
    storyline: null,
    secret: false,
  });
  adjustOpinion(world, q.id, p.id, -12);
  addMemory(world, q.id, { event: ev.id, weight: 1.6, about: p.id, feeling: -0.55 });
  setStage(world, p.id, q.id, "insult", ev.id);
}

/** quarrel, importance 4. */
function quarrel(ctx: Ctx, p: Person, q: Person, escEv: EventId | null, rng: Rng): void {
  const world = ctx.world;
  const over = rivalryReason(world, p, q, rng.fork("over"));
  const ev = ctx.record({
    type: "quarrel",
    date: world.now,
    participants: { a: p.id, b: q.id },
    // over: the matter quarreled about.
    data: { over },
    ...pairWhereabouts(world, p, q),
    importance: 4,
    causes: escEv !== null ? [escEv] : [],
    storyline: null,
    secret: false,
  });
  adjustOpinion(world, p.id, q.id, -10);
  adjustOpinion(world, q.id, p.id, -10);
  addMemory(world, p.id, { event: ev.id, weight: 1.6, about: q.id, feeling: -0.5 });
  addMemory(world, q.id, { event: ev.id, weight: 1.6, about: p.id, feeling: -0.5 });
  setStage(world, p.id, q.id, "quarrel", ev.id);
}

/** After a quarrel: blades or fists, depending on culture and station. */
function resolveEscalation(
  ctx: Ctx,
  p: Person,
  q: Person,
  escEv: EventId | null,
  rng: Rng,
): void {
  const world = ctx.world;
  const cp = cultureOf(world, p);
  const cq = cultureOf(world, q);
  const violence = Math.max(cp?.attitudes.violence ?? 0.3, cq?.attitudes.violence ?? 0.3);
  const honorable =
    (cp?.values ?? []).includes("honor") ||
    (cp?.values ?? []).includes("vengeance") ||
    (cq?.values ?? []).includes("honor");
  let duelP = violence * 0.55 + (honorable ? 0.18 : 0) + warApt(p) * 0.05;
  if (p.status.rank >= 3 && q.status.rank >= 3) duelP += 0.15;
  if (violence < 0.45 && p.status.rank < 3) duelP *= 0.35;
  const causes = escEv !== null ? [escEv] : [];
  const over = rivalryReason(world, p, q, rng.fork("over"));
  if (rng.fork("form").chance(clamp(duelP, 0.05, 0.85))) {
    fightDuel(ctx, p, q, over, causes);
  } else {
    brawl(ctx, p, q, over, causes, rng.fork("brawl"));
  }
}

// ---------------------------------------------------------------------------
// The brawl
// ---------------------------------------------------------------------------

/** brawl, importance 8. */
export function brawl(
  ctx: Ctx,
  p: Person,
  q: Person,
  over: string,
  causes: EventId[],
  rng: Rng,
): void {
  const world = ctx.world;
  const fist = (x: Person, r: Rng) =>
    warApt(x) * 0.4 + x.phenotype.buildScore * 0.25 + x.personality.courage * 0.3 + r.gaussian() * 0.6;
  const sp = fist(p, rng.fork("p"));
  const sq = fist(q, rng.fork("q"));
  const bruised = sp >= sq ? q : p;
  const data: Record<string, unknown> = { over };
  let mark: string | null = null;
  if (rng.fork("mark").chance(0.5)) {
    mark = rng.fork("which").pick(BRAWL_MARKS);
    data.injured = bruised.id;
    data.mark = mark;
  }
  const ev = ctx.record({
    type: "brawl",
    date: world.now,
    participants: { a: p.id, b: q.id },
    // over: the matter; injured/mark: who came off worse and how.
    data,
    ...pairWhereabouts(world, p, q),
    importance: 8,
    causes,
    storyline: null,
    secret: false,
  });
  if (mark !== null) bruised.injuries.push(mark);
  adjustOpinion(world, p.id, q.id, -15);
  adjustOpinion(world, q.id, p.id, -15);
  addMemory(world, p.id, { event: ev.id, weight: 2, about: q.id, feeling: -0.6 });
  addMemory(world, q.id, { event: ev.id, weight: 2, about: p.id, feeling: -0.6 });
  clearStage(world, p.id, q.id);
  bumpFeudBetweenPersons(ctx, p, q, 0.08, ev.id);
}

// ---------------------------------------------------------------------------
// The duel
// ---------------------------------------------------------------------------

/**
 * duel, importance 20 (yield) / 25 (wound) / 30 (death). Death goes
 * through services.people.kill with the duel event as cause, so the
 * chronicle chains insult, quarrel, duel, and death together.
 */
export function fightDuel(
  ctx: Ctx,
  challenger: Person,
  challenged: Person,
  over: string,
  causes: EventId[],
): EventRecord {
  const world = ctx.world;
  const rng = ctx.rng.fork("social", "duel", challenger.id, challenged.id);
  const prowess = (x: Person, r: Rng) =>
    warApt(x) * 0.45 +
    x.personality.courage * 0.5 +
    x.phenotype.buildScore * 0.08 +
    (x.status.profession === "soldier" || x.status.profession === "guard" ? 0.35 : 0) +
    r.gaussian() * 0.55;
  const sa = prowess(challenger, rng.fork("a"));
  const sb = prowess(challenged, rng.fork("b"));
  const victor = sa >= sb ? challenger : challenged;
  const loser = victor.id === challenger.id ? challenged : challenger;
  const margin = Math.abs(sa - sb);
  const violence = Math.max(
    cultureOf(world, victor)?.attitudes.violence ?? 0.3,
    cultureOf(world, loser)?.attitudes.violence ?? 0.3,
  );
  const deathP = clamp(
    0.08 +
      margin * 0.16 +
      victor.personality.wrath * 0.22 -
      victor.personality.compassion * 0.18 +
      violence * 0.12,
    0.02,
    0.55,
  );
  const woundP = clamp(0.3 + margin * 0.18, 0.15, 0.6);
  const roll = rng.fork("outcome").next();
  const outcome: "death" | "wound" | "yield" =
    roll < deathP ? "death" : roll < deathP + woundP ? "wound" : "yield";

  const participants: Record<string, PersonId> = {
    challenger: challenger.id,
    challenged: challenged.id,
    victor: victor.id,
  };
  if (outcome === "death") participants.slain = loser.id;

  const ev = ctx.record({
    type: "duel",
    date: world.now,
    participants,
    data: { over, outcome },
    ...pairWhereabouts(world, challenger, challenged),
    importance: outcome === "death" ? 30 : outcome === "wound" ? 25 : 20,
    causes,
    storyline: null,
    secret: false,
  });

  const prevWins = victor.flags[F.duelVictor];
  victor.flags[F.duelVictor] = typeof prevWins === "number" ? prevWins + 1 : 1;
  clearStage(world, challenger.id, challenged.id);

  if (outcome === "death") {
    addMemory(world, victor.id, { event: ev.id, weight: 2.5, about: loser.id, feeling: -0.4 });
    bumpFeudBetweenPersons(ctx, victor, loser, 0.25, ev.id);
    ctx.services.people.kill(ctx, loser, "slain in a duel", {
      killer: victor.id,
      event: ev.id,
    });
  } else if (outcome === "wound") {
    loser.injuries.push(rng.fork("scar").pick(DUEL_SCARS));
    adjustOpinion(world, loser.id, victor.id, -20);
    adjustOpinion(world, victor.id, loser.id, 12);
    addMemory(world, loser.id, { event: ev.id, weight: 3, about: victor.id, feeling: -0.8 });
    addMemory(world, victor.id, { event: ev.id, weight: 2, about: loser.id, feeling: 0.3 });
    bumpFeudBetweenPersons(ctx, victor, loser, 0.12, ev.id);
  } else {
    // The yield: honor answered, the matter set down.
    adjustOpinion(world, victor.id, loser.id, 16);
    adjustOpinion(world, loser.id, victor.id, 10);
    addMemory(world, loser.id, { event: ev.id, weight: 2, about: victor.id, feeling: -0.55 });
    addMemory(world, victor.id, { event: ev.id, weight: 2, about: loser.id, feeling: 0.35 });
    bumpFeudBetweenPersons(ctx, victor, loser, 0.06, ev.id);
  }
  return ev;
}
