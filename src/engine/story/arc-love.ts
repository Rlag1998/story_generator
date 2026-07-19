/**
 * FORBIDDEN-LOVE — two lovers across a feud, a faith, a gulf of rank, or a
 * promised betrothal. Stages: kindling -> trysts (secret meetings, rising
 * discovery risk) -> reckoning. Endings: elopement, forced parting (pining),
 * tragedy (a duel or an honor killing), or triumph (a love-match wedding
 * that can soften a feud).
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, Storyline } from "../core/types";
import { revealEvent } from "../core/world";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  SF,
  ageOf,
  beginStoryline,
  bestowEpithet,
  castable,
  closeKinIds,
  farSettlement,
  isAdult,
  isMarried,
  livingPerson,
  residentsWhere,
  settlementName,
  whereabouts,
} from "./helpers";

type Barrier = "feud" | "faith" | "rank" | "betrothal";

const MEETING_PLACES = [
  "under the old bridge when the mill went quiet",
  "in the hazel scrub past the boundary stone",
  "by the drying racks, in the hour between watches",
  "in the bell tower while the town slept",
  "on the strand below the tide line, where footprints do not keep",
];

function houseFeudBetween(ctx: Ctx, a: Person, b: Person): boolean {
  if (a.house == null || b.house == null || a.house === b.house) return false;
  const ha = ctx.world.houses.get(a.house);
  return ((ha?.feuds.get(b.house) ?? 0) >= 0.08);
}

function barrierBetween(ctx: Ctx, a: Person, b: Person): Barrier | null {
  if (houseFeudBetween(ctx, a, b)) return "feud";
  if (b.betrothed != null && b.betrothed !== a.id) return "betrothal";
  if (a.betrothed != null && a.betrothed !== b.id) return "betrothal";
  if (a.religion !== b.religion) return "faith";
  if (Math.abs(a.status.rank - b.status.rank) >= 2) return "rank";
  return null;
}

/** The angriest kinsman of the higher-placed lover: father, brother, head. */
function guardianOfHonor(ctx: Ctx, lover: Person): Person | null {
  const world = ctx.world;
  const candidates = closeKinIds(world, lover)
    .map((id) => livingPerson(world, id))
    .filter((p): p is Person => p !== null && p.sex === "m" && isAdult(world, p) && p.id !== lover.id);
  if (candidates.length === 0) return null;
  candidates.sort(
    (x, y) => y.personality.wrath + y.personality.honor - (x.personality.wrath + x.personality.honor) || x.id - y.id,
  );
  return candidates[0];
}

export const loveArc: ArcDef = {
  kind: "forbidden-love",
  essential: ["lover-a", "lover-b"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star)) return 0;
    const age = ageOf(world, star);
    if (age > 36 || isMarried(star)) return 0;
    return 1.0 + star.personality.lust * 0.6 + Math.max(0, star.personality.openness) * 0.3;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "forbidden-love")) return null;
    // A beloved in the same settlement, on the far side of some wall.
    const candidates = residentsWhere(world, aids.index, star.location, (p) => {
      if (p.id === star.id || p.sex === star.sex) return false;
      if (!isAdult(world, p) || ageOf(world, p) > 36 || isMarried(p)) return false;
      if (!castable(world, p, "forbidden-love")) return false;
      return barrierBetween(ctx, star, p) !== null;
    });
    if (candidates.length === 0) return null;
    const beloved = rng.fork("beloved").pick(candidates);
    const barrier = barrierBetween(ctx, star, beloved)!;
    const s = beginStoryline(ctx, {
      kind: "forbidden-love",
      cast: { "lover-a": star.id, "lover-b": beloved.id },
      houses: [star.house, beloved.house].filter((h): h is number => h != null),
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        barrier,
        meetings: 0,
        risk: 0.12,
      },
      stage: "trysts",
      firstBeatIn: rng.fork("first").intIn(2, 4),
    });
    const ev = ctx.record({
      type: "romance-began",
      date: world.now,
      participants: { a: star.id, b: beloved.id },
      // barrier: what stands between them.
      data: { barrier, hidden: true },
      ...whereabouts(world, star),
      importance: 9,
      causes: [],
      storyline: s.id,
      secret: true,
    });
    s.data["romanceEvent"] = ev.id;
    ctx.services.social.setRelation(world, star.id, beloved.id, { kind: "lover", since: world.now, opinion: 65 });
    ctx.services.social.setRelation(world, beloved.id, star.id, { kind: "lover", since: world.now, opinion: 65 });
    return s;
  },

  stages: {
    /** Stolen hours; each meeting raises the chance of watching eyes. */
    trysts(a: Arc): void {
      const A = a.living("lover-a");
      const B = a.living("lover-b");
      if (!A || !B) return;
      const meetings = a.s.data["meetings"] as number;
      const risk = a.s.data["risk"] as number;
      const roll = a.rng.fork("outcome");
      if (roll.fork("caught").chance(risk)) {
        a.go("exposed", 1, 1);
        return;
      }
      if (meetings >= 2 && roll.fork("resolve").chance(0.4 + meetings * 0.15)) {
        a.go("reckoning", 1, 3);
        return;
      }
      a.beat({
        type: "secret-meeting",
        participants: { a: A.id, b: B.id },
        // where: the hidden place; barrier: what they defy to meet.
        data: { where: roll.fork("where").pick(MEETING_PLACES), barrier: a.s.data["barrier"] },
        importance: 5,
        secret: true,
      });
      a.s.data["meetings"] = meetings + 1;
      a.s.data["risk"] = Math.min(0.55, risk + 0.1);
      a.go("trysts", 2, 5);
    },

    /** Watching eyes at last: the secret is dragged into daylight. */
    exposed(a: Arc): void {
      const A = a.living("lover-a");
      const B = a.living("lover-b");
      if (!A || !B) return;
      const world = a.world;
      const romanceEv = a.s.data["romanceEvent"] as number | undefined;
      if (romanceEv != null) revealEvent(world, romanceEv, world.now);
      for (const eid of a.s.events) {
        const ev = world.events.get(eid);
        if (ev && ev.type === "secret-meeting") revealEvent(world, eid, world.now);
      }
      a.beat({
        type: "affair-discovered",
        participants: { a: A.id, b: B.id },
        // union: what was discovered; barrier: why it scandalizes.
        data: { union: "a hidden courtship", barrier: a.s.data["barrier"] },
        importance: 16,
        causes: romanceEv != null ? [romanceEv] : undefined,
      });
      // Kin on both sides take it hard.
      for (const [lover, other] of [
        [A, B],
        [B, A],
      ] as const) {
        const kin = guardianOfHonor(a.ctx, lover);
        if (kin) a.ctx.services.social.adjustOpinion(world, kin.id, other.id, -30);
      }
      a.go("reckoning", 1, 2);
    },

    /** The lovers, and the world, decide. */
    reckoning(a: Arc): void {
      const A = a.living("lover-a");
      const B = a.living("lover-b");
      if (!A || !B) return;
      const world = a.world;
      const barrier = a.s.data["barrier"] as Barrier;
      const exposedAlready = a.s.events.some((eid) => world.events.get(eid)?.type === "affair-discovered");
      const boldness = A.personality.courage + B.personality.courage;
      const pick = a.rng.fork("outcome").weightedPairs([
        ["elope", 1.4 + Math.max(0, boldness)],
        ["parting", 1.6 + (exposedAlready ? 0.8 : 0)],
        ["tragedy", barrier === "feud" || barrier === "betrothal" ? 1.5 : 0.6],
        ["triumph", 1.2 + Math.max(0, A.personality.honor + B.personality.honor) * 0.5],
      ] as const);

      if (pick === "elope") {
        const dest = farSettlement(world, a.rng.fork("dest"), A.location);
        const from = A.location;
        if (dest != null) {
          A.location = dest;
          B.location = dest;
          a.beat({
            type: "moved",
            participants: { a: A.id, b: B.id },
            // reason: fled together; from/to for the map.
            data: { from, to: dest, reason: "fled together in the night" },
            at: dest,
            importance: 16,
          });
          // A quiet wedding among strangers.
          A.marriages.push({ spouse: B.id, date: world.now, active: true });
          B.marriages.push({ spouse: A.id, date: world.now, active: true });
          A.flags[SF.loveMatch] = true;
          B.flags[SF.loveMatch] = true;
          a.beat({
            type: "wedding",
            participants: A.sex === "f" ? { bride: A.id, groom: B.id } : { bride: B.id, groom: A.id },
            data: { manner: "wed by a strange priest in a strange town, with no kin to object", loveMatch: true },
            at: dest,
            importance: 12,
          });
          a.echo("song", 2, 8, "two lovers who fled a wall the world had built");
          a.end(`fled together to ${settlementName(world, dest)}`);
        } else {
          // Nowhere to run: over the map's edge, gone from the tale.
          for (const p of [A, B]) {
            p.flags[SF.emigrated] = true;
            p.location = null;
            world.alive.delete(p.id);
          }
          a.beat({
            type: "emigrated",
            participants: { a: A.id, b: B.id },
            data: { from, reason: "fled together beyond the map's edge" },
            at: from,
            importance: 12,
          });
          a.end("fled together beyond any road the chronicle knows");
        }
        return;
      }

      if (pick === "parting") {
        a.beat({
          type: "lovers-parted",
          participants: { a: A.id, b: B.id },
          // by: who or what forced the parting.
          data: {
            by: barrier === "betrothal" ? "a promise already sworn" : "the weight of both families",
            barrier,
          },
          importance: 14,
        });
        A.flags[SF.pining] = B.id;
        B.flags[SF.pining] = A.id;
        a.ctx.services.social.addMemory(world, A.id, { event: a.last()!, weight: 2.5, about: B.id, feeling: 0.7 });
        a.ctx.services.social.addMemory(world, B.id, { event: a.last()!, weight: 2.5, about: A.id, feeling: 0.7 });
        a.end("were parted, and neither quite unlearned the other");
        return;
      }

      if (pick === "tragedy") {
        // The offended side sends its champion: a duel or an honor killing.
        const jilted = barrier === "betrothal" ? livingPerson(world, B.betrothed ?? A.betrothed) : null;
        const avenger = jilted ?? guardianOfHonor(a.ctx, B) ?? guardianOfHonor(a.ctx, A);
        // The blade falls on the outsider: the rival of a jilted betrothed,
        // or the lover who is NOT kin to the offended family.
        let victimLover: Person;
        if (jilted && avenger === jilted) {
          victimLover = B.betrothed === jilted.id ? A : B;
        } else {
          victimLover = avenger && closeKinIds(world, B).includes(avenger.id) ? A : B;
        }
        if (avenger && avenger.id !== victimLover.id) {
          const openDuel = a.rng.fork("manner").chance(0.55);
          if (openDuel) {
            const ev = a.beat({
              type: "duel",
              participants: { challenger: avenger.id, challenged: victimLover.id, victor: avenger.id, slain: victimLover.id },
              data: { over: "a courtship the family would not bear", outcome: "death" },
              importance: 36,
            });
            a.ctx.services.people.kill(a.ctx, victimLover, "slain in a duel over a forbidden love", {
              killer: avenger.id,
              event: ev.id,
            });
          } else {
            const ev = a.beat({
              type: "crime-murder",
              participants: { killer: avenger.id, victim: victimLover.id },
              // method: the honor killing, done quietly.
              data: { method: "waylaid on a dark lane, and honor called it clean", honor: true },
              importance: 40,
              secret: true,
            });
            a.ctx.services.people.kill(a.ctx, victimLover, "found dead on a dark lane", {
              killer: avenger.id,
              event: ev.id,
            });
          }
          const survivor = victimLover.id === A.id ? B : A;
          a.ctx.services.social.addMemory(world, survivor.id, {
            event: a.last()!,
            weight: 4,
            about: victimLover.id,
            feeling: -1,
          });
          a.ctx.services.social.adjustOpinion(world, survivor.id, avenger.id, -70);
          bestowEpithet(a.ctx, a.rng, a.s, survivor, "sorrowful", "loved once, and buried it", a.last());
          a.echo("song", 3, 10, "a love that ended on a dark lane");
          a.end("ended in blood, and one heart kept walking");
          return;
        }
        // No avenger could be found: fate settles for a parting.
        a.beat({
          type: "lovers-parted",
          participants: { a: A.id, b: B.id },
          data: { by: "fear of what the families would do", barrier },
          importance: 12,
        });
        A.flags[SF.pining] = B.id;
        a.end("were parted by fear before worse could come");
        return;
      }

      // Triumph: the families are faced down, and a wedding softens old hate.
      A.marriages.push({ spouse: B.id, date: world.now, active: true });
      B.marriages.push({ spouse: A.id, date: world.now, active: true });
      A.flags[SF.loveMatch] = true;
      B.flags[SF.loveMatch] = true;
      if (A.betrothed != null) A.betrothed = null;
      if (B.betrothed != null) B.betrothed = null;
      const wedding = a.beat({
        type: "wedding",
        participants: A.sex === "f" ? { bride: A.id, groom: B.id } : { bride: B.id, groom: A.id },
        data: { manner: "a wedding no one thought to see, with both families stiff in their finery", loveMatch: true },
        importance: 18,
      });
      if (barrier === "feud" && A.house != null && B.house != null) {
        const ha = world.houses.get(A.house);
        const hb = world.houses.get(B.house);
        if (ha && hb) {
          const cooled = Math.max(0, Math.max(ha.feuds.get(hb.id) ?? 0, hb.feuds.get(ha.id) ?? 0) - 0.4);
          ha.feuds.set(hb.id, cooled);
          hb.feuds.set(ha.id, cooled);
          a.beat({
            type: "reconciliation",
            participants: { a: A.id, b: B.id },
            data: { manner: "the wedding cup passed between two houses that had not shared one in years", houses: [ha.id, hb.id] },
            importance: 14,
            causes: [wedding.id],
          });
        }
      }
      a.echo("song", 2, 7, "the wedding that crossed a forbidden line");
      a.end("won through to a love-match wedding");
    },
  },

  onCastDeath(a: Arc, _role: string, person: Person): boolean {
    const survivorRole = a.s.cast["lover-a"] === person.id ? "lover-b" : "lover-a";
    const survivor = a.living(survivorRole);
    if (!survivor) return false;
    const deathEv = a.world.eventsByMonth.get(person.died ?? a.world.now);
    void deathEv;
    a.beat({
      type: "lovers-parted",
      participants: { survivor: survivor.id, lost: person.id },
      data: { by: "death, which asks no family's leave" },
      importance: 10,
    });
    survivor.flags[SF.pining] = person.id;
    a.ctx.services.social.addMemory(a.world, survivor.id, {
      event: a.last()!,
      weight: 3,
      about: person.id,
      feeling: -0.8,
    });
    a.end("was cut short by death");
    return true;
  },
};
