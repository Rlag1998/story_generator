/**
 * Monthly storyline spawning: bounded, deterministic, commoner-friendly.
 *
 * - Concurrency cap: about one active arc per 25 living souls.
 * - Per person: at most 2 concurrent arcs (person.storylines), plus
 *   per-kind and short any-kind cooldown flags after each arc ends.
 * - Candidate stars come from a deterministic rng-gated scan of the
 *   living (ids, never indices), then arcs bid by weight. Rank bias
 *   multiplies commoner weights so most stories star ordinary people:
 *   a fisherman's revenge is worth as much ink as a duke's.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, StorylineKind } from "../core/types";
import { livingIds, sortedIds } from "../core/world";
import type { ArcDef, SpawnAids } from "./arcdef";
import { ARC_LIST } from "./registry";
import { SF, buildSettlementIndex, castable, flagNum } from "./helpers";

/** Cap on simultaneously active storylines. */
export function arcCapacity(alive: number): number {
  return Math.max(3, Math.floor(alive / 25));
}

/** Rank bias: ordinary lives get the ink. */
export function rankBias(rank: number): number {
  if (rank <= 1) return 2.2;
  if (rank === 2) return 1.8;
  if (rank === 3) return 1.0;
  return 0.7;
}

export function countActive(ctx: Ctx): number {
  let active = 0;
  for (const sid of sortedIds(ctx.world.storylines)) {
    if (!ctx.world.storylines.get(sid)!.resolved) active++;
  }
  return active;
}

/** Deterministic candidate sample: living, present, uncooled, id-gated. */
export function sampleCandidates(ctx: Ctx, rng: Rng): Person[] {
  const world = ctx.world;
  const alive = world.alive.size;
  if (alive === 0) return [];
  const rate = Math.min(1, 36 / alive);
  const out: Person[] = [];
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (!p || p.location == null) continue;
    if (p.storylines.length >= 2) continue;
    const cdAny = flagNum(p, SF.cdAny);
    if (cdAny !== null && cdAny > world.now) continue;
    if (rng.fork("cand", id).chance(rate)) out.push(p);
  }
  return out;
}

interface Option {
  star: Person;
  def: ArcDef;
  w: number;
}

export function spawnArcs(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  const cap = arcCapacity(world.alive.size);
  let active = countActive(ctx);

  // World-driven arcs first (succession struggles): allowed a small
  // overflow so a realm's crisis is never crowded out by village drama.
  for (const def of ARC_LIST) {
    if (!def.worldSpawn) continue;
    const room = Math.max(0, cap + 2 - active);
    if (room <= 0) break;
    active += def.worldSpawn(ctx, rng.fork("world", def.kind), Math.min(2, room));
  }

  let budget = Math.min(2, cap - active);
  if (budget <= 0) return;

  const aids: SpawnAids = { index: buildSettlementIndex(world) };
  const candidates = sampleCandidates(ctx, rng.fork("sample"));
  if (candidates.length === 0) return;

  // Every (star, kind) pairing bids by weight.
  const options: Option[] = [];
  for (const star of candidates) {
    for (const def of ARC_LIST) {
      if (!castable(world, star, def.kind)) continue;
      const base = def.weight(ctx, star);
      if (base <= 0) continue;
      options.push({ star, def, w: base * rankBias(star.status.rank) });
    }
  }

  let attempt = 0;
  while (budget > 0 && options.length > 0 && attempt < 12) {
    attempt++;
    const pickRng = rng.fork("pick", attempt);
    const idx = weightedIndex(pickRng, options);
    const opt = options[idx];
    options.splice(idx, 1);
    const s = opt.def.spawn(ctx, pickRng.fork("cast", opt.def.kind, opt.star.id), opt.star, aids);
    if (s) {
      budget--;
      // One arc per star per month: drop this star's other bids.
      for (let i = options.length - 1; i >= 0; i--) {
        if (options[i].star.id === opt.star.id) options.splice(i, 1);
      }
    }
  }
}

function weightedIndex(rng: Rng, options: Option[]): number {
  let total = 0;
  for (const o of options) total += Math.max(0, o.w);
  if (total <= 0) return rng.int(options.length);
  let roll = rng.next() * total;
  for (let i = 0; i < options.length; i++) {
    roll -= Math.max(0, options[i].w);
    if (roll < 0) return i;
  }
  return options.length - 1;
}
