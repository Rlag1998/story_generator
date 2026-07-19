/**
 * World construction + deterministic access helpers + the chronicle.
 */

import type {
  EventId,
  EventRecord,
  Person,
  PersonId,
  World,
  WorldParams,
} from "./types";
import type { SimDate } from "./time";
import { makeDate } from "./time";

export function createEmptyWorld(params: WorldParams): World {
  return {
    params,
    now: makeDate(params.startYear, 1),
    nextIds: {},
    people: new Map(),
    houses: new Map(),
    cultures: new Map(),
    religions: new Map(),
    languages: new Map(),
    regions: new Map(),
    settlements: new Map(),
    polities: new Map(),
    events: new Map(),
    storylines: new Map(),
    relationships: new Map(),
    memories: new Map(),
    eventsByMonth: new Map(),
    alive: new Set(),
    conditions: {},
    stats: { alive: 0, totalBorn: 0, totalDied: 0, year: params.startYear },
  };
}

/** Allocate the next id for an entity kind ("person", "house", ...). */
export function nextId(world: World, kind: string): number {
  const n = (world.nextIds[kind] ?? 1);
  world.nextIds[kind] = n + 1;
  return n;
}

/** Ascending-id iteration (Maps preserve insertion order, but be explicit). */
export function sortedIds<K extends number, V>(map: Map<K, V>): K[] {
  return [...map.keys()].sort((a, b) => a - b);
}

/** Living people in ascending id order — the canonical tick iteration. */
export function livingIds(world: World): PersonId[] {
  return [...world.alive].sort((a, b) => a - b);
}

export function getPerson(world: World, id: PersonId): Person {
  const p = world.people.get(id);
  if (!p) throw new Error(`No person ${id}`);
  return p;
}

// ---------------------------------------------------------------------------
// Chronicle
// ---------------------------------------------------------------------------

export function recordEvent(
  world: World,
  ev: Omit<EventRecord, "id" | "consequences" | "revealed"> &
    Partial<Pick<EventRecord, "revealed">>,
): EventRecord {
  const id = nextId(world, "event") as EventId;
  const rec: EventRecord = {
    ...ev,
    id,
    consequences: [],
    revealed: ev.revealed ?? null,
  };
  world.events.set(id, rec);
  const bucket = world.eventsByMonth.get(rec.date);
  if (bucket) bucket.push(id);
  else world.eventsByMonth.set(rec.date, [id]);
  // Maintain cause -> consequence backlinks.
  for (const cid of rec.causes) {
    const cause = world.events.get(cid);
    if (cause && !cause.consequences.includes(id)) cause.consequences.push(id);
  }
  // Notability accrues to participants.
  for (const key of Object.keys(rec.participants)) {
    const p = world.people.get(rec.participants[key]);
    if (p) p.notability += rec.importance;
  }
  // Storyline linkage.
  if (rec.storyline != null) {
    const s = world.storylines.get(rec.storyline);
    if (s && !s.events.includes(id)) s.events.push(id);
  }
  return rec;
}

/** All events involving a person, ascending by date then id. */
export function eventsOf(world: World, person: PersonId): EventRecord[] {
  const out: EventRecord[] = [];
  for (const ev of world.events.values()) {
    for (const k of Object.keys(ev.participants)) {
      if (ev.participants[k] === person) {
        out.push(ev);
        break;
      }
    }
  }
  out.sort((a, b) => a.date - b.date || a.id - b.id);
  return out;
}

/** Events in a date range (inclusive), ascending. */
export function eventsBetween(world: World, from: SimDate, to: SimDate): EventRecord[] {
  const out: EventRecord[] = [];
  for (let d = from; d <= to; d++) {
    const bucket = world.eventsByMonth.get(d);
    if (bucket) for (const id of bucket) out.push(world.events.get(id)!);
  }
  return out;
}

/** Reveal a secret event to the world at date `when`. */
export function revealEvent(world: World, id: EventId, when: SimDate): void {
  const ev = world.events.get(id);
  if (ev && ev.secret) {
    ev.secret = false;
    ev.revealed = when;
  }
}
