/**
 * Story module — createStoryService.
 *
 * The multi-year narrative arc engine. Isolated random events feel like
 * dice; these arcs make lives read like novels: setup, escalation,
 * complication, climax, consequence, and, years later, echo. Every
 * StorylineKind from core/types is a small state machine whose beats are
 * chronicle events chained by `causes`, so the UI can always answer
 * "why did this happen".
 *
 * Monthly tick order: advance existing arcs, then spawn new ones
 * (bounded: ~1 active arc per 25 living, at most 2 per person, cooldown
 * flags per kind), then emit any due echoes.
 */

import type { Ctx, StoryService } from "../core/types";
import { advanceBeats } from "./beats";
import { spawnArcs } from "./spawn";
import { emitEchoes } from "./echoes";

export function createStoryService(): StoryService {
  return {
    tick(ctx: Ctx): void {
      const rng = ctx.rng.fork("story");
      advanceBeats(ctx, rng.fork("beats"));
      spawnArcs(ctx, rng.fork("spawn"));
      emitEchoes(ctx, rng.fork("echoes"));
    },
  };
}

// Extra exported helpers (used by tests; free for tools to reuse).
export { ARCS, ARC_LIST } from "./registry";
export { arcCapacity, rankBias, countActive, sampleCandidates, spawnArcs } from "./spawn";
export { advanceBeats } from "./beats";
export { emitEchoes } from "./echoes";
export { makeArc } from "./arcdef";
export type { Arc, ArcDef, SpawnAids, BeatOpts } from "./arcdef";
export {
  SF,
  KIND_COOLDOWN,
  ANY_COOLDOWN,
  beginStoryline,
  endStoryline,
  castable,
  castIds,
  addCastMember,
  bestowEpithet,
  buildSettlementIndex,
  localIndex,
  storyState,
  scheduleEcho,
} from "./helpers";
export type { StoryState, EchoPlan } from "./helpers";
