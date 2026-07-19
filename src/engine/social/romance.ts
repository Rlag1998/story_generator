/**
 * Romance and its shadows: mutual courtship, unrequited pining, secret
 * affairs, and the day the affair comes to light. Lover relations feed
 * the people module's marriage market and illicit conceptions; discovery
 * feeds divorces, grudges, and house feuds.
 */

import type { Rng } from "../core/rng";
import type { Ctx, EventId, EventRecord, Person, PersonId, World } from "../core/types";
import { revealEvent } from "../core/world";
import {
  F,
  SettlementIndex,
  activeSpouses,
  adulthoodAgeOf,
  clamp,
  clamp01,
  intrigueApt,
  isMarried,
  livingPerson,
  pairFlags,
  pairWhereabouts,
  personalityCompat,
} from "./helpers";
import { DISCOVERIES, SPARKS } from "./phrases";
import { adjustOpinion, getOpinion, getRelation, setRelation } from "./relations";
import { closeKin } from "./kinship";
import { addMemory } from "./memory";
import { bumpFeud } from "./feuds";

/** Courting ends, in this fabric, around this age. */
const COURTING_AGE_LIMIT = 58;
/** Above this phenotypic resemblance, desire curdles: too like one's own blood. */
const KIN_LOOK_LIMIT = 0.8;

// ---------------------------------------------------------------------------
// Attraction
// ---------------------------------------------------------------------------

/**
 * How drawn `viewer` is to `target`, 0..1, deterministic (callers add
 * their own dice). Age proximity, temperament fit, a touch of station,
 * renown, and existing regard all pull; a face too near one's own line
 * pushes away, and past the hard limit desire dies entirely.
 */
export function attraction(
  world: World,
  viewer: Person,
  target: Person,
  viewerAge: number,
  targetAge: number,
  resemblance: number,
): number {
  if (resemblance > KIN_LOOK_LIMIT) return 0;
  let s = 0.3;
  const gap = Math.abs(viewerAge - targetAge);
  s += 0.3 * Math.exp(-(gap * gap) / 90);
  s += 0.25 * personalityCompat(viewer.personality, target.personality);
  const rankDiff = target.status.rank - viewer.status.rank;
  s += clamp(rankDiff * 0.04, -0.08, 0.12);
  if (target.personality.sociability > 0.3) s += 0.06;
  if (target.epithet.length > 0) s += 0.05;
  const op = getOpinion(world, viewer.id, target.id);
  s += clamp(op / 200, -0.15, 0.2);
  if (resemblance > 0.65) s -= (resemblance - 0.65) * 1.5;
  return clamp01(s);
}

/** Does p carry any outgoing lover relation? */
export function hasLover(world: World, p: Person): boolean {
  const inner = world.relationships.get(p.id);
  if (!inner) return false;
  for (const rel of inner.values()) {
    if (rel.kind === "lover") return true;
  }
  return false;
}

/** Does p carry any active affair flag? */
export function hasAffair(p: Person): boolean {
  for (const key of Object.keys(p.flags)) {
    if (key.startsWith(F.affairEvPrefix)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Courtship among the free
// ---------------------------------------------------------------------------

/** romance-began importance 6; unrequited leaves a pining flag instead. */
export function tryRomance(ctx: Ctx, p: Person, index: SettlementIndex, rng: Rng): void {
  const world = ctx.world;
  if (p.location == null) return;
  const myAge = ctx.services.people.age(world, p);
  const locals = index.get(p.location) ?? [];

  const candidates: Person[] = [];
  const pulls: number[] = [];
  for (const cid of locals) {
    if (cid === p.id) continue;
    const q = world.people.get(cid);
    if (!q || q.died !== null || q.sex === p.sex) continue;
    const qAge = ctx.services.people.age(world, q);
    if (qAge < adulthoodAgeOf(world, q) || qAge > COURTING_AGE_LIMIT) continue;
    if (isMarried(q) || q.betrothed !== null) continue;
    if (getRelation(world, p.id, cid)?.kind === "lover") continue;
    if (closeKin(world, p.id, cid)) continue;
    const res = ctx.services.genetics.resemblance(p.phenotype, q.phenotype);
    const pull = attraction(world, p, q, myAge, qAge, res);
    if (pull < 0.42) continue;
    candidates.push(q);
    pulls.push(pull * pull);
  }
  if (candidates.length === 0) return;
  const q = rng.fork("pick").weighted(candidates, pulls);
  const qAge = ctx.services.people.age(world, q);
  const res = ctx.services.genetics.resemblance(q.phenotype, p.phenotype);
  const back = attraction(world, q, p, qAge, myAge, res);
  const forward = attraction(
    world,
    p,
    q,
    myAge,
    qAge,
    ctx.services.genetics.resemblance(p.phenotype, q.phenotype),
  );

  if (back >= 0.45 || rng.fork("swept").chance(back)) {
    beginRomance(ctx, p, q, rng);
  } else if (forward >= 0.55) {
    // Unrequited: a one-sided devotion. The relation is stored as a
    // plain bond, not "lover", so other systems never read it as
    // requited; the pining flag carries the truth.
    p.flags[F.pining] = q.id;
    if (getRelation(world, p.id, q.id) === null) {
      setRelation(world, p.id, q.id, { kind: "friend", since: world.now, opinion: 28 });
    }
  }
}

function beginRomance(ctx: Ctx, p: Person, q: Person, rng: Rng): void {
  const world = ctx.world;
  const ev = ctx.record({
    type: "romance-began",
    date: world.now,
    participants: { a: p.id, b: q.id },
    // spark: how it kindled.
    data: { spark: rng.fork("spark").pick(SPARKS) },
    ...pairWhereabouts(world, p, q),
    importance: 6,
    causes: [],
    storyline: null,
    secret: false,
  });
  const noise = rng.fork("warmth");
  setRelation(world, p.id, q.id, { kind: "lover", since: world.now, opinion: 46 + noise.int(8) });
  setRelation(world, q.id, p.id, { kind: "lover", since: world.now, opinion: 42 + noise.int(8) });
  p.flags[F.romanceEvPrefix + q.id] = ev.id;
  q.flags[F.romanceEvPrefix + p.id] = ev.id;
  addMemory(world, p.id, { event: ev.id, weight: 2.4, about: q.id, feeling: 0.8 });
  addMemory(world, q.id, { event: ev.id, weight: 2.4, about: p.id, feeling: 0.8 });
  if (p.flags[F.pining] === q.id) delete p.flags[F.pining];
  if (q.flags[F.pining] === p.id) delete q.flags[F.pining];
}

/** A pining heart tries again, or finally lets go. */
export function tryPining(ctx: Ctx, p: Person, rng: Rng): void {
  const world = ctx.world;
  const targetId = p.flags[F.pining];
  if (typeof targetId !== "number") return;
  const q = livingPerson(world, targetId);
  if (!q || q.location == null || q.location !== p.location) {
    delete p.flags[F.pining]; // gone, or gone away
    return;
  }
  if (isMarried(q) || q.betrothed !== null) {
    if (rng.fork("letgo").chance(0.6)) delete p.flags[F.pining];
    return;
  }
  if (isMarried(p) || p.betrothed !== null) {
    delete p.flags[F.pining]; // wed since; the old ache is put away
    return;
  }
  const myAge = ctx.services.people.age(world, p);
  const qAge = ctx.services.people.age(world, q);
  const res = ctx.services.genetics.resemblance(q.phenotype, p.phenotype);
  const back = attraction(world, q, p, qAge, myAge, res) + 0.1; // persistence tells
  if (back >= 0.45 || rng.fork("swept").chance(clamp01(back))) {
    beginRomance(ctx, p, q, rng);
  } else if (rng.fork("moveon").chance(0.35)) {
    delete p.flags[F.pining];
  }
}

// ---------------------------------------------------------------------------
// Affairs
// ---------------------------------------------------------------------------

/** affair-began, importance 18, SECRET. */
export function tryAffair(ctx: Ctx, p: Person, index: SettlementIndex, rng: Rng): void {
  const world = ctx.world;
  if (p.location == null) return;
  const spouses = activeSpouses(world, p);
  if (spouses.length === 0) return;
  // Contentment: regard for the best-loved spouse, dented by a marriage
  // of mismatched tempers. Kin-bonus warmth alone does not keep a poorly
  // matched heart at home.
  let contentment = -100;
  for (const s of spouses) {
    const fit = personalityCompat(p.personality, s.personality);
    contentment = Math.max(
      contentment,
      getOpinion(world, p.id, s.id) - Math.round((1 - fit) * 25),
    );
  }
  if (contentment >= 35 && p.personality.lust < 0.8) return; // content enough

  const myAge = ctx.services.people.age(world, p);
  const locals = index.get(p.location) ?? [];
  const spouseIds = new Set(spouses.map((s) => s.id));

  const candidates: Person[] = [];
  const weights: number[] = [];
  for (const cid of locals) {
    if (cid === p.id || spouseIds.has(cid)) continue;
    const q = world.people.get(cid);
    if (!q || q.died !== null || q.sex === p.sex) continue;
    const qAge = ctx.services.people.age(world, q);
    if (qAge < adulthoodAgeOf(world, q) || qAge > COURTING_AGE_LIMIT) continue;
    if (closeKin(world, p.id, cid)) continue;
    if (hasAffair(q)) continue; // one scandal at a time
    const res = ctx.services.genetics.resemblance(p.phenotype, q.phenotype);
    const pull = attraction(world, p, q, myAge, qAge, res);
    if (pull < 0.5) continue;
    // Would they? Loose hearts, unhappy marriages, low scruples.
    let willing = q.personality.lust * 0.6 + personalityCompat(p.personality, q.personality) * 0.3 - Math.max(0, q.personality.honor) * 0.4;
    if (isMarried(q)) {
      const qSpouses = activeSpouses(world, q);
      let qOp = -100;
      for (const s of qSpouses) qOp = Math.max(qOp, getOpinion(world, q.id, s.id));
      willing += qOp < 20 ? 0.2 : -0.25;
    } else {
      willing += 0.15;
    }
    if (willing <= 0.25) continue;
    candidates.push(q);
    weights.push(pull * willing);
  }
  if (candidates.length === 0) return;
  const q = rng.fork("pick").weighted(candidates, weights);
  if (!rng.fork("dare").chance(0.5)) return;
  beginAffair(ctx, p, q);
}

/** Start a secret affair between two people (exported for tests/story). */
export function beginAffair(ctx: Ctx, a: Person, b: Person): EventRecord {
  const world = ctx.world;
  const rng = ctx.rng.fork("social", "affair-begin", a.id, b.id);
  const ev = ctx.record({
    type: "affair-began",
    date: world.now,
    participants: { a: a.id, b: b.id },
    // spark: how it kindled.
    data: { spark: rng.fork("spark").pick(SPARKS) },
    ...pairWhereabouts(world, a, b),
    importance: 18,
    causes: [],
    storyline: null,
    secret: true,
  });
  const noise = rng.fork("warmth");
  setRelation(world, a.id, b.id, { kind: "lover", since: world.now, opinion: 52 + noise.int(10) });
  setRelation(world, b.id, a.id, { kind: "lover", since: world.now, opinion: 48 + noise.int(10) });
  a.flags[F.affairEvPrefix + b.id] = ev.id;
  b.flags[F.affairEvPrefix + a.id] = ev.id;
  addMemory(world, a.id, { event: ev.id, weight: 2.5, about: b.id, feeling: 0.75 });
  addMemory(world, b.id, { event: ev.id, weight: 2.5, about: a.id, feeling: 0.75 });
  return ev;
}

// ---------------------------------------------------------------------------
// The monthly watch: fizzle and discovery
// ---------------------------------------------------------------------------

/**
 * Every active affair runs a monthly discovery hazard, and a small
 * chance of guttering out quietly. Bounded by the number of affairs,
 * which is itself small.
 */
export function affairWatch(ctx: Ctx, ids: PersonId[]): void {
  const world = ctx.world;
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p || p.died !== null) continue;
    for (const [otherId, value] of pairFlags(p, F.affairEvPrefix)) {
      if (otherId < id) continue; // the lower id of the pair drives
      const q = livingPerson(world, otherId);
      if (!q || typeof value !== "number") {
        delete p.flags[F.affairEvPrefix + otherId];
        continue;
      }
      if (typeof q.flags[F.affairEvPrefix + id] !== "number") {
        delete p.flags[F.affairEvPrefix + otherId]; // dangling half
        continue;
      }
      if (!isMarried(p) && !isMarried(q)) {
        // Widowed or divorced since: no longer an affair, just lovers.
        delete p.flags[F.affairEvPrefix + otherId];
        delete q.flags[F.affairEvPrefix + id];
        continue;
      }
      const rng = ctx.rng.fork("social", "affair-watch", id, otherId, world.now);
      if (rng.fork("fizzle").chance(0.012)) {
        endAffairQuietly(world, p, q);
        continue;
      }
      if (rng.fork("found").chance(discoveryHazard(world, p, q))) {
        discoverAffair(ctx, p, q, value);
      }
    }
  }
}

/** Monthly chance the affair comes to light. */
export function discoveryHazard(world: World, a: Person, b: Person): number {
  let h = 0.02;
  const wronged = [
    ...activeSpouses(world, a).filter((s) => s.id !== b.id),
    ...activeSpouses(world, b).filter((s) => s.id !== a.id),
  ];
  for (const s of wronged) {
    if (s.location != null && (s.location === a.location || s.location === b.location)) h += 0.012;
    h += intrigueApt(s) * 0.006;
  }
  h += Math.max(0, a.personality.volatility + b.personality.volatility) * 0.006;
  h -= (intrigueApt(a) + intrigueApt(b)) * 0.004;
  if (a.location !== b.location) h -= 0.008;
  return clamp(h, 0.004, 0.08);
}

/** The affair gutters out; the bond cools to something quieter. */
export function endAffairQuietly(world: World, a: Person, b: Person): void {
  delete a.flags[F.affairEvPrefix + b.id];
  delete b.flags[F.affairEvPrefix + a.id];
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const rel = getRelation(world, x.id, y.id);
    if (rel && rel.kind === "lover") {
      rel.kind = "friend";
      rel.opinion = Math.min(rel.opinion, 30);
    }
    delete x.flags[F.romanceEvPrefix + y.id];
  }
}

/**
 * affair-discovered, importance 22, causes = [the secret affair event].
 * Reveals the secret, breaks hearts, sets divorces in motion, and can
 * ignite a feud between noble houses.
 */
export function discoverAffair(
  ctx: Ctx,
  a: Person,
  b: Person,
  affairEv: EventId,
): EventRecord {
  const world = ctx.world;
  revealEvent(world, affairEv, world.now);
  const betrayedOfA = activeSpouses(world, a).filter((s) => s.id !== b.id);
  const betrayedOfB = activeSpouses(world, b).filter((s) => s.id !== a.id);
  const betrayed = [...betrayedOfA, ...betrayedOfB].sort((x, y) => x.id - y.id);

  const participants: Record<string, PersonId> = { a: a.id, b: b.id };
  betrayed.forEach((s, i) => {
    participants[i === 0 ? "betrayed" : `betrayed${i + 1}`] = s.id;
  });

  const howRng = ctx.rng.fork("social", "affair-found-how", a.id, b.id);
  const ev = ctx.record({
    type: "affair-discovered",
    date: world.now,
    participants,
    // how: the manner of discovery.
    data: { how: howRng.pick(DISCOVERIES) },
    ...pairWhereabouts(world, a, b),
    importance: 22,
    causes: [affairEv],
    storyline: null,
    secret: false,
  });

  for (const s of betrayed) {
    const unfaithful = betrayedOfA.some((x) => x.id === s.id) ? a : b;
    const paramour = unfaithful.id === a.id ? b : a;
    adjustOpinion(world, s.id, unfaithful.id, -60);
    adjustOpinion(world, s.id, paramour.id, -40);
    addMemory(world, s.id, { event: ev.id, weight: 4, about: unfaithful.id, feeling: -0.9 });
    addMemory(world, s.id, { event: ev.id, weight: 3, about: paramour.id, feeling: -0.85 });
    const forgiveRng = ctx.rng.fork("social", "forgive", s.id, ev.id);
    const opNow = getOpinion(world, s.id, unfaithful.id);
    const forgiveP = clamp(
      0.04 +
        s.personality.compassion * 0.22 +
        opNow / 400 -
        Math.max(0, s.personality.wrath) * 0.08,
      0,
      0.35,
    );
    if (!forgiveRng.chance(forgiveP)) {
      s.flags[F.divorcePending] = unfaithful.id;
    }
    if (s.house != null && paramour.house != null && s.house !== paramour.house) {
      bumpFeud(ctx, s.house, paramour.house, 0.22, ev.id);
    }
  }

  // The lovers, dragged into the light: shame, strain, and an end to hiding.
  addMemory(world, a.id, { event: ev.id, weight: 2, about: null, feeling: -0.6 });
  addMemory(world, b.id, { event: ev.id, weight: 2, about: null, feeling: -0.6 });
  adjustOpinion(world, a.id, b.id, -8);
  adjustOpinion(world, b.id, a.id, -8);
  delete a.flags[F.affairEvPrefix + b.id];
  delete b.flags[F.affairEvPrefix + a.id];
  return ev;
}
