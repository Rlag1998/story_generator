/**
 * Politics module — createPoliticsService.
 *
 * Realms, noble houses, courts and crowns. Worldgen founding partitions each
 * culture's regions into polities with ruling dynasties whose pedigrees are
 * real from year one; the monthly tick runs diplomacy, rare wars, plots and
 * honors; deaths cascade into successions under six distinct laws, with
 * regencies, crises, claimants, coups, and the reign ledger kept true.
 *
 * Determinism: every draw forks the provided Rng on stable entity ids; all
 * map iteration goes through sortedIds/livingIds or stable id arrays.
 */

import type { Ctx, Person, PersonId, PoliticsService, Polity, World } from "../core/types";
import type { Rng } from "../core/rng";
import { found } from "./found";
import { onDeath } from "./ondeath";
import { successionLine } from "./succession";
import { diplomacyTick } from "./diplomacy";
import { warTick } from "./war";
import { plotsTick } from "./plots";
import { honorsTick } from "./honors";

export function createPoliticsService(): PoliticsService {
  return {
    found(rng, world, services): void {
      found(rng, world, services);
    },

    tick(ctx: Ctx): void {
      const world = ctx.world;
      if (world.polities.size === 0) return;
      const rng = ctx.rng.fork("politics");
      // Fixed order: stances shift, armies march, knives come out, honors
      // settle. Never reorder (determinism and causal sanity).
      diplomacyTick(ctx, rng.fork("diplomacy"));
      warTick(ctx, rng.fork("war"));
      plotsTick(ctx, rng.fork("plots"));
      honorsTick(ctx, rng.fork("honors"));
    },

    onDeath(ctx: Ctx, deceased: Person): void {
      onDeath(ctx, deceased);
    },

    successionLine(world: World, polity: Polity, limit = 10): PersonId[] {
      return successionLine(world, polity, limit);
    },
  };
}

// Extra exported helpers (free for tests, tools and curious modules' tests).
export { successionLine, dynasticLine, chooseHeir, crisisClaimants } from "./succession";
export { chooseHouseHeir } from "./ondeath";
export { declareWar, combatants, transferRegion } from "./war";
export { regionsByCulture, chooseSuccessionLaw } from "./found";
export { crownRuler, closeReign } from "./crown";
export { PF, polState } from "./helpers";
export type { PolState, WarState, CrisisState } from "./helpers";
