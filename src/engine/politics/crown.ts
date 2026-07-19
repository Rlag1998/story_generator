/**
 * Reign bookkeeping shared by succession, coups and crisis resolution:
 * closing reigns, seating new rulers, and recording coronations.
 */

import type { Ctx, EventId, EventRecord, Person, PersonId, Polity } from "../core/types";
import type { Rng } from "../core/rng";
import { yearsBetween } from "../core/time";
import {
  PF,
  adulthoodAgeOf,
  clamp,
  languageOfCulture,
  livingPerson,
  regionOfSettlement,
  rulerTitle,
} from "./helpers";
import { coronationRite } from "./prose";

/** Close the sitting reign (if any) as of now. */
export function closeReign(polity: Polity, now: number): void {
  for (let i = polity.reigns.length - 1; i >= 0; i--) {
    const r = polity.reigns[i];
    if (r.to === null) {
      r.to = now;
      break;
    }
  }
}

export interface CrownOpts {
  causes: EventId[];
  /** True when the seat was won out of a crisis or against rivals. */
  disputed?: boolean;
  /** True when the seat was taken, not inherited. */
  usurped?: boolean;
  /** Extra data merged into the coronation payload. */
  data?: Record<string, unknown>;
}

/**
 * Seat a new ruler: reigns, titles, court cleanup, regency for minors, and
 * the coronation event. Returns the coronation record.
 */
export function crownRuler(
  ctx: Ctx,
  rng: Rng,
  polity: Polity,
  heir: Person,
  opts: CrownOpts,
): EventRecord {
  const world = ctx.world;
  closeReign(polity, world.now);
  polity.ruler = heir.id;
  if (heir.house != null) polity.rulingHouse = heir.house;
  polity.reigns.push({ ruler: heir.id, from: world.now, to: null });

  heir.status.rank = 5;
  heir.status.profession = "ruler";
  const title = `${rulerTitle(polity, heir.sex)} of ${polity.name}`;
  if (!heir.status.titles.includes(title)) heir.status.titles.push(title);
  delete heir.flags[PF.claimant];

  // A crowned head vacates any court office it held.
  for (const role of [...polity.court.keys()].sort()) {
    if (polity.court.get(role) === heir.id) polity.court.delete(role);
  }

  const religion = world.religions.get(polity.religion) ?? null;
  const data: Record<string, unknown> = {
    polity: polity.id,
    rite: coronationRite(rng.fork("rite"), polity.kind, religion),
    ...(opts.data ?? {}),
  };
  if (opts.disputed) data.disputed = true;
  if (opts.usurped) data.usurped = true;

  // A child on the high seat needs a steadier hand beside it.
  const age = Math.max(0, yearsBetween(heir.born, world.now));
  const minor = age < adulthoodAgeOf(world, heir);
  const participants: Record<string, PersonId> = { ruler: heir.id };
  if (minor) {
    const regent = chooseRegent(ctx, polity, heir);
    if (regent) {
      data.regent = regent.person.id;
      data.regentRole = regent.role;
      participants.regent = regent.person.id;
      regent.person.flags[PF.regent] = polity.id;
    }
  }

  let importance = 34;
  if (polity.kind === "kingdom") importance += 8;
  if (opts.disputed || opts.usurped) importance += 8;
  if (minor) importance += 4;
  importance = clamp(importance, 30, 50);

  return ctx.record({
    type: "coronation",
    date: world.now,
    participants,
    data,
    location: polity.capital,
    region: regionOfSettlement(world, polity.capital),
    importance,
    causes: opts.causes,
    storyline: null,
    secret: false,
  });
}

/**
 * Steward first, then marshal, then any officer; failing a court, the
 * child's own surviving parent, then the eldest blood adult of the house.
 */
function chooseRegent(
  ctx: Ctx,
  polity: Polity,
  heir: Person,
): { person: Person; role: string } | null {
  const world = ctx.world;
  for (const role of ["steward", "marshal", ...[...polity.court.keys()].sort()]) {
    const id = polity.court.get(role);
    const p = livingPerson(world, id);
    if (p && p.id !== heir.id) return { person: p, role };
  }
  for (const pid of [heir.mother, heir.father, heir.legalFather]) {
    const parent = livingPerson(world, pid);
    if (parent) return { person: parent, role: "parent regent" };
  }
  if (polity.rulingHouse != null) {
    let eldest: Person | null = null;
    for (const id of [...world.alive].sort((a, b) => a - b)) {
      const p = world.people.get(id);
      if (!p || p.house !== polity.rulingHouse || p.id === heir.id) continue;
      if (p.flags[PF.marriedIn] === true) continue; // blood stewards blood
      if (yearsBetween(p.born, world.now) < adulthoodAgeOf(world, p)) continue;
      if (eldest === null || p.born < eldest.born) eldest = p;
    }
    if (eldest) return { person: eldest, role: "kin regent" };
  }
  return null;
}
