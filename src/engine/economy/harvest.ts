/**
 * The autumn harvest: each year in month 9 every region's fields are
 * judged. Weather is shared: a world-wide sky roll blends with each
 * region's own luck and its neighbors' (a deterministic cluster roll),
 * so bad years sweep whole marches rather than dotting the map at random.
 *
 * Outcomes: bountiful / normal / poor / famine. Poor years stack, and a
 * region already hungry slides toward famine. Famine sets settlement
 * conditions the people module reads for mortality; only the onset is
 * chronicled, the recovery is silent.
 */

import type { Rng } from "../core/rng";
import { monthOf } from "../core/time";
import type { Biome, Ctx, Region, RegionId } from "../core/types";
import { sortedIds } from "../core/world";
import { setFamine, setLean, setPlenty } from "./conditions";
import { bumpWealth, clamp, pickWeightedPeople, residentsOf, settlementsOfRegion } from "./helpers";
import { type EconState, type HarvestOutcome, regionHarvest } from "./state";

export const HARVEST_MONTH = 9;

/** Mean shift and variance multiplier per biome: marsh/steppe farm hard. */
const BIOME_WEATHER: Record<Biome, { shift: number; varMult: number }> = {
  plains: { shift: 0.15, varMult: 1.0 },
  forest: { shift: 0.05, varMult: 1.0 },
  hills: { shift: 0.0, varMult: 1.05 },
  coast: { shift: -0.05, varMult: 1.1 },
  highlands: { shift: -0.08, varMult: 1.1 },
  mountains: { shift: -0.15, varMult: 1.15 },
  steppe: { shift: -0.22, varMult: 1.35 },
  marsh: { shift: -0.25, varMult: 1.3 },
};

/** Thresholds on the blended weather score. */
const BOUNTIFUL_AT = 1.05;
const POOR_BELOW = -0.9;
const FAMINE_BELOW = -1.6;

/** Extra downward shift per consecutive poor year (capped: no death spiral). */
const STREAK_PENALTY = 0.25;
const STREAK_CAP = 3;

/** Classify one region's year from the shared weather field. */
export function classifyHarvest(
  region: Region,
  rawNoise: Map<RegionId, number>,
  global: number,
  poorStreak: number,
): HarvestOutcome {
  const weather = BIOME_WEATHER[region.biome];
  const own = (rawNoise.get(region.id) ?? 0) * weather.varMult;
  const neighborIds = [...region.adjacent].sort((a, b) => a - b);
  let neighborAvg = 0;
  if (neighborIds.length > 0) {
    let sum = 0;
    let n = 0;
    for (const nid of neighborIds) {
      const v = rawNoise.get(nid);
      if (v !== undefined) {
        sum += v;
        n++;
      }
    }
    if (n > 0) neighborAvg = sum / n;
  }
  const score =
    global * 0.5 +
    own * 0.55 +
    neighborAvg * 0.3 +
    weather.shift -
    STREAK_PENALTY * Math.min(STREAK_CAP, poorStreak);
  if (score >= BOUNTIFUL_AT) return "bountiful";
  if (score < FAMINE_BELOW) return "famine";
  if (score < POOR_BELOW) return "poor";
  return "normal";
}

export function harvestTick(ctx: Ctx, state: EconState): void {
  const { world } = ctx;
  if (monthOf(world.now) !== HARVEST_MONTH) return;
  const rng = ctx.rng.fork("econ", "harvest");

  // One sky over the whole world this year, plus per-region luck. The raw
  // noise field is computed first (keyed by stable region ids) so each
  // region can blend in its neighbors' weather deterministically.
  const global = rng.fork("global").gaussian() * 0.5;
  const rawNoise = new Map<RegionId, number>();
  const regionIds = sortedIds(world.regions);
  for (const rid of regionIds) {
    rawNoise.set(rid, rng.fork("noise", rid).gaussian());
  }

  for (const rid of regionIds) {
    const region = world.regions.get(rid)!;
    if (region.settlements.length === 0) continue;
    const hist = regionHarvest(state, rid);
    const outcome = classifyHarvest(region, rawNoise, global, hist.poorStreak);
    hist.counts[outcome]++;
    hist.lastOutcome = outcome;
    const localRng = rng.fork("apply", rid);
    switch (outcome) {
      case "bountiful":
        hist.poorStreak = 0;
        applyBountiful(ctx, state, region, localRng);
        break;
      case "normal":
        hist.poorStreak = 0;
        recoverPop(ctx, state, region, 0.015);
        break;
      case "poor":
        applyPoor(ctx, state, region);
        hist.poorStreak++;
        break;
      case "famine":
        applyFamine(ctx, state, region, localRng, hist.poorStreak);
        // The famine is the release of the pressure: the dead need no bread,
        // the fields lie fallow-rested. The streak breaks.
        hist.poorStreak = 0;
        break;
    }
  }
}

/**
 * Good years let the unsimulated crowd drift back toward its founding size
 * (famine, fire and plague thin it; nothing else would ever restore it).
 */
function recoverPop(ctx: Ctx, state: EconState, region: Region, rate: number): void {
  for (const s of settlementsOfRegion(ctx.world, region)) {
    const key = String(s.id);
    if (state.basePop[key] === undefined) state.basePop[key] = s.abstractPop;
    const base = state.basePop[key];
    if (s.abstractPop < base) {
      s.abstractPop = Math.min(base, Math.round(s.abstractPop * (1 + rate)) + 1);
    }
  }
}

function applyBountiful(ctx: Ctx, state: EconState, region: Region, rng: Rng): void {
  const { world } = ctx;
  const until = world.now + rng.intIn(5, 7);
  recoverPop(ctx, state, region, 0.035);
  for (const s of settlementsOfRegion(world, region)) {
    setPlenty(state, s, until);
  }
  // Small wealth bumps for those who work the land and water.
  const growers = ["farmer", "herder", "fisher", "hunter"] as const;
  const pool = settlementsOfRegion(world, region)
    .flatMap((s) => residentsOf(world, s.id))
    .filter((p) => (growers as readonly string[]).includes(p.status.profession))
    .filter((p) => p.status.wealth < 5);
  const lucky = pickWeightedPeople(rng.fork("lucky"), pool, () => 1, Math.min(3, pool.length));
  for (const p of lucky) {
    if (rng.fork("bump", p.id).chance(0.6)) bumpWealth(p, +1);
  }
  ctx.record({
    type: "bountiful-harvest",
    date: world.now,
    participants: {},
    // data: { region } — the region whose fields overflowed.
    data: { region: region.id },
    location: null,
    region: region.id,
    importance: 8,
    causes: [],
    storyline: null,
    secret: false,
  });
}

function applyPoor(ctx: Ctx, state: EconState, region: Region): void {
  const { world } = ctx;
  // Lean stores through winter and spring; no chronicle entry (quiet dread).
  const until = world.now + 8;
  for (const s of settlementsOfRegion(world, region)) {
    setLean(state, s, until);
  }
}

function applyFamine(ctx: Ctx, state: EconState, region: Region, rng: Rng, streak: number): void {
  const { world } = ctx;
  const months = rng.fork("months").intIn(6, 12);
  const severity = clamp(0.45 + 0.12 * streak + rng.fork("sev").next() * 0.25, 0.4, 0.95);
  const until = world.now + months;
  for (const s of settlementsOfRegion(world, region)) {
    setFamine(state, s, severity, until);
    // The unsimulated poor thin out too.
    const loss = Math.round(s.abstractPop * rng.fork("pop", s.id).range(0.03, 0.08));
    s.abstractPop = Math.max(20, s.abstractPop - loss);
  }
  state.faminePressure = Math.min(2, state.faminePressure + 0.35);
  ctx.record({
    type: "famine",
    date: world.now,
    participants: {},
    // data: { region, severity 0..1, months of hunger, consecutiveYears }.
    data: { region: region.id, severity: Number(severity.toFixed(3)), months, consecutiveYears: streak + 1 },
    location: null,
    region: region.id,
    importance: 45,
    causes: [],
    storyline: null,
    secret: false,
  });
}
