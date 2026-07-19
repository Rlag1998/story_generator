/**
 * Shared helpers for the story module: flag keys, storyline lifecycle
 * (begin / end / cast bookkeeping), cooldowns, the echo queue kept in
 * world.conditions, and small deterministic utilities used by every arc.
 *
 * All state lives on the World; the module holds nothing between ticks.
 */

import type { Rng } from "../core/rng";
import type { SimDate } from "../core/time";
import { yearsBetween } from "../core/time";
import type {
  Ctx,
  Culture,
  EventId,
  EventRecord,
  Language,
  Person,
  PersonId,
  RegionId,
  SettlementId,
  Storyline,
  StorylineId,
  StorylineKind,
  World,
} from "../core/types";
import { nextId, sortedIds } from "../core/world";

// ---------------------------------------------------------------------------
// Flag keys
// ---------------------------------------------------------------------------

/** Person.flags keys the story module reads and writes. */
export const SF = {
  /** True while a person is missing from the world but not known dead. */
  vanished: "story.vanished",
  /** True while a wanderer walks beyond the map (publicly, unlike vanished). */
  away: "story.away",
  /** SimDate of a public disgrace; bait for the redemption arc. */
  disgraced: "story.disgraced",
  /** SimDate of a wrong that gnaws in secret (miscarried vengeance). */
  guilt: "story.guilt-burdened",
  /** Set on completing a magnum opus; politics honors it. */
  masterworkDone: "story.masterwork-done",
  /** + polityId -> true; politics spends it as a coup/assassination. */
  coupReadyPrefix: "story.coup-ready:",
  /** + kind -> SimDate before which this person cannot star in that kind. */
  cdPrefix: "story.cd:",
  /** SimDate before which this person is not sampled for any new arc. */
  cdAny: "story.cd:any",
  /** Foreign flags cooperated with (owners: politics / social / people). */
  claimant: "pol.claimant",
  pining: "social.pining",
  emigrated: "emigrated",
  loveMatch: "love-match",
} as const;

/** Per-kind months of cooldown applied to every cast member at arc end. */
export const KIND_COOLDOWN: Record<StorylineKind, number> = {
  feud: 180,
  "forbidden-love": 240,
  rivalry: 150,
  ambition: 240,
  revenge: 300,
  "mystery-disappearance": 420,
  prodigy: 600,
  downfall: 300,
  "usurpation-plot": 200,
  heresy: 600,
  curse: 300,
  masterwork: 420,
  "succession-struggle": 120,
  redemption: 300,
  wanderer: 240,
};

/** Months every cast member sits out of ALL new arcs after one ends. */
export const ANY_COOLDOWN = 30;

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** The person, if they exist and are living (dead and emigrated excluded). */
export function livingPerson(world: World, id: PersonId | null | undefined): Person | null {
  if (id == null) return null;
  const p = world.people.get(id);
  if (!p || p.died !== null || !world.alive.has(id)) return null;
  return p;
}

/** Living and actually present somewhere on the map. */
export function presentPerson(world: World, id: PersonId | null | undefined): Person | null {
  const p = livingPerson(world, id);
  return p && p.location != null ? p : null;
}

export function ageOf(world: World, p: Person): number {
  const until = p.died !== null && p.died < world.now ? p.died : world.now;
  return Math.max(0, yearsBetween(p.born, until));
}

export function adulthoodAgeOf(world: World, p: Person): number {
  return world.cultures.get(p.culture)?.adulthoodAge ?? 16;
}

export function isAdult(world: World, p: Person): boolean {
  return ageOf(world, p) >= adulthoodAgeOf(world, p);
}

export function isMarried(p: Person): boolean {
  return p.marriages.some((m) => m.active);
}

export function activeSpouseId(p: Person): PersonId | null {
  for (const m of p.marriages) if (m.active) return m.spouse;
  return null;
}

export function cultureOf(world: World, p: Person): Culture | null {
  return world.cultures.get(p.culture) ?? null;
}

export function langOf(world: World, p: Person): Language | null {
  const culture = world.cultures.get(p.culture);
  if (!culture) return null;
  return world.languages.get(culture.language) ?? null;
}

export function regionOf(world: World, sid: SettlementId | null): RegionId | null {
  if (sid == null) return null;
  return world.settlements.get(sid)?.region ?? null;
}

export function settlementName(world: World, sid: SettlementId | null): string {
  if (sid == null) return "parts unknown";
  return world.settlements.get(sid)?.name ?? "parts unknown";
}

/** Event location/region for a person, falling back to a remembered home. */
export function whereabouts(
  world: World,
  p: Person | null,
  fallback?: SettlementId | null,
): { location: SettlementId | null; region: RegionId | null } {
  const loc = p?.location ?? fallback ?? null;
  return { location: loc, region: regionOf(world, loc) };
}

export function flagNum(p: Person, key: string): number | null {
  const v = p.flags[key];
  return typeof v === "number" ? v : null;
}

/** Siblings (through either parent), unique, ascending id, self excluded. */
export function siblingIdsOf(world: World, p: Person): PersonId[] {
  const out = new Set<PersonId>();
  for (const pid of [p.mother, p.father]) {
    if (pid == null) continue;
    const parent = world.people.get(pid);
    if (!parent) continue;
    for (const cid of parent.children) if (cid !== p.id) out.add(cid);
  }
  return [...out].sort((a, b) => a - b);
}

/** Close kin ids: parents, siblings, spouses, children. Ascending, unique. */
export function closeKinIds(world: World, p: Person): PersonId[] {
  const out = new Set<PersonId>();
  for (const pid of [p.mother, p.father, p.legalFather]) if (pid != null) out.add(pid);
  for (const s of siblingIdsOf(world, p)) out.add(s);
  for (const m of p.marriages) out.add(m.spouse);
  for (const c of p.children) out.add(c);
  out.delete(p.id);
  return [...out].sort((a, b) => a - b);
}

/** The public death event of a dead person (bucket lookup, cheap). */
export function deathEventOf(world: World, p: Person): EventId | null {
  if (p.died === null) return null;
  const bucket = world.eventsByMonth.get(p.died);
  if (!bucket) return null;
  for (const id of bucket) {
    const ev = world.events.get(id);
    if (ev && ev.type === "death" && ev.participants["subject"] === p.id) return id;
  }
  return null;
}

/**
 * A settlement far from home, preferring another region: destination for
 * elopements and returns. Deterministic given the rng.
 */
export function farSettlement(world: World, rng: Rng, from: SettlementId | null): SettlementId | null {
  const homeRegion = regionOf(world, from);
  const far: SettlementId[] = [];
  const near: SettlementId[] = [];
  for (const sid of sortedIds(world.settlements)) {
    if (sid === from) continue;
    const s = world.settlements.get(sid)!;
    if (homeRegion != null && s.region !== homeRegion) far.push(sid);
    else near.push(sid);
  }
  if (far.length > 0) return rng.pick(far);
  if (near.length > 0) return rng.pick(near);
  return null;
}

// ---------------------------------------------------------------------------
// Settlement index (built once per spawn pass)
// ---------------------------------------------------------------------------

export type SettlementIndex = Map<SettlementId, PersonId[]>;

export function buildSettlementIndex(world: World): SettlementIndex {
  const index: SettlementIndex = new Map();
  for (const id of [...world.alive].sort((a, b) => a - b)) {
    const p = world.people.get(id);
    if (!p || p.location == null) continue;
    const list = index.get(p.location);
    if (list) list.push(id);
    else index.set(p.location, [id]);
  }
  return index;
}

/** A one-settlement index for spot lookups outside the spawn pass. */
export function localIndex(world: World, sid: SettlementId | null): SettlementIndex {
  const index: SettlementIndex = new Map();
  if (sid == null) return index;
  const list: PersonId[] = [];
  for (const id of [...world.alive].sort((a, b) => a - b)) {
    const p = world.people.get(id);
    if (p && p.location === sid) list.push(id);
  }
  index.set(sid, list);
  return index;
}

/** Residents of a settlement passing a filter, ascending id. */
export function residentsWhere(
  world: World,
  index: SettlementIndex,
  sid: SettlementId | null,
  filter: (p: Person) => boolean,
): Person[] {
  if (sid == null) return [];
  const out: Person[] = [];
  for (const id of index.get(sid) ?? []) {
    const p = world.people.get(id);
    if (p && filter(p)) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Storyline lifecycle
// ---------------------------------------------------------------------------

/** True when this person can be pulled into a NEW arc of the given kind. */
export function castable(world: World, p: Person, kind: StorylineKind): boolean {
  if (p.died !== null || !world.alive.has(p.id)) return false;
  if (p.storylines.length >= 2) return false;
  const cdKind = flagNum(p, SF.cdPrefix + kind);
  if (cdKind !== null && cdKind > world.now) return false;
  return true;
}

export interface BeginOpts {
  kind: StorylineKind;
  /** Role -> person. Every LIVING cast member gets the storyline pushed. */
  cast: Record<string, PersonId>;
  houses?: number[];
  data?: Record<string, unknown>;
  stage: string;
  /** Months until the first gated beat check (spawn beats fire immediately). */
  firstBeatIn: number;
}

export function beginStoryline(ctx: Ctx, opts: BeginOpts): Storyline {
  const world = ctx.world;
  const id = nextId(world, "storyline") as StorylineId;
  const s: Storyline = {
    id,
    kind: opts.kind,
    stage: opts.stage,
    started: world.now,
    ended: null,
    cast: { ...opts.cast },
    houses: [...(opts.houses ?? [])],
    events: [],
    nextBeat: world.now + Math.max(1, opts.firstBeatIn),
    data: { ...(opts.data ?? {}) },
    resolved: false,
    outcome: null,
  };
  world.storylines.set(id, s);
  for (const pid of castIds(s)) {
    const p = world.people.get(pid);
    if (p && p.died === null && !p.storylines.includes(id)) p.storylines.push(id);
  }
  return s;
}

/** Unique cast person ids, ascending (stable regardless of role order). */
export function castIds(s: Storyline): PersonId[] {
  const out = new Set<PersonId>();
  for (const role of Object.keys(s.cast)) out.add(s.cast[role]);
  return [...out].sort((a, b) => a - b);
}

/** Add a person to the cast mid-arc, keeping person.storylines in step. */
export function addCastMember(world: World, s: Storyline, role: string, p: Person): void {
  s.cast[role] = p.id;
  if (p.died === null && !p.storylines.includes(s.id)) p.storylines.push(s.id);
}

/**
 * Close a storyline: outcome text, cast released, cooldowns stamped.
 * Every ending (even a fizzle) should have recorded its closing beat first.
 */
export function endStoryline(ctx: Ctx, s: Storyline, outcome: string): void {
  const world = ctx.world;
  if (s.resolved) return;
  s.resolved = true;
  s.ended = world.now;
  s.outcome = outcome;
  s.nextBeat = world.now; // no further gating
  const cd = KIND_COOLDOWN[s.kind] ?? 240;
  for (const pid of castIds(s)) {
    const p = world.people.get(pid);
    if (!p) continue;
    const idx = p.storylines.indexOf(s.id);
    if (idx >= 0) p.storylines.splice(idx, 1);
    if (p.died === null) {
      p.flags[SF.cdPrefix + s.kind] = world.now + cd;
      const prevAny = flagNum(p, SF.cdAny) ?? 0;
      p.flags[SF.cdAny] = Math.max(prevAny, world.now + ANY_COOLDOWN);
    }
  }
}

// ---------------------------------------------------------------------------
// Durable module state: the echo queue (world.conditions, JSON-serializable)
// ---------------------------------------------------------------------------

export interface EchoPlan {
  seq: number;
  due: SimDate;
  storyline: StorylineId;
  kind: "song" | "omen" | "miracle";
  cause: EventId | null;
  location: SettlementId | null;
  /** Prose fragment the echo event carries ("the feud of two proud houses"). */
  theme: string;
  data?: Record<string, unknown>;
}

export interface StoryState {
  echoes: EchoPlan[];
  nextEchoSeq: number;
}

export function storyState(world: World): StoryState {
  let s = world.conditions["story.state"] as StoryState | undefined;
  if (!s) {
    s = { echoes: [], nextEchoSeq: 1 };
    world.conditions["story.state"] = s;
  }
  return s;
}

export function scheduleEcho(
  world: World,
  plan: Omit<EchoPlan, "seq">,
): void {
  const state = storyState(world);
  state.echoes.push({ ...plan, seq: state.nextEchoSeq++ });
}

// ---------------------------------------------------------------------------
// Epithets
// ---------------------------------------------------------------------------

/**
 * On a climactic deed: record nickname-earned AND set person.epithet, via
 * the language service with a theme matching the deed. No-op for people who
 * already carry a name the world knows them by.
 */
export function bestowEpithet(
  ctx: Ctx,
  rng: Rng,
  s: Storyline | null,
  p: Person,
  theme: string,
  reason: string,
  cause: EventId | null,
): EventRecord | null {
  if (p.epithet !== "") return null;
  const world = ctx.world;
  const lang = langOf(world, p);
  if (!lang) return null;
  const epithet = ctx.services.language.epithet(rng.fork("epithet", p.id), lang, theme);
  p.epithet = epithet;
  const ev = ctx.record({
    type: "nickname-earned",
    date: world.now,
    participants: { subject: p.id },
    data: { epithet, reason },
    ...whereabouts(world, p),
    importance: 12,
    causes: cause != null ? [cause] : [],
    storyline: s?.id ?? null,
    secret: false,
  });
  return ev;
}
