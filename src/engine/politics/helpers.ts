/**
 * Shared helpers for the politics module: flag keys, pure age/kin utilities,
 * polity and house queries, and the module's durable working state (wars,
 * crises, bookkeeping) kept JSON-serializable inside world.conditions.
 */

import { yearsBetween } from "../core/time";
import type { SimDate } from "../core/time";
import type {
  Culture,
  EventId,
  House,
  HouseId,
  Language,
  Person,
  PersonId,
  Polity,
  PolityId,
  RegionId,
  SettlementId,
  World,
} from "../core/types";
import { livingIds, sortedIds } from "../core/world";

// ---------------------------------------------------------------------------
// Flag keys
// ---------------------------------------------------------------------------

/** Person.flags keys this module reads and writes. */
export const PF = {
  /** Set on succession candidates with teeth; value = PolityId claimed. */
  claimant: "pol.claimant",
  /** Set on battle survivors of note; value = EventId of the battle. */
  warHero: "pol.war-hero",
  /** True for consorts who wed INTO a house (no blood claim). */
  marriedIn: "pol.married-in",
  /** Set on rulers unseated by coup; value = PolityId lost. */
  deposed: "pol.deposed",
  /** SimDate of the last honor granted (throttles repeat grants). */
  honored: "pol.honored",
  /** Value = PolityId a person currently stewards as regent. */
  regent: "pol.regent",
  /** Foreign flags read here (set by the story module). */
  masterwork: "story.masterwork-done",
  coupReadyPrefix: "story.coup-ready:",
  /** People-module betrothal conventions we cooperate with. */
  wedAfter: "people.wed-after",
  betrothalEvent: "people.betrothal-event",
} as const;

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// ---------------------------------------------------------------------------
// Pure person utilities (successionLine gets no services, so these are local)
// ---------------------------------------------------------------------------

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

/** Alive, present in the world (not emigrated or vanished). */
export function isLiving(world: World, id: PersonId | null | undefined): boolean {
  if (id == null) return false;
  const p = world.people.get(id);
  return !!p && p.died === null && world.alive.has(id) && p.flags["emigrated"] !== true;
}

export function livingPerson(world: World, id: PersonId | null | undefined): Person | null {
  if (id == null || !isLiving(world, id)) return null;
  return world.people.get(id) ?? null;
}

/** Children as Person records, eldest first (born asc, then id). */
export function childrenByAge(world: World, p: Person): Person[] {
  const out: Person[] = [];
  for (const cid of p.children) {
    const c = world.people.get(cid);
    if (c) out.push(c);
  }
  out.sort((a, b) => a.born - b.born || a.id - b.id);
  return out;
}

export function cultureOf(world: World, p: Person): Culture | null {
  return world.cultures.get(p.culture) ?? null;
}

export function languageOfCulture(world: World, cultureId: number): Language | null {
  const culture = world.cultures.get(cultureId);
  if (!culture) return null;
  return world.languages.get(culture.language) ?? null;
}

export function regionOfSettlement(world: World, sid: SettlementId | null): RegionId | null {
  if (sid == null) return null;
  return world.settlements.get(sid)?.region ?? null;
}

export function polityOfPerson(world: World, p: Person): Polity | null {
  if (p.location == null) return null;
  const s = world.settlements.get(p.location);
  if (!s) return null;
  return world.polities.get(s.polity) ?? null;
}

/** Ruler display title for a person's sex. */
export function rulerTitle(polity: Polity, sex: "f" | "m"): string {
  return sex === "f" ? polity.rulerTitleF : polity.rulerTitleM;
}

/** "Lord"/"Lady" flavored by culture (clan cultures say "Thane"/"Thegn"?). */
export function lordTitle(culture: Culture | null, sex: "f" | "m"): string {
  const clanFolk = culture ? isClanCulture(culture) : false;
  if (clanFolk) return sex === "f" ? "Matron" : "Thane";
  return sex === "f" ? "Lady" : "Lord";
}

/** Whether a culture styles its great families "Clan" rather than "House". */
export function isClanCulture(culture: Culture): boolean {
  return (
    culture.values.includes("kinship") ||
    culture.values.includes("conquest") ||
    culture.values.includes("vengeance")
  );
}

// ---------------------------------------------------------------------------
// Polity / house queries (all iteration in sorted id order)
// ---------------------------------------------------------------------------

export function politiesSorted(world: World): Polity[] {
  return sortedIds(world.polities).map((id) => world.polities.get(id)!);
}

/** Houses seated inside a polity's borders (allegiance follows the seat). */
export function housesOfPolity(world: World, polity: Polity): House[] {
  const out: House[] = [];
  for (const hid of sortedIds(world.houses)) {
    const h = world.houses.get(hid)!;
    if (h.seat == null) continue;
    const s = world.settlements.get(h.seat);
    if (s && s.polity === polity.id) out.push(h);
  }
  return out;
}

/** Living members of a house, ascending id. O(pop): call sparingly. */
export function livingHouseMembers(world: World, houseId: HouseId): Person[] {
  const out: Person[] = [];
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (p && p.house === houseId && p.died === null && p.flags["emigrated"] !== true) {
      out.push(p);
    }
  }
  return out;
}

/** One pass over the living, bucketed by house. */
export function houseMemberIndex(world: World): Map<HouseId, Person[]> {
  const index = new Map<HouseId, Person[]>();
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (!p || p.house == null || p.died !== null || p.flags["emigrated"] === true) continue;
    const list = index.get(p.house);
    if (list) list.push(p);
    else index.set(p.house, [p]);
  }
  return index;
}

/** All settlements of a polity, ascending id. */
export function settlementsOfPolity(world: World, polity: Polity): SettlementId[] {
  const out: SettlementId[] = [];
  for (const rid of polity.regions) {
    const region = world.regions.get(rid);
    if (!region) continue;
    for (const sid of region.settlements) out.push(sid);
  }
  return out.sort((a, b) => a - b);
}

/** The public death event recorded for a person this month, if any. */
export function deathEventOf(world: World, deceased: Person): EventId | null {
  const bucket = world.eventsByMonth.get(world.now);
  if (!bucket) return null;
  for (let i = bucket.length - 1; i >= 0; i--) {
    const ev = world.events.get(bucket[i]);
    if (ev && ev.type === "death" && ev.participants["subject"] === deceased.id) return ev.id;
  }
  return null;
}

/** Set a symmetric diplomatic stance between two polities. */
export function setStance(
  a: Polity,
  b: Polity,
  stance: "war" | "peace" | "alliance" | "rivalry",
  since: SimDate,
): void {
  a.relations.set(b.id, { stance, since });
  b.relations.set(a.id, { stance, since });
}

export function stanceBetween(a: Polity, b: PolityId): "war" | "peace" | "alliance" | "rivalry" {
  return a.relations.get(b)?.stance ?? "peace";
}

/** True when the two polities share at least one region border. */
export function bordering(world: World, a: Polity, b: Polity): boolean {
  const bRegions = new Set(b.regions);
  for (const rid of a.regions) {
    const region = world.regions.get(rid);
    if (!region) continue;
    for (const adj of region.adjacent) if (bRegions.has(adj)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Durable module state (kept in world.conditions, JSON-serializable)
// ---------------------------------------------------------------------------

export interface WarState {
  id: number;
  attacker: PolityId;
  defender: PolityId;
  began: SimDate;
  /** Chronicle id of the war-declared event (causal parent for battles). */
  declaredEvent: EventId;
  /** Positive score favors the attacker; +-30 ends the war decisively. */
  score: number;
  /** Rises with every battle and every marching season; 100 forces peace. */
  weariness: number;
  battles: number;
  lastBattle: SimDate;
  /** Event id of the most recent battle, for peace causality. */
  lastBattleEvent: EventId | null;
  casus: string;
}

export interface CrisisState {
  polity: PolityId;
  since: SimDate;
  event: EventId;
  resolveAfter: SimDate;
}

export interface PolState {
  wars: WarState[];
  nextWarId: number;
  /** polity id (as string key) -> SimDate the last war ended. */
  lastWarEnd: Record<string, SimDate>;
  /** polity id (as string key) -> open succession crisis. */
  crises: Record<string, CrisisState>;
  /** House ids whose extinction has already been mourned in the chronicle. */
  extinctHouses: number[];
}

export function polState(world: World): PolState {
  let s = world.conditions["pol.state"] as PolState | undefined;
  if (!s) {
    s = { wars: [], nextWarId: 1, lastWarEnd: {}, crises: {}, extinctHouses: [] };
    world.conditions["pol.state"] = s;
  }
  return s;
}

export function warBetween(state: PolState, a: PolityId, b: PolityId): WarState | null {
  for (const w of state.wars) {
    if ((w.attacker === a && w.defender === b) || (w.attacker === b && w.defender === a)) return w;
  }
  return null;
}

export function atWar(state: PolState, id: PolityId): boolean {
  return state.wars.some((w) => w.attacker === id || w.defender === id);
}
