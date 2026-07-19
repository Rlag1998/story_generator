/**
 * Shared helpers for the social module: flag keys, small deterministic
 * utilities, personality arithmetic, and the per-tick settlement index.
 *
 * All state lives on the World (relationships, memories, person flags);
 * the module itself holds nothing between ticks.
 */

import type {
  Culture,
  Person,
  PersonId,
  Personality,
  RegionId,
  SettlementId,
  World,
} from "../core/types";

/** Flag keys this module reads/writes on Person.flags (all namespaced). */
export const F = {
  /** PersonId of the one they pine for, unrequited. */
  pining: "social.pining",
  /** Count of duels won. */
  duelVictor: "social.duel-victor",
  /** Set on a betrayed spouse; the people module processes the divorce. */
  divorcePending: "social.divorce-pending",
  /** + otherId -> EventId of the secret affair-began (both lovers carry it). */
  affairEvPrefix: "social.affair-ev:",
  /** + otherId -> escalation stage ("insult" | "quarrel"); lower id holds it. */
  escStagePrefix: "social.esc:",
  /** + otherId -> EventId of the latest escalation beat; lower id holds it. */
  escEvPrefix: "social.esc-ev:",
  /** + otherId -> EventId of the friendship-formed event. */
  friendEvPrefix: "social.friend-ev:",
  /** + otherId -> EventId of the rivalry-formed event. */
  rivalEvPrefix: "social.rival-ev:",
  /** + otherId -> EventId of the romance-began event. */
  romanceEvPrefix: "social.romance-ev:",
  /** Contract-named flag owned by the people module. */
  emigrated: "emigrated",
} as const;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/** The person, if they exist and are living (not dead, not emigrated). */
export function livingPerson(world: World, id: PersonId | null | undefined): Person | null {
  if (id == null) return null;
  const p = world.people.get(id);
  if (!p || p.died !== null || !world.alive.has(id)) return null;
  return p;
}

export function cultureOf(world: World, p: Person): Culture | null {
  return world.cultures.get(p.culture) ?? null;
}

export function adulthoodAgeOf(world: World, p: Person): number {
  return world.cultures.get(p.culture)?.adulthoodAge ?? 16;
}

export function regionOf(world: World, sid: SettlementId | null): RegionId | null {
  if (sid == null) return null;
  return world.settlements.get(sid)?.region ?? null;
}

/** Event location/region fields for a person's whereabouts. */
export function whereabouts(
  world: World,
  p: Person,
): { location: SettlementId | null; region: RegionId | null } {
  return { location: p.location, region: regionOf(world, p.location) };
}

/** Whereabouts of the first of the pair who is somewhere. */
export function pairWhereabouts(
  world: World,
  a: Person,
  b: Person,
): { location: SettlementId | null; region: RegionId | null } {
  return a.location != null ? whereabouts(world, a) : whereabouts(world, b);
}

export function settlementName(world: World, sid: SettlementId | null): string {
  if (sid == null) return "the village";
  return world.settlements.get(sid)?.name ?? "the village";
}

export function isMarried(p: Person): boolean {
  return p.marriages.some((m) => m.active);
}

/** Living active spouses in ascending id order. */
export function activeSpouses(world: World, p: Person): Person[] {
  const ids = p.marriages
    .filter((m) => m.active)
    .map((m) => m.spouse)
    .sort((a, b) => a - b);
  const out: Person[] = [];
  for (const id of ids) {
    const s = world.people.get(id);
    if (s && s.died === null) out.push(s);
  }
  return out;
}

export function warApt(p: Person): number {
  return p.phenotype.aptitudes.war ?? 0;
}

export function intrigueApt(p: Person): number {
  return p.phenotype.aptitudes.intrigue ?? 0;
}

/**
 * Read all "prefix<otherId>" flags of a person, sorted by otherId.
 * Object key order never matters: the result is explicitly sorted.
 */
export function pairFlags(
  p: Person,
  prefix: string,
): [PersonId, number | string | boolean][] {
  const out: [PersonId, number | string | boolean][] = [];
  for (const key of Object.keys(p.flags)) {
    if (!key.startsWith(prefix)) continue;
    const other = Number(key.slice(prefix.length));
    if (Number.isFinite(other)) out.push([other, p.flags[key]]);
  }
  out.sort((x, y) => x[0] - y[0]);
  return out;
}

/**
 * How well two temperaments sit together, 0..1. Alike in outlook and
 * industry, jointly agreeable, jointly calm, alike in devotion.
 */
export function personalityCompat(a: Personality, b: Personality): number {
  const near = (x: number, y: number, span: number) =>
    1 - Math.min(1, Math.abs(x - y) / span);
  let c = 0;
  c += 0.3 * near(a.openness, b.openness, 1.4);
  c += 0.2 * near(a.diligence, b.diligence, 1.4);
  c += 0.2 * ((a.agreeableness + b.agreeableness) / 4 + 0.5);
  c += 0.15 * (1 - Math.max(0, (a.volatility + b.volatility) / 2));
  c += 0.15 * near(a.piety, b.piety, 1);
  return clamp01(c);
}

/** Living people by settlement, ascending ids (built once per tick). */
export type SettlementIndex = Map<SettlementId, PersonId[]>;

export function buildSettlementIndex(world: World, ids: PersonId[]): SettlementIndex {
  const index: SettlementIndex = new Map();
  for (const id of ids) {
    const p = world.people.get(id);
    if (!p || p.location == null) continue;
    const list = index.get(p.location);
    if (list) list.push(id);
    else index.set(p.location, [id]);
  }
  return index;
}
