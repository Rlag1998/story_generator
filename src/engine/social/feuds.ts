/**
 * House feuds: symmetric intensities on House.feuds, bumped by hostile
 * member-versus-member events (duels, brawls, discovered affairs) and
 * cooled by a slow yearly decay. Crossing the active threshold records
 * feud-began / feud-ended so the chronicle can trace a feud's life.
 */

import type { Ctx, EventId, House, HouseId, Person, PersonId } from "../core/types";
import { sortedIds } from "../core/world";
import { clamp01, livingPerson, regionOf } from "./helpers";

/** Intensity at which a feud is openly acknowledged. */
export const FEUD_ACTIVE = 0.12;
/** Yearly retention. */
const FEUD_FADE = 0.9;
/** Below this the last ember goes out. */
const FEUD_COLD = 0.05;

/**
 * Raise the feud between two houses (both directions kept equal).
 * Records feud-began when the active threshold is first crossed.
 */
export function bumpFeud(
  ctx: Ctx,
  ha: HouseId,
  hb: HouseId,
  amount: number,
  cause: EventId | null,
): void {
  if (ha === hb) return;
  const world = ctx.world;
  const A = world.houses.get(ha);
  const B = world.houses.get(hb);
  if (!A || !B) return;
  const prev = Math.max(A.feuds.get(hb) ?? 0, B.feuds.get(ha) ?? 0);
  const next = clamp01(prev + amount);
  A.feuds.set(hb, next);
  B.feuds.set(ha, next);
  if (prev < FEUD_ACTIVE && next >= FEUD_ACTIVE) {
    const participants: Record<string, PersonId> = {};
    const headA = livingPerson(world, A.head);
    const headB = livingPerson(world, B.head);
    if (headA) participants.a = headA.id;
    if (headB) participants.b = headB.id;
    ctx.record({
      type: "feud-began",
      date: world.now,
      participants,
      // houses: the two house ids; intensity: current heat 0..1.
      data: { houses: [ha, hb], intensity: next },
      location: A.seat,
      region: regionOf(world, A.seat),
      importance: 14,
      causes: cause != null ? [cause] : [],
      storyline: null,
      secret: false,
    });
  }
}

/** Bump the feud between two people's houses, if both belong to houses. */
export function bumpFeudBetweenPersons(
  ctx: Ctx,
  a: Person,
  b: Person,
  amount: number,
  cause: EventId | null,
): void {
  if (a.house == null || b.house == null || a.house === b.house) return;
  bumpFeud(ctx, a.house, b.house, amount, cause);
}

/**
 * Yearly cooling. A feud that drops below the active threshold records
 * feud-ended; the last cold ember is swept away silently.
 */
export function decayFeuds(ctx: Ctx): void {
  const world = ctx.world;
  // Collect each feuding pair once, in deterministic order.
  const pairs: [HouseId, HouseId][] = [];
  const seen = new Set<string>();
  for (const hid of sortedIds(world.houses)) {
    const h = world.houses.get(hid)!;
    for (const oid of sortedIds(h.feuds)) {
      const lo = Math.min(hid, oid);
      const hi = Math.max(hid, oid);
      const key = `${lo}:${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([lo, hi]);
    }
  }
  for (const [lo, hi] of pairs) {
    const A = world.houses.get(lo);
    const B = world.houses.get(hi);
    const prev = Math.max(A?.feuds.get(hi) ?? 0, B?.feuds.get(lo) ?? 0);
    const next = prev * FEUD_FADE;
    if (next < FEUD_COLD) {
      A?.feuds.delete(hi);
      B?.feuds.delete(lo);
      continue;
    }
    A?.feuds.set(hi, next);
    B?.feuds.set(lo, next);
    if (prev >= FEUD_ACTIVE && next < FEUD_ACTIVE && A && B) {
      recordFeudEnded(ctx, A, B, next);
    }
  }
}

function recordFeudEnded(ctx: Ctx, A: House, B: House, intensity: number): void {
  const world = ctx.world;
  const participants: Record<string, PersonId> = {};
  const headA = livingPerson(world, A.head);
  const headB = livingPerson(world, B.head);
  if (headA) participants.a = headA.id;
  if (headB) participants.b = headB.id;
  ctx.record({
    type: "feud-ended",
    date: world.now,
    participants,
    // houses: the two house ids; the feud has cooled to embers.
    data: { houses: [A.id, B.id], intensity },
    location: A.seat,
    region: regionOf(world, A.seat),
    importance: 8,
    causes: [],
    storyline: null,
    secret: false,
  });
}
