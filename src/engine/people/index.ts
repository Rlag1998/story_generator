/**
 * People module — createPeopleService.
 *
 * The engine's heartbeat: demographics, life stages, careers, health and
 * injury, pregnancy and birth (twins included), death and its cascade,
 * and the marriage market. Tuned for a stable population that drifts
 * gently toward world.params.popCap without explosion or collapse.
 *
 * All randomness flows from the Rng handed to each call, forked on stable
 * entity ids; iteration is always in ascending-id order.
 */

import type { Rng } from "../core/rng";
import type {
  Ctx,
  LifeStage,
  PeopleService,
  Person,
  PersonId,
  Services,
  World,
} from "../core/types";
import { createFounder } from "./founder";
import { createChildInternal } from "./child";
import { peopleTick } from "./tick";
import { marriageTick } from "./marriage";
import { kill } from "./death";
import { ageOf, lifeStageOf } from "./helpers";

export function createPeopleService(): PeopleService {
  return {
    createFounder(rng, world, services, opts) {
      return createFounder(rng, world, services, opts);
    },

    createChild(
      rng: Rng,
      world: World,
      services: Services,
      mother: Person,
      father: Person | null,
      opts?: { litterIndex?: number; litterMates?: PersonId[] },
    ): Person {
      return createChildInternal(rng, world, services, mother, father, {
        litterIndex: opts?.litterIndex ?? 0,
        litterMates: opts?.litterMates ?? [],
        litter: opts?.litterMates ? opts.litterMates.length + 1 : 1,
      }).person;
    },

    tick(ctx: Ctx): void {
      peopleTick(ctx);
    },

    marriageTick(ctx: Ctx): void {
      marriageTick(ctx);
    },

    kill(ctx: Ctx, person: Person, cause: string, opts?: { killer?: PersonId; event?: number }): void {
      kill(ctx, person, cause, opts);
    },

    age(world: World, p: Person): number {
      return ageOf(world, p);
    },

    lifeStage(world: World, p: Person): LifeStage {
      return lifeStageOf(world, p);
    },
  };
}

// Extra exported helpers (pure; used by tests and free for other tools).
export { ageOf, lifeStageOf } from "./helpers";
export { baseMortalityMonthly, monthlyDeathHazard } from "./hazard";
export { capDamping, conceptionAgeFactor, computeConceptionChance, BIRTH_SPACING_MONTHS, GESTATION_MONTHS } from "./fertility";
