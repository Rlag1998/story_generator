/**
 * Small deterministic utilities for the economy module: resident lookups,
 * bounded wealth adjustments, geography helpers, war counting.
 *
 * Everything iterates in ascending-id order (livingIds/sortedIds) so the
 * module never depends on Map insertion order.
 */

import type { Rng } from "../core/rng";
import { yearsBetween } from "../core/time";
import type {
  Language,
  Person,
  PersonId,
  ProfessionKey,
  Region,
  RegionId,
  Settlement,
  SettlementId,
  World,
} from "../core/types";
import { livingIds, sortedIds } from "../core/world";

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Living, present residents of a settlement, ascending id order. */
export function residentsOf(world: World, sid: SettlementId): Person[] {
  const out: Person[] = [];
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (p && p.location === sid && p.died === null) out.push(p);
  }
  return out;
}

export function ageYears(world: World, p: Person): number {
  return Math.max(0, yearsBetween(p.born, world.now));
}

/** Bounded wealth adjustment: 0 destitute .. 5 opulent. Sparing by design. */
export function bumpWealth(p: Person, delta: number): void {
  p.status.wealth = clamp(Math.round(p.status.wealth + delta), 0, 5);
}

/** Residents matching a profession set, ascending id order. */
export function residentsByProfession(
  world: World,
  sid: SettlementId,
  professions: readonly ProfessionKey[],
): Person[] {
  return residentsOf(world, sid).filter((p) => professions.includes(p.status.profession));
}

/** All settlements of a region as objects, ascending id order. */
export function settlementsOfRegion(world: World, region: Region): Settlement[] {
  const out: Settlement[] = [];
  for (const sid of [...region.settlements].sort((a, b) => a - b)) {
    const s = world.settlements.get(sid);
    if (s) out.push(s);
  }
  return out;
}

/** Adjacent region ids, ascending, existing regions only. */
export function neighborsOf(world: World, region: Region): RegionId[] {
  return [...region.adjacent].filter((r) => world.regions.has(r)).sort((a, b) => a - b);
}

export function regionHasPort(world: World, region: Region): boolean {
  return settlementsOfRegion(world, region).some((s) => s.kind === "port");
}

/**
 * The language spoken around a settlement: via its polity's culture, falling
 * back to a resident's culture, then to the first language in the world.
 */
export function languageNear(world: World, s: Settlement | null): Language | null {
  if (s) {
    const polity = world.polities.get(s.polity);
    if (polity) {
      const culture = world.cultures.get(polity.culture);
      const lang = culture ? world.languages.get(culture.language) : undefined;
      if (lang) return lang;
    }
    const folk = residentsOf(world, s.id);
    if (folk.length > 0) {
      const culture = world.cultures.get(folk[0].culture);
      const lang = culture ? world.languages.get(culture.language) : undefined;
      if (lang) return lang;
    }
  }
  const ids = sortedIds(world.languages);
  return ids.length > 0 ? (world.languages.get(ids[0]) ?? null) : null;
}

/** Count of distinct polity pairs currently at war (plague fuel). */
export function warsActive(world: World): number {
  let count = 0;
  for (const pid of sortedIds(world.polities)) {
    const polity = world.polities.get(pid)!;
    for (const other of sortedIds(polity.relations)) {
      if (other <= pid) continue; // dedupe pairs
      const rel = polity.relations.get(other);
      if (rel && rel.stance === "war") count++;
    }
  }
  return count;
}

/**
 * Pick up to n distinct people from a pool, weighted, without disturbing
 * the caller's rng beyond the provided fork. Pool must be in stable order.
 */
export function pickWeightedPeople(
  rng: Rng,
  pool: readonly Person[],
  weightOf: (p: Person) => number,
  n: number,
): Person[] {
  const remaining = pool.slice();
  const out: Person[] = [];
  while (out.length < n && remaining.length > 0) {
    const weights = remaining.map((p) => Math.max(0.0001, weightOf(p)));
    const chosen = rng.weighted(remaining, weights);
    out.push(chosen);
    remaining.splice(remaining.indexOf(chosen), 1);
  }
  return out;
}

export function idsOf(people: readonly Person[]): PersonId[] {
  return people.map((p) => p.id);
}

export function capitalize(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}
