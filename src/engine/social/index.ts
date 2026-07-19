/**
 * Social module — createSocialService.
 *
 * The relationship fabric of the world: friendships and sworn oaths,
 * rivalries that heat from insult to quarrel to brawl or duel, romances
 * and unrequited pining, secret affairs and the day they come to light,
 * gifts and reconciliations, bounded personal memory with grudges that
 * refuse to fade, and house feuds that hostile deeds keep alive.
 *
 * All state lives on the World (world.relationships, world.memories,
 * person flags under the "social." namespace, house feud maps). All
 * randomness forks from the tick rng under a "social" label with stable
 * entity-id keys; iteration is always in ascending-id order.
 */

import type {
  Ctx,
  Memory,
  PersonId,
  Relationship,
  SocialService,
  World,
} from "../core/types";
import { socialTick } from "./tick";
import {
  adjustOpinion,
  getOpinion,
  getRelation,
  setRelation,
} from "./relations";
import { addMemory } from "./memory";
import { closeKin } from "./kinship";

export function createSocialService(): SocialService {
  return {
    tick(ctx: Ctx): void {
      socialTick(ctx);
    },

    getOpinion(world: World, a: PersonId, b: PersonId): number {
      return getOpinion(world, a, b);
    },

    setRelation(world: World, a: PersonId, b: PersonId, rel: Relationship): void {
      setRelation(world, a, b, rel);
    },

    getRelation(world: World, a: PersonId, b: PersonId): Relationship | null {
      return getRelation(world, a, b);
    },

    adjustOpinion(world: World, a: PersonId, b: PersonId, delta: number): void {
      adjustOpinion(world, a, b, delta);
    },

    addMemory(world: World, person: PersonId, memory: Memory): void {
      addMemory(world, person, memory);
    },

    closeKin(world: World, a: PersonId, b: PersonId): boolean {
      return closeKin(world, a, b);
    },
  };
}

// Extra exported helpers (pure or ctx-driven; used by tests and tools).
export { F, personalityCompat, buildSettlementIndex } from "./helpers";
export {
  getOpinion,
  getRelation,
  setRelation,
  adjustOpinion,
  kinBonus,
  feudPenalty,
  grudgeCeiling,
  countKind,
} from "./relations";
export { addMemory, decayMemories, MAX_MEMORIES } from "./memory";
export { closeKin, siblingIdsOf, parentIdsOf } from "./kinship";
export { fightDuel, escFlagsOf, clearStage } from "./rivalry";
export {
  attraction,
  beginAffair,
  discoverAffair,
  discoveryHazard,
  endAffairQuietly,
} from "./romance";
export { bumpFeud, decayFeuds, FEUD_ACTIVE } from "./feuds";
export { monthSample, SAMPLE_RATE, socialTick } from "./tick";
export { decayRelations } from "./decay";
