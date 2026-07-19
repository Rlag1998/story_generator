/**
 * The arc framework. Every StorylineKind is a small state machine: named
 * stages, beat timers (storyline.nextBeat gates all work), weighted
 * outcomes per beat, and every beat recorded as a chronicle event carrying
 * the storyline id and cause links back to the arc's prior events. That
 * chain is what lets the UI answer "why did this happen".
 *
 * Custom event types introduced by this module (canonical ones preferred
 * wherever they fit; data fields documented at the recording site):
 *   secret-meeting, lovers-parted, contest-held, sabotage, ambition-kindled,
 *   fortune-turn, fortune-made, grief-kept, stalking, search-mounted, rumor,
 *   gift-revealed, wonder-shown, great-work-begun, work-ruined, penance-done,
 *   recanted, support-courted, plot-ripened, tale-ended.
 */

import type { Rng } from "../core/rng";
import type {
  Ctx,
  EventId,
  EventRecord,
  Person,
  PersonId,
  SettlementId,
  Storyline,
  StorylineKind,
  World,
} from "../core/types";
import {
  SettlementIndex,
  endStoryline,
  livingPerson,
  regionOf,
  scheduleEcho,
  whereabouts,
} from "./helpers";

// ---------------------------------------------------------------------------
// Beat context
// ---------------------------------------------------------------------------

export interface BeatOpts {
  type: string;
  participants: Record<string, PersonId>;
  data?: Record<string, unknown>;
  importance: number;
  /** Location source: a cast role name, an explicit settlement, or null. */
  at?: string | SettlementId | null;
  /** Cause overrides; defaults to [previous beat of this storyline]. */
  causes?: EventId[];
  secret?: boolean;
}

/** Everything a stage handler needs, bound to one storyline and one month. */
export interface Arc {
  ctx: Ctx;
  world: World;
  rng: Rng;
  s: Storyline;
  /** Cast lookup; returns the person even if dead (null if unknown id). */
  cast(role: string): Person | null;
  /** Cast lookup restricted to the living. */
  living(role: string): Person | null;
  /** The most recent event recorded under this storyline. */
  last(): EventId | null;
  /** Record a beat: storyline id + default cause chain applied. */
  beat(opts: BeatOpts): EventRecord;
  /** Move to a stage and schedule the next beat in [min, max] months. */
  go(stage: string, minMonths: number, maxMonths: number): void;
  /** Resolve the arc. The closing beat must already be recorded. */
  end(outcome: string): void;
  /** Schedule a low-importance echo years after resolution. */
  echo(kind: "song" | "omen" | "miracle", yearsMin: number, yearsMax: number, theme: string, cause?: EventId | null): void;
}

export function makeArc(ctx: Ctx, rng: Rng, s: Storyline): Arc {
  const world = ctx.world;
  const arc: Arc = {
    ctx,
    world,
    rng,
    s,
    cast(role: string): Person | null {
      const id = s.cast[role];
      if (id == null) return null;
      return world.people.get(id) ?? null;
    },
    living(role: string): Person | null {
      const id = s.cast[role];
      if (id == null) return null;
      return livingPerson(world, id);
    },
    last(): EventId | null {
      return s.events.length > 0 ? s.events[s.events.length - 1] : null;
    },
    beat(opts: BeatOpts): EventRecord {
      let location: SettlementId | null = null;
      if (typeof opts.at === "string") {
        const p = arc.cast(opts.at);
        location = p?.location ?? (s.data["home"] as SettlementId | undefined) ?? null;
      } else if (typeof opts.at === "number") {
        location = opts.at;
      } else if (opts.at === undefined) {
        // Default: the first listed participant's whereabouts.
        const roles = Object.keys(opts.participants);
        const first = roles.length > 0 ? world.people.get(opts.participants[roles[0]]) : null;
        location = first ? whereabouts(world, first, s.data["home"] as SettlementId | undefined).location : null;
      }
      const prior = arc.last();
      const causes = opts.causes ?? (prior != null ? [prior] : []);
      return ctx.record({
        type: opts.type,
        date: world.now,
        participants: opts.participants,
        data: opts.data ?? {},
        location,
        region: regionOf(world, location),
        importance: opts.importance,
        causes,
        storyline: s.id,
        secret: opts.secret ?? false,
      });
    },
    go(stage: string, minMonths: number, maxMonths: number): void {
      s.stage = stage;
      const lo = Math.max(1, Math.floor(minMonths));
      const hi = Math.max(lo, Math.floor(maxMonths));
      s.nextBeat = world.now + rng.fork("pace", stage).intIn(lo, hi);
    },
    end(outcome: string): void {
      endStoryline(ctx, s, outcome);
    },
    echo(kind, yearsMin, yearsMax, theme, cause): void {
      const months = rng.fork("echo-when", kind, theme).intIn(
        Math.max(6, Math.floor(yearsMin * 12)),
        Math.max(7, Math.floor(yearsMax * 12)),
      );
      scheduleEcho(world, {
        due: world.now + months,
        storyline: s.id,
        kind,
        cause: cause ?? arc.last(),
        location: (s.data["home"] as SettlementId | undefined) ?? null,
        theme,
      });
    },
  };
  return arc;
}

// ---------------------------------------------------------------------------
// Arc definitions
// ---------------------------------------------------------------------------

export interface SpawnAids {
  index: SettlementIndex;
}

export interface ArcDef {
  kind: StorylineKind;
  /**
   * Cheap eligibility weight for a would-be star (0 = ineligible).
   * Personality, flags, profession; no heavy scans here.
   */
  weight(ctx: Ctx, star: Person): number;
  /**
   * Cast the arc around the star, record its opening beat(s), and return
   * the storyline; null when a supporting role cannot be filled.
   */
  spawn(ctx: Ctx, rng: Rng, star: Person, aids: SpawnAids): Storyline | null;
  /** Stage handlers keyed by storyline.stage. */
  stages: Record<string, (a: Arc) => void>;
  /** Roles whose death before resolution interrupts the arc. */
  essential: string[];
  /**
   * Optional interception of an essential death; return true when the arc
   * turned the death into story (else a generic quiet close is recorded).
   */
  onCastDeath?(a: Arc, role: string, person: Person): boolean;
  /**
   * Arcs not driven by a sampled star (succession-struggle) spawn here.
   * Returns the number of storylines opened. Must self-limit.
   */
  worldSpawn?(ctx: Ctx, rng: Rng, budget: number): number;
}
