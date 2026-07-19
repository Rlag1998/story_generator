/**
 * Trade: the gentler weather of the material world. Ports and towns catch
 * booms (a season of full purses for the merchants there), and now and then
 * a road is laid between two prosperous neighboring regions, binding them
 * together for good and ill (roads carry wool, and plague).
 */

import type { Rng } from "../core/rng";
import { monthOf } from "../core/time";
import type { Ctx, Region, RegionId, Settlement } from "../core/types";
import { sortedIds } from "../core/world";
import { setBoom } from "./conditions";
import { bumpWealth, pickWeightedPeople, residentsByProfession, settlementsOfRegion } from "./helpers";
import { waresPhrase } from "./names";
import { COND, type EconState, hasRoad, roadKey } from "./state";

/** Monthly boom chance per eligible settlement (before modifiers). */
const P_BOOM = 0.0015;
/** Months between booms in the same settlement. */
const BOOM_COOLDOWN = 84;
/** Month of the yearly road survey. */
const ROAD_MONTH = 5;
/** Yearly chance per qualifying adjacent pair of prosperous regions. */
const P_ROAD = 0.05;

export function tradeTick(ctx: Ctx, state: EconState): void {
  boomsTick(ctx, state);
  if (monthOf(ctx.world.now) === ROAD_MONTH) roadsTick(ctx, state);
}

// ---------------------------------------------------------------------------
// Booms
// ---------------------------------------------------------------------------

function boomsTick(ctx: Ctx, state: EconState): void {
  const { world } = ctx;
  const rng = ctx.rng.fork("econ", "boom");
  for (const sid of sortedIds(world.settlements)) {
    const s = world.settlements.get(sid)!;
    if (s.kind !== "port" && s.kind !== "town" && s.kind !== "city") continue;
    if (s.conditions[COND.boom]) continue;
    const lastEnd = state.boomUntil[String(sid)] ?? 0;
    if (lastEnd > 0 && world.now - lastEnd < BOOM_COOLDOWN) continue;
    const region = world.regions.get(s.region);
    const roaded = region ? region.adjacent.some((n) => hasRoad(state, s.region, n)) : false;
    let p = P_BOOM;
    if (roaded) p += 0.0015;
    if (s.conditions[COND.plenty]) p += 0.001;
    if (s.kind === "port") p += 0.0005; // the sea brings strangers and silver
    if (!rng.fork("roll", sid).chance(p)) continue;

    startBoom(ctx, state, s, rng.fork("boom", sid));
  }
}

/** Begin a trade boom now. Exported for tests. */
export function startBoom(ctx: Ctx, state: EconState, s: Settlement, rng: Rng): void {
  const { world } = ctx;
  const months = rng.fork("months").intIn(12, 24);
  setBoom(state, s, world.now + months);

  const wares = waresPhrase(rng.fork("wares"), s.economy);
  ctx.record({
    type: "trade-boom",
    date: world.now,
    participants: {},
    // data: { wares ("wool and salt"), months the boom runs }.
    data: { wares, months },
    location: s.id,
    region: s.region,
    importance: 12,
    causes: [],
    storyline: null,
    secret: false,
  });

  // Full purses for the people who buy cheap and sell dear.
  const merchants = residentsByProfession(world, s.id, ["merchant", "peddler", "innkeeper"]).filter(
    (p) => p.status.wealth < 5,
  );
  const lucky = pickWeightedPeople(rng.fork("lucky"), merchants, () => 1, Math.min(4, merchants.length));
  for (const p of lucky) {
    if (rng.fork("bump", p.id).chance(0.7)) bumpWealth(p, +1);
  }
}

// ---------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------

function prosperous(ctx: Ctx, region: Region): boolean {
  const { world } = ctx;
  for (const s of settlementsOfRegion(world, region)) {
    if (s.conditions[COND.boom] || s.conditions[COND.plenty]) return true;
    if ((s.kind === "town" || s.kind === "city" || s.kind === "port") && s.abstractPop >= 350)
      return true;
  }
  return false;
}

function roadsTick(ctx: Ctx, state: EconState): void {
  const { world } = ctx;
  const rng = ctx.rng.fork("econ", "roads");

  // All adjacent pairs (a < b), ascending, at most one road laid per year.
  const pairs: [RegionId, RegionId][] = [];
  for (const rid of sortedIds(world.regions)) {
    const region = world.regions.get(rid)!;
    for (const n of [...region.adjacent].sort((x, y) => x - y)) {
      if (n > rid && world.regions.has(n)) pairs.push([rid, n]);
    }
  }
  for (const [a, b] of pairs) {
    if (hasRoad(state, a, b)) continue;
    const ra = world.regions.get(a)!;
    const rb = world.regions.get(b)!;
    if (!prosperous(ctx, ra) || !prosperous(ctx, rb)) continue;
    if (!rng.fork("roll", a, b).chance(P_ROAD)) continue;

    state.roads.push(roadKey(a, b));
    ctx.record({
      type: "road-built",
      date: world.now,
      participants: {},
      // data: { from, to: RegionId, name of the road }.
      data: { from: a, to: b, name: `the high road between ${ra.name} and ${rb.name}` },
      location: null,
      region: a,
      importance: 10,
      causes: [],
      storyline: null,
      secret: false,
    });
    return; // one great work a year is plenty
  }
}
