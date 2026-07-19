/**
 * Durable economy state, kept JSON-serializable inside world.conditions
 * under "econ.state" (same pattern as the politics and story modules).
 *
 * Also the single place that names every condition key this module owns,
 * so the keys other modules read (people: famine/plagueSeverity; religion:
 * plague/comet) stay in one auditable spot.
 */

import type { SimDate } from "../core/time";
import type { EventId, RegionId, SettlementId, World } from "../core/types";

// ---------------------------------------------------------------------------
// Condition keys (settlement.conditions / world.conditions)
// ---------------------------------------------------------------------------

/** Settlement-local condition keys the economy module writes. */
export const COND = {
  /** boolean — full larders after a bountiful harvest (~6 months). */
  plenty: "plenty",
  /** boolean — thin stores after a poor harvest (until spring). */
  lean: "lean",
  /** boolean — famine; the people module reads this for mortality. */
  famine: "famine",
  /** number 0..1 — famine intensity (people reads famineSeverity). */
  famineSeverity: "famineSeverity",
  /** string — the active disease's name in this settlement. */
  plague: "plague",
  /** number 0..1 — decaying plague severity (people reads this). */
  plagueSeverity: "plagueSeverity",
  /** boolean — a trade boom is running here. */
  boom: "boom",
} as const;

/** World-level condition keys. */
export const WORLD_COND = {
  /** string — name of the active plague (religion reads truthiness). */
  plague: "plague",
  /** string — name of the comet in the sky (religion/story fuel). */
  comet: "comet",
  /** The economy module's durable state. */
  state: "econ.state",
} as const;

// ---------------------------------------------------------------------------
// State shapes
// ---------------------------------------------------------------------------

export type HarvestOutcome = "bountiful" | "normal" | "poor" | "famine";

export interface RegionHarvest {
  /** Consecutive poor-or-worse autumns; escalates toward famine. */
  poorStreak: number;
  lastOutcome: HarvestOutcome;
  /** Lifetime tallies (cheap; used by tests and the UI). */
  counts: Record<HarvestOutcome, number>;
}

/** One settlement's course of infection during the active plague. */
export interface PlagueTown {
  /** Peak severity 0..1 reached early in the local outbreak. */
  peak: number;
  onset: SimDate;
  /** Months from onset until the sickness burns out here (6..18). */
  months: number;
}

export interface PlagueState {
  name: string;
  started: SimDate;
  originRegion: RegionId;
  originSettlement: SettlementId;
  /** Chronicle id of the plague-outbreak event (causal parent). */
  outbreakEvent: EventId;
  /** region id (string key) -> month the sickness arrived. */
  regions: Record<string, SimDate>;
  /** settlement id (string key) -> local infection record. */
  towns: Record<string, PlagueTown>;
}

export interface EconState {
  version: 1;
  /** region id (string key) -> harvest history. */
  harvest: Record<string, RegionHarvest>;
  /** Timed settlement conditions: settlement id (string key) -> expiry. */
  plentyUntil: Record<string, SimDate>;
  leanUntil: Record<string, SimDate>;
  famineUntil: Record<string, SimDate>;
  /**
   * boomUntil is kept after expiry as "when the last boom ended" so it also
   * serves as the per-settlement boom cooldown clock.
   */
  boomUntil: Record<string, SimDate>;
  plague: PlagueState | null;
  /** Month the last plague ended (0 = never); spaces out generations. */
  lastPlagueEnd: SimDate;
  plagueCount: number;
  /** Rises with famines, decays monthly; plagues follow hungry years. */
  faminePressure: number;
  /** Month of the last fire/flood/storm/earthquake (global spacing). */
  lastDisasterAt: SimDate;
  /** Month the current comet fades (0 = no comet ever / none active). */
  cometUntil: SimDate;
  /** Built roads as "a-b" region-id pair keys (a < b). */
  roads: string[];
  /** Disease names already spent, so no plague is ever named twice. */
  usedDiseaseNames: string[];
}

export function econState(world: World): EconState {
  let s = world.conditions[WORLD_COND.state] as EconState | undefined;
  if (!s) {
    s = {
      version: 1,
      harvest: {},
      plentyUntil: {},
      leanUntil: {},
      famineUntil: {},
      boomUntil: {},
      plague: null,
      lastPlagueEnd: 0,
      plagueCount: 0,
      faminePressure: 0,
      lastDisasterAt: 0,
      cometUntil: 0,
      roads: [],
      usedDiseaseNames: [],
    };
    world.conditions[WORLD_COND.state] = s;
  }
  return s;
}

export function regionHarvest(state: EconState, region: RegionId): RegionHarvest {
  const key = String(region);
  let h = state.harvest[key];
  if (!h) {
    h = {
      poorStreak: 0,
      lastOutcome: "normal",
      counts: { bountiful: 0, normal: 0, poor: 0, famine: 0 },
    };
    state.harvest[key] = h;
  }
  return h;
}

/** Canonical undirected road key for a region pair. */
export function roadKey(a: RegionId, b: RegionId): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

export function hasRoad(state: EconState, a: RegionId, b: RegionId): boolean {
  return state.roads.includes(roadKey(a, b));
}
