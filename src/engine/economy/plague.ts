/**
 * Plague: the generational catastrophe. Rare (expected once per 40 to 80
 * years world-wide, likelier after famines and wars), named in the local
 * tongue and in plain dread English, seeded at trade hubs and ports, and
 * spread month by month along region adjacency (faster along roads and
 * between ports).
 *
 * The economy module sets settlement.conditions.plague / plagueSeverity
 * (the people module turns severity into deaths) and world.conditions.plague
 * (the religion module preaches on it). Every plague is guaranteed to end:
 * each settlement's infection carries a fixed burn-out clock, and spread
 * only flows from settlements still burning.
 */

import type { Rng } from "../core/rng";
import type {
  Ctx,
  Person,
  Region,
  RegionId,
  Settlement,
  SettlementId,
  SettlementKind,
} from "../core/types";
import { sortedIds } from "../core/world";
import {
  clamp,
  languageNear,
  pickWeightedPeople,
  regionHasPort,
  residentsOf,
  warsActive,
} from "./helpers";
import { diseaseName, windfallGain } from "./names";
import { COND, type EconState, hasRoad, type PlagueState, WORLD_COND } from "./state";

/** Expected ~1 outbreak per 75 years before famine/war multipliers. */
const BASE_MONTHLY_OUTBREAK = 1 / 900;
/** No two plagues within 15 years of each other. */
const MIN_GAP_MONTHS = 180;

/** How likely each settlement kind is to hatch a plague (crowds, ships). */
const ORIGIN_WEIGHT: Record<SettlementKind, number> = {
  port: 3,
  city: 2.5,
  town: 1.5,
  "temple-town": 1.1,
  stronghold: 0.8,
  village: 0.6,
};

/** Local peak severity by settlement kind (density kills). */
const PEAK_BY_KIND: Record<SettlementKind, number> = {
  port: 0.7,
  city: 0.65,
  town: 0.55,
  "temple-town": 0.5,
  stronghold: 0.45,
  village: 0.4,
};

export function plagueTick(ctx: Ctx, state: EconState): void {
  if (state.plague) {
    updatePlague(ctx, state, state.plague);
  } else {
    maybeOutbreak(ctx, state);
  }
}

// ---------------------------------------------------------------------------
// Outbreak
// ---------------------------------------------------------------------------

function maybeOutbreak(ctx: Ctx, state: EconState): void {
  const { world } = ctx;
  if (state.lastPlagueEnd > 0 && world.now - state.lastPlagueEnd < MIN_GAP_MONTHS) return;
  const pressure = 1 + state.faminePressure + 0.6 * Math.min(2, warsActive(world));
  const p = BASE_MONTHLY_OUTBREAK * pressure;
  if (!ctx.rng.fork("econ", "plague", "outbreak-roll").chance(p)) return;
  startPlague(ctx, state);
}

/**
 * Begin a plague now. Exported for tests (and for any future scripted
 * catastrophe); normally invoked by the monthly outbreak roll.
 */
export function startPlague(ctx: Ctx, state: EconState, origin?: SettlementId): PlagueState | null {
  if (state.plague) return state.plague; // one pestilence at a time
  const { world } = ctx;
  const rng = ctx.rng.fork("econ", "plague", "start");

  let originSettlement: Settlement | null = null;
  if (origin !== undefined) {
    originSettlement = world.settlements.get(origin) ?? null;
  } else {
    const ids = sortedIds(world.settlements);
    if (ids.length === 0) return null;
    const candidates = ids.map((id) => world.settlements.get(id)!);
    const weights = candidates.map(
      (s) => ORIGIN_WEIGHT[s.kind] * (s.conditions[COND.boom] ? 1.5 : 1),
    );
    originSettlement = rng.fork("origin").weighted(candidates, weights);
  }
  if (!originSettlement) return null;
  const originRegion = world.regions.get(originSettlement.region);
  if (!originRegion) return null;

  const lang = languageNear(world, originSettlement);
  const name = diseaseName(
    rng.fork("name"),
    ctx.services.language,
    lang,
    originRegion,
    state.usedDiseaseNames,
  );
  state.usedDiseaseNames.push(name);

  const plague: PlagueState = {
    name,
    started: world.now,
    originRegion: originRegion.id,
    originSettlement: originSettlement.id,
    outbreakEvent: 0,
    regions: {},
    towns: {},
  };

  const ev = ctx.record({
    type: "plague-outbreak",
    date: world.now,
    participants: {},
    // data: { name, region } — canonical per CONTRACTS.md.
    data: { name, region: originRegion.id },
    location: originSettlement.id,
    region: originRegion.id,
    importance: 75,
    causes: [],
    storyline: null,
    secret: false,
  });
  plague.outbreakEvent = ev.id;

  state.plague = plague;
  state.plagueCount++;
  world.conditions[WORLD_COND.plague] = name;
  infectRegion(ctx, plague, originRegion, originSettlement.id);
  return plague;
}

function infectRegion(
  ctx: Ctx,
  plague: PlagueState,
  region: Region,
  originSid: SettlementId | null,
): void {
  const { world } = ctx;
  plague.regions[String(region.id)] = world.now;
  for (const sid of [...region.settlements].sort((a, b) => a - b)) {
    const s = world.settlements.get(sid);
    if (!s) continue;
    const r = ctx.rng.fork("econ", "plague", "town", sid);
    const peak = clamp(
      PEAK_BY_KIND[s.kind] + r.range(-0.08, 0.08) + (sid === originSid ? 0.1 : 0),
      0.2,
      0.9,
    );
    const months = r.fork("dur").intIn(6, 18);
    plague.towns[String(sid)] = { peak: Number(peak.toFixed(3)), onset: world.now, months };
    applySeverity(s, plague, world.now);
  }
}

/** Severity curve: quick flare, then a long guttering. */
function severityAt(town: { peak: number; onset: number; months: number }, now: number): number {
  const elapsed = now - town.onset;
  if (elapsed >= town.months) return 0;
  const rise = Math.min(1, (elapsed + 1) / 2);
  const fall = 1 - elapsed / town.months;
  return town.peak * rise * fall;
}

function applySeverity(s: Settlement, plague: PlagueState, now: number): void {
  const town = plague.towns[String(s.id)];
  if (!town) return;
  const sev = severityAt(town, now);
  if (sev <= 0.02) {
    delete plague.towns[String(s.id)];
    delete s.conditions[COND.plague];
    delete s.conditions[COND.plagueSeverity];
    return;
  }
  s.conditions[COND.plague] = plague.name;
  s.conditions[COND.plagueSeverity] = Number(sev.toFixed(3));
  // The unsimulated crowd dies off-page.
  s.abstractPop = Math.max(20, Math.round(s.abstractPop * (1 - sev * 0.025)));
}

// ---------------------------------------------------------------------------
// Monthly course: decay, spread, end
// ---------------------------------------------------------------------------

function updatePlague(ctx: Ctx, state: EconState, plague: PlagueState): void {
  const { world } = ctx;

  // 1. Update every afflicted settlement (burns out on its fixed clock).
  for (const key of Object.keys(plague.towns)
    .map(Number)
    .sort((a, b) => a - b)) {
    const s = world.settlements.get(key as SettlementId);
    if (!s) {
      delete plague.towns[String(key)];
      continue;
    }
    applySeverity(s, plague, world.now);
  }

  // 2. Which regions are still infectious (any settlement still burning)?
  const infectious = new Set<RegionId>();
  for (const key of Object.keys(plague.towns)) {
    const s = world.settlements.get(Number(key) as SettlementId);
    if (s) infectious.add(s.region);
  }

  // 3. Spread along adjacency into regions never yet touched.
  if (infectious.size > 0) {
    for (const rid of sortedIds(world.regions)) {
      if (plague.regions[String(rid)] !== undefined) continue;
      const region = world.regions.get(rid)!;
      if (region.settlements.length === 0) continue;
      const infectedNeighbors = [...region.adjacent]
        .sort((a, b) => a - b)
        .filter((n) => infectious.has(n));
      if (infectedNeighbors.length === 0) continue;
      let p = 0.28;
      if (regionHasPort(world, region)) p += 0.12;
      if (
        infectedNeighbors.some((n) => {
          const nr = world.regions.get(n);
          return nr ? regionHasPort(world, nr) : false;
        })
      )
        p += 0.1;
      if (infectedNeighbors.some((n) => hasRoad(state, rid, n))) p += 0.15;
      p = Math.min(0.6, p);
      if (ctx.rng.fork("econ", "plague", "spread", rid).chance(p)) {
        infectRegion(ctx, plague, region, null);
      }
    }
  }

  // 4. Ended? Every local infection has burned out; nothing left to spread.
  if (Object.keys(plague.towns).length === 0) {
    endPlague(ctx, state, plague);
  }
}

function endPlague(ctx: Ctx, state: EconState, plague: PlagueState): void {
  const { world } = ctx;
  const rng = ctx.rng.fork("econ", "plague", "end");
  const months = world.now - plague.started;
  const touchedRegions = Object.keys(plague.regions).length;

  // Aftermath: the dead leave farms and forges behind. A few survivors
  // wake to find themselves suddenly propertied.
  const windfalls: { person: number; gain: string }[] = [];
  const touchedSettlements = sortedIds(world.settlements).filter(
    (sid) => plague.regions[String(world.settlements.get(sid)!.region)] !== undefined,
  );
  for (const sid of touchedSettlements) {
    if (windfalls.length >= 6) break;
    const r = rng.fork("windfall", sid);
    if (!r.chance(0.55)) continue;
    const pool = residentsOf(world, sid).filter((p) => ageOk(world.now, p) && p.status.wealth < 5);
    if (pool.length === 0) continue;
    const chosen = pickWeightedPeople(
      r.fork("who"),
      pool,
      (p) => (recentlyWidowed(p, plague.started) ? 3 : 1) * (1 + (3 - Math.min(3, p.status.wealth)) * 0.4),
      1,
    );
    for (const p of chosen) {
      p.status.wealth = Math.min(5, p.status.wealth + 1);
      windfalls.push({ person: p.id, gain: windfallGain(r.fork("gain")) });
    }
  }

  ctx.record({
    type: "plague-ended",
    date: world.now,
    participants: {},
    // data: { name, months the plague ran, regionsTouched, windfalls:
    //   [{ person: PersonId, gain: string }] — survivors who inherited }.
    data: { name: plague.name, months, regionsTouched: touchedRegions, windfalls },
    location: plague.originSettlement,
    region: plague.originRegion,
    importance: 25,
    causes: [plague.outbreakEvent],
    storyline: null,
    secret: false,
  });

  delete world.conditions[WORLD_COND.plague];
  state.plague = null;
  state.lastPlagueEnd = world.now;
  state.faminePressure = state.faminePressure * 0.5;
}

function ageOk(now: number, p: Person): boolean {
  return now - p.born >= 14 * 12;
}

function recentlyWidowed(p: Person, since: number): boolean {
  return p.marriages.some(
    (m) => !m.active && m.endReason === "death" && (m.endDate ?? 0) >= since,
  );
}

/** Exported for tests: the deterministic severity curve. */
export { severityAt };
