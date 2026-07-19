/**
 * SUCCESSION-STRUGGLE — spawned from the world, not from a sampled star:
 * when a polity's seat stands empty (politics has opened a crisis), rival
 * claimants court support in the open. Stages: courting -> contention.
 * Endings: a negotiated settlement, an assassination, a pact of partition
 * in all but law, or a coup-ready handoff. If politics crowns someone
 * mid-arc, the struggle closes gracefully around the fact.
 */

import type { Rng } from "../core/rng";
import type { Ctx, EventId, Person, Polity, Storyline } from "../core/types";
import { eventsBetween, sortedIds } from "../core/world";
import type { Arc, ArcDef } from "./arcdef";
import {
  SF,
  beginStoryline,
  castable,
  isAdult,
  livingPerson,
} from "./helpers";

const COURTING = [
  "rode the valley farms promising lower scutage and remembering every first name",
  "feasted the guildmasters until the candles were stubs and the promises large",
  "stood godparent to three children in one month, all of them well connected",
  "let it be known that the granaries would open the day the right head wore the crown",
];

/** The open succession-crisis event for a polity, if recent. */
function crisisEventFor(world: Ctx["world"], polity: Polity): EventId | null {
  for (const ev of eventsBetween(world, Math.max(0, world.now - 36), world.now)) {
    if (ev.type === "succession-crisis" && ev.data["polity"] === polity.id) return ev.id;
  }
  return null;
}

/** Living adult claimants to a polity's empty seat, ascending id. */
function claimantsFor(ctx: Ctx, polity: Polity): Person[] {
  const world = ctx.world;
  const out: Person[] = [];
  for (const id of [...world.alive].sort((a, b) => a - b)) {
    const p = world.people.get(id);
    if (!p || p.flags[SF.claimant] !== polity.id) continue;
    if (!isAdult(world, p)) continue;
    out.push(p);
  }
  if (out.length >= 2) return out;
  // Thin field: the line of succession supplies the missing rivals.
  for (const id of ctx.services.politics.successionLine(world, polity, 5)) {
    const p = livingPerson(world, id);
    if (p && isAdult(world, p) && !out.some((q) => q.id === p.id)) out.push(p);
    if (out.length >= 2) break;
  }
  return out;
}

/** True when this polity already has an unresolved struggle storyline. */
function alreadyStruggling(world: Ctx["world"], polity: Polity): boolean {
  for (const sid of sortedIds(world.storylines)) {
    const s = world.storylines.get(sid)!;
    if (!s.resolved && s.kind === "succession-struggle" && s.data["polity"] === polity.id) return true;
  }
  return false;
}

export const successionArc: ArcDef = {
  kind: "succession-struggle",
  essential: [],

  weight(): number {
    return 0; // never star-sampled; spawns from the world below
  },

  spawn(): Storyline | null {
    return null;
  },

  worldSpawn(ctx: Ctx, rng: Rng, budget: number): number {
    const world = ctx.world;
    let spawned = 0;
    for (const pid of sortedIds(world.polities)) {
      if (spawned >= budget) break;
      const polity = world.polities.get(pid)!;
      if (polity.ruler !== null) continue;
      if (alreadyStruggling(world, polity)) continue;
      const rivals = claimantsFor(ctx, polity);
      if (rivals.length < 2) continue;
      const [A, B] = rivals;
      if (!castable(world, A, "succession-struggle") || !castable(world, B, "succession-struggle")) continue;
      const crisis = crisisEventFor(world, polity);
      const s = beginStoryline(ctx, {
        kind: "succession-struggle",
        cast: { "claimant-a": A.id, "claimant-b": B.id },
        data: {
          star: A.id,
          starRank: A.status.rank,
          home: polity.capital,
          polity: polity.id,
          courted: 0,
        },
        stage: "courting",
        firstBeatIn: rng.fork("first", polity.id).intIn(1, 3),
      });
      ctx.record({
        type: "claim-pressed",
        date: world.now,
        participants: { "claimant-a": A.id, "claimant-b": B.id },
        // polity: the empty seat; rivals face each other in the open.
        data: { polity: polity.id, manner: "two claims were read aloud in the same hall on the same day" },
        location: polity.capital,
        region: world.settlements.get(polity.capital)?.region ?? null,
        importance: 22,
        causes: crisis != null ? [crisis] : [],
        storyline: s.id,
        secret: false,
      });
      spawned++;
    }
    return spawned;
  },

  stages: {
    /** Hands are shaken, granaries promised, godparents stood. */
    courting(a: Arc): void {
      const world = a.world;
      const polity = world.polities.get(a.s.data["polity"] as number);
      if (!polity) return;
      if (closeIfCrowned(a, polity)) return;
      const A = a.living("claimant-a");
      const B = a.living("claimant-b");
      if (!A || !B) {
        closeOnDefault(a, polity, A ?? B);
        return;
      }
      const courted = a.s.data["courted"] as number;
      if (courted >= 2) {
        a.go("contention", 1, 4);
        return;
      }
      const who = a.rng.fork("who", courted).chance(0.5) ? A : B;
      a.beat({
        type: "support-courted",
        participants: { claimant: who.id },
        // polity + how support was wooed.
        data: { polity: polity.id, how: a.rng.fork("how", courted).pick(COURTING) },
        at: polity.capital,
        importance: 8,
      });
      a.s.data["courted"] = courted + 1;
      a.go("courting", 2, 5);
    },

    /** The claims collide. */
    contention(a: Arc): void {
      const world = a.world;
      const polity = world.polities.get(a.s.data["polity"] as number);
      if (!polity) return;
      if (closeIfCrowned(a, polity)) return;
      const A = a.living("claimant-a");
      const B = a.living("claimant-b");
      if (!A || !B) {
        closeOnDefault(a, polity, A ?? B);
        return;
      }
      const pick = a.rng.fork("outcome").weightedPairs([
        ["settlement", 1.6 + Math.max(0, A.personality.honor + B.personality.honor)],
        ["assassination", 0.7 + Math.max(0, -A.personality.honor, -B.personality.honor) * 1.5],
        ["partition", 0.8],
        ["coup-ready", 0.9 + Math.max(A.personality.ambition, B.personality.ambition)],
      ] as const);

      if (pick === "settlement") {
        // The lesser claim is bought off; the greater keeps its flag and
        // waits for politics to hand down the crown.
        const yielding = a.rng.fork("yield").chance(0.5) ? A : B;
        const standing = yielding.id === A.id ? B : A;
        a.beat({
          type: "alliance-formed",
          participants: { yielded: yielding.id, standing: standing.id },
          // terms: what the withdrawal cost.
          data: { polity: polity.id, terms: "a border holding, a ward exchanged, and one claim folded into the other" },
          at: polity.capital,
          importance: 16,
        });
        delete yielding.flags[SF.claimant];
        a.ctx.services.social.adjustOpinion(world, yielding.id, standing.id, 15);
        a.end("was settled over parchment, one claim folded into the other");
        return;
      }

      if (pick === "assassination") {
        const killer = a.rng.fork("killer").chance(0.5 + (A.personality.honor < B.personality.honor ? 0.2 : -0.2)) ? A : B;
        const victim = killer.id === A.id ? B : A;
        const deed = a.beat({
          type: "assassination",
          participants: { killer: killer.id, target: victim.id },
          // method: rivals thin the field the old way.
          data: {
            polity: polity.id,
            method: a.rng.fork("method").pick([
              "wine that had been let breathe with something in it",
              "a hunting party from which one horse came back",
            ]),
          },
          at: polity.capital,
          importance: 45,
          secret: true,
        });
        a.ctx.services.people.kill(a.ctx, victim, "died conveniently, mid-succession", {
          killer: killer.id,
          event: deed.id,
        });
        a.end("was thinned by a quiet murder; one claim remained");
        return;
      }

      if (pick === "partition") {
        a.beat({
          type: "peace-made",
          participants: { "claimant-a": A.id, "claimant-b": B.id },
          // terms: a realm ruled in halves, in all but law.
          data: { polity: polity.id, terms: "one took the coast and one the hills, and the crown sat between them gathering dust" },
          at: polity.capital,
          importance: 20,
        });
        a.end("ended in a partition of everything but the title itself");
        return;
      }

      // Coup-ready: the bolder claimant stops waiting for law.
      const bold = A.personality.ambition >= B.personality.ambition ? A : B;
      bold.flags[SF.coupReadyPrefix + polity.id] = true;
      a.beat({
        type: "plot-ripened",
        participants: { plotter: bold.id },
        // polity: the seat to be taken by hand, not by right.
        data: { polity: polity.id, word: "stopped courting the law and started counting spears" },
        importance: 12,
        secret: true,
      });
      a.end("outgrew the law; one claimant began counting spears");
    },
  },
};

/** If politics crowned someone, the struggle closes around the fact. */
function closeIfCrowned(a: Arc, polity: Polity): boolean {
  if (polity.ruler === null) return false;
  const world = a.world;
  const winner = world.people.get(polity.ruler);
  const aId = a.s.cast["claimant-a"];
  const bId = a.s.cast["claimant-b"];
  const wasRival = polity.ruler === aId || polity.ruler === bId;
  a.beat({
    type: "rumor",
    participants: winner ? { of: winner.id } : {},
    data: {
      of: polity.ruler,
      word: wasRival
        ? "the matter was settled the moment the crown found that head"
        : "a third head took the crown while two argued over it",
    },
    at: polity.capital,
    importance: 6,
  });
  a.end(wasRival ? "ended when one claim became a coronation" : "ended when the crown went to a third head entirely");
  return true;
}

/** One rival dead or gone: the struggle collapses to a default. */
function closeOnDefault(a: Arc, polity: Polity, remaining: Person | null): void {
  a.beat({
    type: "rumor",
    participants: remaining ? { of: remaining.id } : {},
    data: {
      of: remaining?.id ?? null,
      word: remaining ? "one claim was left standing when the other stopped breathing" : "both claims went into the ground unresolved",
    },
    at: polity.capital,
    importance: 6,
  });
  a.end(remaining ? "collapsed to a single claim by attrition" : "died with its claimants");
}
