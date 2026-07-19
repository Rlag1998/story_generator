/**
 * The monthly heartbeat: life-stage transitions, careers, health, death,
 * pregnancy, emigration pressure near the population cap, and the
 * occasional move for work.
 */

import type { Ctx, Person, Settlement, SettlementId, World } from "../core/types";
import type { Rng } from "../core/rng";
import { monthsBetween } from "../core/time";
import { livingIds } from "../core/world";
import {
  F,
  adulthoodAgeOf,
  ageOf,
  capRatio,
  clamp,
  cultureOf,
  isMarried,
  livingPerson,
  localConditions,
  settlementOf,
  traditionFor,
  whereabouts,
} from "./helpers";
import { monthlyDeathHazard, pickDeathCause } from "./hazard";
import { healthTick, injuryTick } from "./health";
import { careerTick } from "./careers";
import { pregnancyTick } from "./fertility";
import { kill } from "./death";

export function peopleTick(ctx: Ctx): void {
  const world = ctx.world;
  const ids = livingIds(world);
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p || p.died !== null || !world.alive.has(id)) continue;
    const rng = ctx.rng.fork("people", id);
    const culture = cultureOf(world, p);
    const settlement = settlementOf(world, p);
    const conds = localConditions(settlement);

    comingOfAge(ctx, p, rng.fork("majority"));
    careerTick(ctx, p, rng.fork("career"), settlement, culture);

    healthTick(ctx, p, rng.fork("health"), settlement, conds);
    injuryTick(ctx, p, rng.fork("work"));
    if (p.died !== null) continue;

    pregnancyTick(ctx, p, rng.fork("womb"), settlement, conds);
    if (p.died !== null) continue;

    // The reaper's monthly visit.
    const breakdown = monthlyDeathHazard(world, p, conds);
    const reaper = rng.fork("reaper");
    if (reaper.chance(breakdown.total)) {
      const cause = pickDeathCause(reaper.fork("cause"), breakdown, ageOf(world, p), conds);
      kill(ctx, p, cause);
      continue;
    }

    movesTick(ctx, p, rng.fork("roads"), settlement);
  }
}

// ---------------------------------------------------------------------------
// Coming of age
// ---------------------------------------------------------------------------

function comingOfAge(ctx: Ctx, p: Person, rng: Rng): void {
  const world = ctx.world;
  const adulthood = adulthoodAgeOf(world, p);
  if (monthsBetween(p.born, world.now) !== adulthood * 12) return;
  const culture = cultureOf(world, p);
  const rite = traditionFor(culture, "coming-of-age", rng.fork("rite"));
  const rank = p.status.rank;
  const importance = clamp(6 + (rank >= 4 ? 4 : rank >= 3 ? 2 : rank === 2 ? 1 : 0), 6, 10);
  const data: Record<string, unknown> = { ageYears: adulthood };
  if (rite) {
    data.rite = rite.name;
    data.riteKey = rite.key;
  }
  ctx.record({
    type: "coming-of-age",
    date: world.now,
    participants: { subject: p.id },
    data,
    ...whereabouts(world, p),
    importance,
    causes: [],
    storyline: null,
    secret: false,
  });
}

// ---------------------------------------------------------------------------
// Emigration & relocation
// ---------------------------------------------------------------------------

/** Professions whose feet itch: likelier to move for work. */
const WANDERING_TRADES = new Set(["peddler", "bard", "sailor", "soldier", "servant", "mason"]);

function movesTick(ctx: Ctx, p: Person, rng: Rng, settlement: Settlement | null): void {
  const world = ctx.world;
  const age = ageOf(world, p);
  const adulthood = adulthoodAgeOf(world, p);

  // Emigration pressure: when the land is full, the young and unbound leave.
  const ratio = capRatio(world);
  if (
    ratio > 0.92 &&
    age >= adulthood &&
    age <= 32 &&
    p.status.rank <= 2 &&
    !isMarried(p) &&
    p.betrothed === null &&
    p.pregnancy === null &&
    !hasLivingMinorChildren(ctx, p)
  ) {
    const pLeave = (ratio - 0.92) * 0.12;
    if (rng.fork("emigrate").chance(pLeave)) {
      emigrate(ctx, p);
      return;
    }
  }

  // Restless feet: a rare move to a nearby settlement for work.
  if (age >= adulthood && age <= 40 && !isMarried(p) && p.betrothed === null) {
    const base = WANDERING_TRADES.has(p.status.profession) ? 0.002 : 0.0005;
    const roll = rng.fork("move");
    if (roll.chance(base)) {
      const dest = pickNearbySettlement(world, settlement, roll.fork("dest"));
      if (dest != null && dest !== p.location) {
        const from = p.location;
        p.location = dest;
        ctx.record({
          type: "moved",
          date: world.now,
          participants: { subject: p.id },
          data: { from, to: dest, reason: "work" },
          location: dest,
          region: world.settlements.get(dest)?.region ?? null,
          importance: 2,
          causes: [],
          storyline: null,
          secret: false,
        });
      }
    }
  }
}

function hasLivingMinorChildren(ctx: Ctx, p: Person): boolean {
  for (const cid of p.children) {
    const c = livingPerson(ctx.world, cid);
    if (c && ageOf(ctx.world, c) < adulthoodAgeOf(ctx.world, c)) return true;
  }
  return false;
}

function emigrate(ctx: Ctx, p: Person): void {
  const world = ctx.world;
  const from = p.location;
  const fromRegion = from != null ? (world.settlements.get(from)?.region ?? null) : null;
  // Gone beyond the map's edge: alive somewhere, but not here.
  p.flags[F.emigrated] = true;
  p.location = null;
  world.alive.delete(p.id);
  ctx.record({
    type: "emigrated",
    date: world.now,
    participants: { subject: p.id },
    data: { from },
    location: from,
    region: fromRegion,
    importance: 5,
    causes: [],
    storyline: null,
    secret: false,
  });
}

function pickNearbySettlement(
  world: World,
  settlement: Settlement | null,
  rng: Rng,
): SettlementId | null {
  if (!settlement) return null;
  const region = world.regions.get(settlement.region);
  if (!region) return null;
  const candidates: SettlementId[] = [];
  for (const sid of region.settlements) {
    if (sid !== settlement.id) candidates.push(sid);
  }
  for (const rid of region.adjacent) {
    const r = world.regions.get(rid);
    if (r) candidates.push(...r.settlements);
  }
  if (candidates.length === 0) return null;
  return rng.pick(candidates);
}
