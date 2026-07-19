/**
 * Death and its cascade: widowhood, succession hand-off, grief memories,
 * and guardianship for orphaned minors.
 */

import type { Ctx, EventId, Person, PersonId } from "../core/types";
import { yearsBetween } from "../core/time";
import {
  F,
  activeMarriages,
  adulthoodAgeOf,
  ageOf,
  clamp,
  livingPerson,
  whereabouts,
} from "./helpers";

export interface KillOpts {
  killer?: PersonId;
  /** A causal parent event (battle, execution, plot...). */
  event?: EventId;
}

/**
 * Kill a person now. Safe to call from any module via services.people.kill.
 * Records the death event, widows spouses, notifies politics, seeds grief,
 * and places orphaned minors with kin.
 */
export function kill(ctx: Ctx, person: Person, cause: string, opts?: KillOpts): void {
  const world = ctx.world;
  if (person.died !== null) return; // already dead
  const now = world.now;

  person.died = now;
  person.deathCause = cause;
  person.pregnancy = null;
  world.alive.delete(person.id);
  world.stats.totalDied += 1;

  // A betrothal dies with the betrothed.
  if (person.betrothed != null) {
    const b = world.people.get(person.betrothed);
    if (b && b.betrothed === person.id) {
      b.betrothed = null;
      delete b.flags[F.wedAfter];
      delete b.flags[F.betrothalEvent];
    }
    person.betrothed = null;
  }

  // Widow every active marriage, both sides.
  const widowed: PersonId[] = [];
  for (const m of activeMarriages(person)) {
    m.active = false;
    m.endDate = now;
    m.endReason = "death";
    widowed.push(m.spouse);
    const spouse = world.people.get(m.spouse);
    if (spouse) {
      for (const sm of spouse.marriages) {
        if (sm.spouse === person.id && sm.active) {
          sm.active = false;
          sm.endDate = now;
          sm.endReason = "death";
        }
      }
      if (spouse.died === null) {
        // A mourning season before the marriage market calls again.
        const mourn = ctx.rng.fork("mourning", spouse.id).intIn(14, 30);
        spouse.flags[F.mourningUntil] = now + mourn;
      }
    }
  }

  // The death event itself.
  const ageYears = yearsBetween(person.born, now);
  const adulthood = adulthoodAgeOf(world, person);
  let importance = 8;
  if (ageYears < adulthood) importance += 2; // untimely
  const rank = person.status.rank;
  importance += [0, 0, 2, 8, 18, 32][clamp(rank, 0, 5)];
  importance += Math.min(10, Math.floor(person.notability / 60));
  if (person.status.titles.length > 0) importance += 4;
  importance = clamp(importance, 8, 60);

  const participants: Record<string, PersonId> = { subject: person.id };
  if (opts?.killer != null) participants.killer = opts.killer;

  const causes: EventId[] = [];
  if (opts?.event != null) causes.push(opts.event);

  const ev = ctx.record({
    type: "death",
    date: now,
    participants,
    data: { cause, ageYears },
    ...whereabouts(world, person),
    importance,
    causes,
    storyline: null,
    secret: false,
  });

  // Succession, inheritance, court vacancies.
  ctx.services.politics.onDeath(ctx, person);

  // Grief: spouses, children, parents remember.
  const grievers = new Map<PersonId, number>(); // id -> memory weight
  for (const sid of widowed) grievers.set(sid, 3);
  for (const cid of person.children) {
    if (!grievers.has(cid)) grievers.set(cid, 2.5);
  }
  for (const pid of [person.mother, person.father, person.legalFather]) {
    if (pid != null && !grievers.has(pid)) grievers.set(pid, 3);
  }
  const griefIds = [...grievers.keys()].sort((a, b) => a - b);
  for (const gid of griefIds) {
    const g = livingPerson(world, gid);
    if (!g) continue;
    ctx.services.social.addMemory(world, gid, {
      event: ev.id,
      weight: grievers.get(gid)!,
      about: person.id,
      feeling: -0.85,
    });
    if (opts?.killer != null && opts.killer !== gid) {
      // Hatred for a known killer (secret murders stay unhated, for now).
      const killEvent = opts.event != null ? world.events.get(opts.event) : null;
      const isSecret = killEvent ? killEvent.secret : false;
      if (!isSecret) ctx.services.social.adjustOpinion(world, gid, opts.killer, -55);
    }
  }

  // Orphans: minors with no living present parent go to the nearest adult kin.
  placeOrphans(ctx, person, ev.id);
}

function placeOrphans(ctx: Ctx, deceased: Person, deathEvent: EventId): void {
  const world = ctx.world;
  const kids = [...deceased.children].sort((a, b) => a - b);
  for (const cid of kids) {
    const child = livingPerson(world, cid);
    if (!child) continue;
    if (ageOf(world, child) >= adulthoodAgeOf(world, child)) continue;
    const mother = livingPerson(world, child.mother);
    const father = livingPerson(world, child.father);
    const legal = livingPerson(world, child.legalFather);
    const present = [mother, father, legal].some((p) => p !== null && p.location != null);
    if (present) continue;
    const guardian = nearestAdultKin(ctx, child);
    if (!guardian) continue; // the village raises them as best it can
    child.flags[F.guardian] = guardian.id;
    if (guardian.location != null && guardian.location !== child.location) {
      const from = child.location;
      child.location = guardian.location;
      ctx.record({
        type: "moved",
        date: world.now,
        participants: { subject: child.id, guardian: guardian.id },
        data: { from, to: guardian.location, reason: "taken in by kin" },
        location: guardian.location,
        region: world.settlements.get(guardian.location)?.region ?? null,
        importance: 3,
        causes: [deathEvent],
        storyline: null,
        secret: false,
      });
    }
  }
}

/**
 * Nearest adult kin, searched in tiers: adult siblings, grandparents,
 * aunts and uncles, then the head of the child's house. Lowest id wins
 * within a tier (deterministic).
 */
export function nearestAdultKin(ctx: Ctx, child: Person): Person | null {
  const world = ctx.world;
  const isAdult = (p: Person) => ageOf(world, p) >= adulthoodAgeOf(world, p);
  const parents = [child.mother, child.father, child.legalFather];

  const tier = (ids: (PersonId | null)[]): Person | null => {
    const uniq = [...new Set(ids.filter((i): i is PersonId => i != null && i !== child.id))].sort(
      (a, b) => a - b,
    );
    for (const id of uniq) {
      const p = livingPerson(world, id);
      if (p && p.location != null && isAdult(p)) return p;
    }
    return null;
  };

  // Tier 1: adult siblings (through any parent).
  const sibs: PersonId[] = [];
  for (const pid of parents) {
    if (pid == null) continue;
    const parent = world.people.get(pid);
    if (parent) sibs.push(...parent.children);
  }
  const t1 = tier(sibs);
  if (t1) return t1;

  // Tier 2: grandparents.
  const grands: (PersonId | null)[] = [];
  for (const pid of parents) {
    if (pid == null) continue;
    const parent = world.people.get(pid);
    if (parent) grands.push(parent.mother, parent.father);
  }
  const t2 = tier(grands);
  if (t2) return t2;

  // Tier 3: aunts and uncles (children of grandparents who are not parents).
  const uncles: PersonId[] = [];
  for (const gid of grands) {
    if (gid == null) continue;
    const g = world.people.get(gid);
    if (!g) continue;
    for (const uid of g.children) {
      if (!parents.includes(uid)) uncles.push(uid);
    }
  }
  const t3 = tier(uncles);
  if (t3) return t3;

  // Tier 4: the head of the child's house.
  if (child.house != null) {
    const head = world.houses.get(child.house)?.head ?? null;
    const t4 = tier([head]);
    if (t4) return t4;
  }
  return null;
}
