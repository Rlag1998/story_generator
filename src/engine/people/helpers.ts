/**
 * Shared helpers for the people module: ages, life stages, flags, local
 * conditions, marriage bookkeeping and small deterministic utilities.
 */

import type { Rng } from "../core/rng";
import { yearsBetween } from "../core/time";
import type {
  Culture,
  LifeStage,
  Marriage,
  Person,
  PersonId,
  RegionId,
  Settlement,
  SettlementId,
  Tradition,
  World,
} from "../core/types";

/** Flag keys this module reads/writes on Person.flags. */
export const F = {
  lastBirth: "people.last-birth", // SimDate of most recent delivery
  apprenticeCraft: "people.apprentice-craft", // ProfessionKey chosen as a youth
  apprenticeEvent: "people.apprentice-event", // EventId of the apprenticed event
  wedAfter: "people.wed-after", // SimDate before which a betrothal waits
  betrothalEvent: "people.betrothal-event", // EventId for wedding causes
  mourningUntil: "people.mourning-until", // SimDate; no courting before this
  guardian: "people.guardian", // PersonId of an orphan's guardian
  retired: "people.retired", // true once retired from a profession
  formerProfession: "people.former-profession", // ProfessionKey before retiring
  handfastDue: "people.handfast-due", // SimDate a handfast marriage lapses
  founder: "people.founder", // true for pre-history founders
  /** Contract-named flags shared with other modules. */
  emigrated: "emigrated",
  loveMatch: "love-match",
  divorcePending: "social.divorce-pending",
  /** Prefixes for per-illness bookkeeping. */
  illEventPrefix: "people.ill-ev:", // + illness name -> EventId of onset
  immunePrefix: "people.immune:", // + plague name -> true (survivor)
} as const;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

/** Whole years at world.now, capped at death for the dead. */
export function ageOf(world: World, p: Person): number {
  const until = p.died !== null && p.died < world.now ? p.died : world.now;
  return Math.max(0, yearsBetween(p.born, until));
}

export function adulthoodAgeOf(world: World, p: Person): number {
  return world.cultures.get(p.culture)?.adulthoodAge ?? 16;
}

export function lifeStageOf(world: World, p: Person): LifeStage {
  const a = ageOf(world, p);
  const adult = adulthoodAgeOf(world, p);
  if (a < 3) return "infant";
  if (a < Math.min(12, adult)) return "child";
  if (a < adult) return "youth";
  if (a < 60) return "adult";
  return "elder";
}

export function cultureOf(world: World, p: Person): Culture | null {
  return world.cultures.get(p.culture) ?? null;
}

export function settlementOf(world: World, p: Person): Settlement | null {
  return p.location != null ? (world.settlements.get(p.location) ?? null) : null;
}

export function regionOf(world: World, sid: SettlementId | null): RegionId | null {
  if (sid == null) return null;
  return world.settlements.get(sid)?.region ?? null;
}

/** Event location/region fields for a person's whereabouts. */
export function whereabouts(world: World, p: Person): { location: SettlementId | null; region: RegionId | null } {
  return { location: p.location, region: regionOf(world, p.location) };
}

export function activeMarriages(p: Person): Marriage[] {
  return p.marriages.filter((m) => m.active);
}

export function activeSpouseIds(p: Person): PersonId[] {
  return activeMarriages(p).map((m) => m.spouse);
}

export function isMarried(p: Person): boolean {
  return p.marriages.some((m) => m.active);
}

/** The person, if they exist and are living (not dead, not emigrated). */
export function livingPerson(world: World, id: PersonId | null | undefined): Person | null {
  if (id == null) return null;
  const p = world.people.get(id);
  if (!p || p.died !== null || !world.alive.has(id)) return null;
  return p;
}

export function numFlag(p: Person, key: string): number | null {
  const v = p.flags[key];
  return typeof v === "number" ? v : null;
}

export function hasRareTrait(p: Person, key: string): boolean {
  return p.phenotype.rareTraits.includes(key);
}

/** Pick a culture tradition carrying the given hook, if any. */
export function traditionFor(culture: Culture | null, hook: string, rng: Rng): Tradition | null {
  if (!culture) return null;
  const list = culture.traditions.filter((t) => t.hooks.includes(hook));
  if (list.length === 0) return null;
  return list.length === 1 ? list[0] : rng.pick(list);
}

// ---------------------------------------------------------------------------
// Local conditions (set by the economy module on settlement.conditions)
// ---------------------------------------------------------------------------

export interface LocalConditions {
  /** 0..1 famine intensity. */
  famine: number;
  /** Active plague name, or null. */
  plagueName: string | null;
  /** 0..1 plague severity (settlement.conditions.plagueSeverity). */
  plagueSeverity: number;
}

/**
 * Defensive read of settlement conditions. Recognizes:
 *   famine: boolean | number (0..1), famineSeverity: number
 *   plague: string (name) | boolean, plagueSeverity: number (0..1)
 */
export function localConditions(s: Settlement | null): LocalConditions {
  if (!s) return { famine: 0, plagueName: null, plagueSeverity: 0 };
  const c = s.conditions;
  let famine = 0;
  const f = c["famine"];
  if (typeof f === "number") famine = clamp01(f);
  else if (f === true) famine = 0.6;
  const fs = c["famineSeverity"];
  if (typeof fs === "number") famine = Math.max(famine, clamp01(fs));

  let plagueName: string | null = null;
  let plagueSeverity = 0;
  const pl = c["plague"];
  if (typeof pl === "string" && pl.length > 0) plagueName = pl;
  else if (pl === true) plagueName = "the plague";
  const ps = c["plagueSeverity"];
  if (typeof ps === "number") plagueSeverity = clamp01(ps);
  if (plagueName && plagueSeverity === 0) plagueSeverity = 0.5;
  if (!plagueName && plagueSeverity > 0) plagueName = "the plague";
  return { famine, plagueName, plagueSeverity };
}

/** Fraction of the population cap currently in use. */
export function capRatio(world: World): number {
  return world.alive.size / Math.max(1, world.params.popCap);
}
