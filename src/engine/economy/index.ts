/**
 * Economy module — createEconomyService.
 *
 * The material world: harvests and famines, plagues, fires, floods, storms,
 * earthquakes, comets, trade booms and roads. The pressure systems that make
 * lives precarious and stories consequential.
 *
 * Monthly order:
 *   1. sweep expired conditions (plenty/lean/famine/boom/comet), silently;
 *   2. the autumn harvest (month 9): biome-weighted, weather-clustered;
 *   3. plague: outbreak roll, monthly spread and decay, guaranteed end;
 *   4. disasters: fire, flood, storm, earthquake, comet;
 *   5. trade: booms and (yearly) road-building.
 *
 * All randomness forks from ctx.rng under the "econ" label, keyed by stable
 * entity ids; iteration is always via sortedIds/livingIds.
 */

import type { Ctx, EconomyService } from "../core/types";
import { sweepExpiredConditions } from "./conditions";
import { disastersTick } from "./disasters";
import { harvestTick } from "./harvest";
import { plagueTick } from "./plague";
import { econState } from "./state";
import { tradeTick } from "./trade";

export function createEconomyService(): EconomyService {
  return {
    tick(ctx: Ctx): void {
      const state = econState(ctx.world);

      // Hunger's shadow fades slowly (plague pressure decays monthly).
      state.faminePressure = state.faminePressure > 0.001 ? state.faminePressure * 0.975 : 0;

      sweepExpiredConditions(ctx, state);
      harvestTick(ctx, state);
      plagueTick(ctx, state);
      disastersTick(ctx, state);
      tradeTick(ctx, state);
    },
  };
}

// Extra exported helpers (free for tests, tools, and the UI).
export { econState, COND, WORLD_COND, regionHarvest, roadKey, hasRoad } from "./state";
export type { EconState, PlagueState, HarvestOutcome } from "./state";
export { classifyHarvest, HARVEST_MONTH } from "./harvest";
export { startPlague, severityAt } from "./plague";
export { igniteFire } from "./disasters";
export { startBoom } from "./trade";
export { diseaseName, cometName } from "./names";
