/**
 * Timed settlement conditions: plenty, lean, famine, boom.
 *
 * The economy sets a condition flag plus an expiry month in EconState;
 * every tick sweeps expiries and clears flags silently (the chronicle
 * records onsets only, per contract).
 */

import type { SimDate } from "../core/time";
import type { Ctx, Settlement, SettlementId } from "../core/types";
import { COND, type EconState, WORLD_COND } from "./state";

function sortedNumKeys(rec: Record<string, SimDate>): number[] {
  return Object.keys(rec)
    .map(Number)
    .sort((a, b) => a - b);
}

export function setPlenty(state: EconState, s: Settlement, until: SimDate): void {
  s.conditions[COND.plenty] = true;
  delete s.conditions[COND.lean]; // plenty supersedes lean
  delete state.leanUntil[String(s.id)];
  state.plentyUntil[String(s.id)] = until;
}

export function setLean(state: EconState, s: Settlement, until: SimDate): void {
  // Famine already says worse; do not downgrade the signal.
  if (s.conditions[COND.famine]) return;
  s.conditions[COND.lean] = true;
  delete s.conditions[COND.plenty];
  delete state.plentyUntil[String(s.id)];
  const key = String(s.id);
  state.leanUntil[key] = Math.max(state.leanUntil[key] ?? 0, until);
}

export function setFamine(state: EconState, s: Settlement, severity: number, until: SimDate): void {
  s.conditions[COND.famine] = true;
  s.conditions[COND.famineSeverity] = Number(severity.toFixed(3));
  delete s.conditions[COND.plenty];
  delete s.conditions[COND.lean];
  const key = String(s.id);
  delete state.plentyUntil[key];
  delete state.leanUntil[key];
  state.famineUntil[key] = Math.max(state.famineUntil[key] ?? 0, until);
}

export function setBoom(state: EconState, s: Settlement, until: SimDate): void {
  s.conditions[COND.boom] = true;
  state.boomUntil[String(s.id)] = until;
}

/** Clear every expired timed condition. Silent by design. */
export function sweepExpiredConditions(ctx: Ctx, state: EconState): void {
  const { world } = ctx;
  const now = world.now;

  const sweep = (
    rec: Record<string, SimDate>,
    clear: (s: Settlement) => void,
    keepEntry: boolean,
  ): void => {
    for (const id of sortedNumKeys(rec)) {
      const key = String(id);
      if (rec[key] > now) continue;
      const s = world.settlements.get(id as SettlementId);
      if (s) clear(s);
      // boomUntil doubles as the boom cooldown clock, so keep its entry.
      if (!keepEntry) delete rec[key];
    }
  };

  sweep(state.plentyUntil, (s) => delete s.conditions[COND.plenty], false);
  sweep(state.leanUntil, (s) => delete s.conditions[COND.lean], false);
  sweep(
    state.famineUntil,
    (s) => {
      delete s.conditions[COND.famine];
      delete s.conditions[COND.famineSeverity];
    },
    false,
  );
  sweep(state.boomUntil, (s) => delete s.conditions[COND.boom], true);

  // Comet fades from the sky without ceremony.
  if (state.cometUntil !== 0 && state.cometUntil <= now && world.conditions[WORLD_COND.comet]) {
    delete world.conditions[WORLD_COND.comet];
  }
}
