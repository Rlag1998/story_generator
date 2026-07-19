/**
 * The marriage market: honoring betrothals (including political ones),
 * arranged matches among the high-born, courtship among commoners, kin and
 * inbreeding avoidance, rank homogamy with rare love matches, elite
 * polygyny, handfast renewal customs, widow remarriage, and divorce.
 */

import type {
  Ctx,
  Culture,
  EventId,
  Person,
  PersonId,
  Sex,
  World,
} from "../core/types";
import type { Rng } from "../core/rng";
import { livingIds } from "../core/world";
import {
  F,
  activeMarriages,
  adulthoodAgeOf,
  ageOf,
  clamp,
  cultureOf,
  isMarried,
  livingPerson,
  numFlag,
  traditionFor,
  whereabouts,
} from "./helpers";
import { loversOf } from "./fertility";

const HANDFAST_TERM = 84; // seven years, in months

export function marriageTick(ctx: Ctx): void {
  const world = ctx.world;
  const ids = livingIds(world);

  processDivorces(ctx, ids);
  honorBetrothals(ctx, ids);

  const pool = buildSinglesPool(ctx, ids);
  const taken = new Set<PersonId>();

  arrangedMatches(ctx, pool, taken);
  commonerCourtship(ctx, pool, taken);
  polygynyMatches(ctx, ids, pool, taken);
  handfastRenewals(ctx, ids);
}

// ---------------------------------------------------------------------------
// Divorce
// ---------------------------------------------------------------------------

function processDivorces(ctx: Ctx, ids: PersonId[]): void {
  const world = ctx.world;
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p || p.died !== null) continue;
    const flag = p.flags[F.divorcePending];
    if (flag === undefined || flag === false) continue;
    const spouseId =
      typeof flag === "number" ? flag : (activeMarriages(p)[0]?.spouse ?? null);
    delete p.flags[F.divorcePending];
    if (spouseId == null) continue;
    const spouse = world.people.get(spouseId);
    const marriage = p.marriages.find((m) => m.active && m.spouse === spouseId);
    if (!marriage) continue;
    endMarriage(world, p, spouseId, "divorce");
    if (spouse) delete spouse.flags[F.divorcePending];
    const reason = typeof flag === "string" ? flag : "the union soured beyond mending";
    ctx.record({
      type: "divorce",
      date: world.now,
      participants: { a: p.id, b: spouseId },
      data: { reason },
      ...whereabouts(world, p),
      importance: 15,
      causes: [],
      storyline: null,
      secret: false,
    });
    // A short season apart before either weds again.
    p.flags[F.mourningUntil] = world.now + 10;
    if (spouse && spouse.died === null) spouse.flags[F.mourningUntil] = world.now + 10;
  }
}

function endMarriage(world: World, p: Person, spouseId: PersonId, reason: "divorce"): void {
  for (const m of p.marriages) {
    if (m.active && m.spouse === spouseId) {
      m.active = false;
      m.endDate = world.now;
      m.endReason = reason;
    }
  }
  const spouse = world.people.get(spouseId);
  if (spouse) {
    for (const m of spouse.marriages) {
      if (m.active && m.spouse === p.id) {
        m.active = false;
        m.endDate = world.now;
        m.endReason = reason;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Betrothals -> weddings
// ---------------------------------------------------------------------------

function honorBetrothals(ctx: Ctx, ids: PersonId[]): void {
  const world = ctx.world;
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p || p.died !== null || p.betrothed === null) continue;
    if (p.id > p.betrothed) continue; // each pair once, driven by the lower id
    const q = livingPerson(world, p.betrothed);
    if (!q || q.betrothed !== p.id) {
      // A betrothal to the dead or the vanished quietly dissolves.
      p.betrothed = null;
      delete p.flags[F.wedAfter];
      delete p.flags[F.betrothalEvent];
      continue;
    }
    if (!ofWeddingAge(world, p) || !ofWeddingAge(world, q)) continue;
    const waitP = numFlag(p, F.wedAfter);
    const waitQ = numFlag(q, F.wedAfter);
    const wait = Math.max(waitP ?? 0, waitQ ?? 0);
    if (world.now < wait) continue;
    const bride = p.sex === "f" ? p : q;
    const groom = p.sex === "f" ? q : p;
    if (bride.sex === groom.sex) {
      // Malformed betrothal (defensive); dissolve it.
      p.betrothed = null;
      q.betrothed = null;
      continue;
    }
    wed(ctx, bride, groom, ctx.rng.fork("wed", p.id), {
      loveMatch: p.flags[F.loveMatch] === true || q.flags[F.loveMatch] === true,
    });
  }
}

function ofWeddingAge(world: World, p: Person): boolean {
  const age = ageOf(world, p);
  const adulthood = adulthoodAgeOf(world, p);
  const culture = cultureOf(world, p);
  const floor = Math.max(
    adulthood,
    (p.sex === "f" ? (culture?.marriageAgeF ?? 18) : (culture?.marriageAgeM ?? 20)) - 1,
  );
  return age >= floor;
}

// ---------------------------------------------------------------------------
// The wedding itself
// ---------------------------------------------------------------------------

interface WedOpts {
  loveMatch?: boolean;
  arranged?: boolean;
}

function wed(ctx: Ctx, bride: Person, groom: Person, rng: Rng, opts?: WedOpts): void {
  const world = ctx.world;
  bride.marriages.push({ spouse: groom.id, date: world.now, active: true });
  groom.marriages.push({ spouse: bride.id, date: world.now, active: true });

  // Residence: the bride joins the groom's hearth, unless descent runs
  // through mothers, in which case he crosses her threshold instead.
  const culture = cultureOf(world, bride) ?? cultureOf(world, groom);
  if (culture?.descent === "matrilineal") {
    if (bride.location != null) groom.location = bride.location;
  } else if (groom.location != null) {
    bride.location = groom.location;
  }

  const causes: EventId[] = [];
  for (const ev of [numFlag(bride, F.betrothalEvent), numFlag(groom, F.betrothalEvent)]) {
    if (ev !== null && !causes.includes(ev)) causes.push(ev);
  }

  const rite = traditionFor(culture, "wedding", rng.fork("rite"));
  const topRank = Math.max(bride.status.rank, groom.status.rank);
  let importance = 10 + (topRank >= 5 ? 6 : topRank === 4 ? 4 : topRank === 3 ? 2 : 0);
  if (opts?.loveMatch) importance += 1;
  importance = clamp(importance, 10, 16);

  const data: Record<string, unknown> = {};
  if (rite) {
    data.rite = rite.name;
    data.riteKey = rite.key;
  }
  if (opts?.loveMatch) data.loveMatch = true;
  if (opts?.arranged) data.arranged = true;

  ctx.record({
    type: "wedding",
    date: world.now,
    participants: { bride: bride.id, groom: groom.id },
    data,
    ...whereabouts(world, groom.location != null ? groom : bride),
    importance,
    causes,
    storyline: null,
    secret: false,
  });

  for (const p of [bride, groom]) {
    if (p.betrothed === (p === bride ? groom.id : bride.id)) p.betrothed = null;
    delete p.flags[F.wedAfter];
    delete p.flags[F.betrothalEvent];
    delete p.flags[F.mourningUntil];
    const c = cultureOf(world, p);
    if (c?.marriage === "handfast-renewal") p.flags[F.handfastDue] = world.now + HANDFAST_TERM;
  }
}

// ---------------------------------------------------------------------------
// Singles pool
// ---------------------------------------------------------------------------

interface SinglesPool {
  f: PersonId[];
  m: PersonId[];
}

function marriageEligible(world: World, p: Person): boolean {
  if (p.died !== null) return false;
  if (isMarried(p) || p.betrothed !== null) return false;
  if (p.flags[F.emigrated] === true) return false;
  // The absent (vanished, wandering, fled) are off the market until they
  // walk back into the world.
  if (p.location === null) return false;
  const mourning = numFlag(p, F.mourningUntil);
  if (mourning !== null && world.now < mourning) return false;
  // Celibate clergy stand apart from the market (their scandals are affairs).
  if (p.status.profession === "priest" || p.status.profession === "monastic") {
    const rel = world.religions.get(p.religion);
    if (rel?.clergyCelibate) return false;
  }
  const age = ageOf(world, p);
  if (!ofWeddingAge(world, p)) return false;
  if (p.sex === "f" && age > 50) return false;
  if (p.sex === "m" && age > 62) return false;
  return true;
}

function buildSinglesPool(ctx: Ctx, ids: PersonId[]): SinglesPool {
  const world = ctx.world;
  const pool: SinglesPool = { f: [], m: [] };
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p || !marriageEligible(world, p)) continue;
    pool[p.sex].push(id);
  }
  return pool;
}

// ---------------------------------------------------------------------------
// Kin & inbreeding gates
// ---------------------------------------------------------------------------

/**
 * Returns true if the pair may marry. Close kin never wed. Beyond that,
 * high inbreeding bars commoners outright; noble families sometimes look
 * the other way for a cousin's dowry (drama fuel, not wisdom).
 */
function bloodPermits(ctx: Ctx, a: Person, b: Person, rng: Rng): boolean {
  if (ctx.services.social.closeKin(ctx.world, a.id, b.id)) return false;
  const motherId = a.sex === "f" ? a.id : b.id;
  const fatherId = a.sex === "f" ? b.id : a.id;
  const f = ctx.services.genetics.inbreeding(ctx.world, motherId, fatherId);
  if (f > 0.0625) {
    const noble = a.status.rank >= 3 || b.status.rank >= 3;
    if (!noble) return false;
    return rng.chance(0.25); // sometimes tolerated among the great houses
  }
  return true;
}

// ---------------------------------------------------------------------------
// Arranged matches (rank >= 3)
// ---------------------------------------------------------------------------

function arrangedMatches(ctx: Ctx, pool: SinglesPool, taken: Set<PersonId>): void {
  const world = ctx.world;
  const seekers = [...pool.f, ...pool.m]
    .filter((id) => (world.people.get(id)?.status.rank ?? 0) >= 3)
    .sort((a, b) => a - b);
  for (const id of seekers) {
    if (taken.has(id)) continue;
    const p = world.people.get(id)!;
    const rng = ctx.rng.fork("arrange", id);
    if (!rng.chance(0.07)) continue;
    const otherPool = p.sex === "f" ? pool.m : pool.f;
    const candidates: Person[] = [];
    const weights: number[] = [];
    for (const cid of otherPool) {
      if (taken.has(cid) || cid === id) continue;
      const c = world.people.get(cid)!;
      if (Math.abs(c.status.rank - p.status.rank) > 1) continue;
      let w = 1;
      if (c.status.rank === p.status.rank) w *= 2.2;
      if (p.house !== null && c.house === p.house) w *= 0.1; // wed outward
      w *= ageGapWeight(world, p, c);
      if (c.culture !== p.culture) w *= 0.3;
      if (c.religion !== p.religion) w *= 0.3;
      if (w > 0.005) {
        candidates.push(c);
        weights.push(w);
      }
    }
    if (candidates.length === 0) continue;
    const match = rng.weighted(candidates, weights);
    if (!bloodPermits(ctx, p, match, rng.fork("blood"))) continue;

    const bride = p.sex === "f" ? p : match;
    const groom = p.sex === "f" ? match : p;
    const ev = ctx.record({
      type: "betrothal",
      date: world.now,
      participants: { bride: bride.id, groom: groom.id },
      data: { arranged: true },
      ...whereabouts(world, p),
      importance: p.status.rank >= 5 || match.status.rank >= 5 ? 10 : 8,
      causes: [],
      storyline: null,
      secret: false,
    });
    p.betrothed = match.id;
    match.betrothed = p.id;
    const wait = world.now + rng.fork("wait").intIn(6, 24); // half a year to two
    p.flags[F.wedAfter] = wait;
    match.flags[F.wedAfter] = wait;
    p.flags[F.betrothalEvent] = ev.id;
    match.flags[F.betrothalEvent] = ev.id;
    taken.add(p.id);
    taken.add(match.id);
  }
}

// ---------------------------------------------------------------------------
// Commoner courtship
// ---------------------------------------------------------------------------

function commonerCourtship(ctx: Ctx, pool: SinglesPool, taken: Set<PersonId>): void {
  const world = ctx.world;
  // Women drive the pass (one side must, for determinism); lovers first.
  for (const id of pool.f) {
    if (taken.has(id)) continue;
    const w = world.people.get(id)!;
    if (w.status.rank >= 3) continue; // the arranged pass handles the great
    const rng = ctx.rng.fork("court", id);

    // An established lover is the likeliest match of all.
    const lovers = loversOf(ctx, w).filter(
      (l) => !taken.has(l.id) && marriageEligible(world, l) && l.sex === "m",
    );
    if (lovers.length > 0 && rng.fork("lover-wed").chance(0.25)) {
      const lover = lovers[0];
      const crossRank = Math.abs(lover.status.rank - w.status.rank) >= 2;
      if (crossRank && !rng.fork("cross").chance(0.3)) {
        // The families forbid it, this month at least.
      } else if (bloodPermits(ctx, w, lover, rng.fork("blood"))) {
        if (crossRank) {
          w.flags[F.loveMatch] = true;
          lover.flags[F.loveMatch] = true;
        }
        wed(ctx, w, lover, rng.fork("wedding"), { loveMatch: true });
        taken.add(w.id);
        taken.add(lover.id);
        continue;
      }
    }

    // Otherwise: does she (and her kin) go looking this month?
    const culture = cultureOf(world, w);
    const age = ageOf(world, w);
    let seek = 0.055;
    if (age > (culture?.marriageAgeF ?? 18) + 4) seek += 0.035;
    if (!rng.fork("seek").chance(seek)) continue;

    const candidates: Person[] = [];
    const weights: number[] = [];
    for (const cid of pool.m) {
      if (taken.has(cid)) continue;
      const c = world.people.get(cid)!;
      let weight = 1;
      const rankDiff = Math.abs(c.status.rank - w.status.rank);
      if (rankDiff === 0) weight *= 2.5;
      else if (rankDiff === 1) weight *= 1;
      else weight *= 0.03; // a love across stations is rare indeed
      if (c.location != null && c.location === w.location) weight *= 3;
      else if (
        c.location != null &&
        w.location != null &&
        world.settlements.get(c.location)?.region === world.settlements.get(w.location)?.region
      ) {
        weight *= 1.2;
      } else {
        weight *= 0.2;
      }
      weight *= ageGapWeight(world, w, c);
      if (c.culture !== w.culture) {
        weight *= 0.15 + 0.5 * (culture?.attitudes.openness ?? 0.3);
      }
      if (c.religion !== w.religion) weight *= 0.35;
      const opinion = ctx.services.social.getOpinion(world, w.id, c.id);
      weight *= opinion >= 0 ? 1 + opinion / 50 : Math.max(0.2, 1 + opinion / 150);
      if (weight > 0.004) {
        candidates.push(c);
        weights.push(weight);
      }
    }
    if (candidates.length === 0) continue;
    const match = rng.fork("pick").weighted(candidates, weights);
    const crossRank = Math.abs(match.status.rank - w.status.rank) >= 2;
    if (crossRank && !rng.fork("cross-pick").chance(0.3)) continue;
    if (!bloodPermits(ctx, w, match, rng.fork("blood-pick"))) continue;

    if (crossRank) {
      w.flags[F.loveMatch] = true;
      match.flags[F.loveMatch] = true;
    }
    // A short courtship, then the wedding (no betrothal event for commoners).
    w.betrothed = match.id;
    match.betrothed = w.id;
    const wait = world.now + rng.fork("courtship").intIn(2, 8);
    w.flags[F.wedAfter] = wait;
    match.flags[F.wedAfter] = wait;
    taken.add(w.id);
    taken.add(match.id);
  }
}

/** Preference over the groom-minus-bride age gap, centered per culture. */
function ageGapWeight(world: World, a: Person, b: Person): number {
  const bride = a.sex === "f" ? a : b;
  const groom = a.sex === "f" ? b : a;
  const culture = cultureOf(world, bride);
  const ideal = (culture?.marriageAgeM ?? 21) - (culture?.marriageAgeF ?? 18);
  const gap = ageOf(world, groom) - ageOf(world, bride);
  const d = gap - ideal;
  return Math.exp(-(d * d) / 32);
}

// ---------------------------------------------------------------------------
// Elite polygyny
// ---------------------------------------------------------------------------

function polygynyMatches(
  ctx: Ctx,
  ids: PersonId[],
  pool: SinglesPool,
  taken: Set<PersonId>,
): void {
  const world = ctx.world;
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p || p.died !== null || p.sex !== "m") continue;
    const culture = cultureOf(world, p);
    if (culture?.marriage !== "polygyny-elite") continue;
    if (p.status.rank < 4) continue;
    if (activeMarriages(p).length !== 1) continue; // up to two wives
    const rng = ctx.rng.fork("polygyny", id);
    if (!rng.chance(0.0035)) continue;
    const candidates: Person[] = [];
    const weights: number[] = [];
    for (const cid of pool.f) {
      if (taken.has(cid)) continue;
      const c = world.people.get(cid)!;
      if (c.status.rank < 2) continue;
      let weight = 1 + c.status.rank;
      weight *= ageGapWeight(world, c, p);
      if (c.culture !== p.culture) weight *= 0.2;
      if (weight > 0.01) {
        candidates.push(c);
        weights.push(weight);
      }
    }
    if (candidates.length === 0) continue;
    const match = rng.fork("pick").weighted(candidates, weights);
    if (!bloodPermits(ctx, match, p, rng.fork("blood"))) continue;
    const ev = ctx.record({
      type: "betrothal",
      date: world.now,
      participants: { bride: match.id, groom: p.id },
      data: { arranged: true, secondWife: true },
      ...whereabouts(world, p),
      importance: 8,
      causes: [],
      storyline: null,
      secret: false,
    });
    // The second bride is betrothed; the groom keeps his marriage and takes
    // her by the betrothal-honoring pass once the wait passes.
    match.betrothed = p.id;
    p.betrothed = match.id;
    const wait = world.now + rng.fork("wait").intIn(4, 12);
    match.flags[F.wedAfter] = wait;
    p.flags[F.wedAfter] = wait;
    match.flags[F.betrothalEvent] = ev.id;
    p.flags[F.betrothalEvent] = ev.id;
    taken.add(match.id);
  }
}

// ---------------------------------------------------------------------------
// Handfast renewal
// ---------------------------------------------------------------------------

function handfastRenewals(ctx: Ctx, ids: PersonId[]): void {
  const world = ctx.world;
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p || p.died !== null) continue;
    const culture = cultureOf(world, p);
    if (culture?.marriage !== "handfast-renewal") continue;
    const due = numFlag(p, F.handfastDue);
    if (due === null || world.now < due) continue;
    const marriage = activeMarriages(p)[0];
    if (!marriage) {
      delete p.flags[F.handfastDue];
      continue;
    }
    if (p.id > marriage.spouse) continue; // one decision per pair
    const spouse = world.people.get(marriage.spouse);
    if (!spouse || spouse.died !== null) continue;
    const rng = ctx.rng.fork("handfast", id);
    const opinionAB = ctx.services.social.getOpinion(world, p.id, spouse.id);
    const opinionBA = ctx.services.social.getOpinion(world, spouse.id, p.id);
    const together = p.children.filter((c) => spouse.children.includes(c)).length;
    const renewP = clamp(0.55 + (opinionAB + opinionBA) / 300 + together * 0.08, 0.15, 0.97);
    if (rng.chance(renewP)) {
      // The cords are bound again, quietly, for seven more years.
      p.flags[F.handfastDue] = world.now + HANDFAST_TERM;
      spouse.flags[F.handfastDue] = world.now + HANDFAST_TERM;
    } else {
      endMarriage(world, p, spouse.id, "divorce");
      delete p.flags[F.handfastDue];
      delete spouse.flags[F.handfastDue];
      ctx.record({
        type: "divorce",
        date: world.now,
        participants: { a: p.id, b: spouse.id },
        data: { reason: "the handfast lapsed unrenewed", kind: "handfast-lapsed" },
        ...whereabouts(world, p),
        importance: 8,
        causes: [],
        storyline: null,
        secret: false,
      });
      p.flags[F.mourningUntil] = world.now + 8;
      spouse.flags[F.mourningUntil] = world.now + 8;
    }
  }
}
