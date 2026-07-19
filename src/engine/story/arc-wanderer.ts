/**
 * WANDERER — a restless soul takes the road: pilgrimage, grief, or plain
 * hunger for elsewhere. Stages: away (word drifts back) -> homecoming.
 * Endings: return transformed (new epithet), never returns (an emigrated
 * closure), or a return to a home that changed while they were gone.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, Storyline } from "../core/types";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  SF,
  activeSpouseId,
  ageOf,
  beginStoryline,
  bestowEpithet,
  castable,
  closeKinIds,
  isAdult,
  isMarried,
  livingPerson,
  settlementName,
} from "./helpers";

const REASONS = [
  { key: "pilgrimage", text: "took the pilgrim road to the far shrine, staff in hand" },
  { key: "grief", text: "walked out of a house grown too quiet to bear" },
  { key: "hunger", text: "went to see what the rest of the world thought it was doing" },
];

const WORDS_FROM_AFAR = [
  "a returning sailor swears they crewed the same coast-boat for a season",
  "a pilgrim brings a wax token pressed with a far shrine's seal, sent home with love",
  "a drover says they wintered in a mountain village and taught the children letters",
  "word comes of a stranger matching them, paid off from a caravan and walking on",
];

export const wandererArc: ArcDef = {
  kind: "wanderer",
  essential: [],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star) || star.location == null) return 0;
    const age = ageOf(world, star);
    if (age > 45) return 0;
    if (isMarried(star) || star.betrothed !== null) return 0;
    let w = 0.25 + Math.max(0, star.personality.openness) * 0.6;
    if (star.personality.piety >= 0.6) w += 0.3; // pilgrim's heart
    // Fresh grief pushes feet toward the horizon.
    const memories = world.memories.get(star.id) ?? [];
    if (memories.some((m) => m.feeling <= -0.6 && m.weight >= 2)) w += 0.5;
    return w;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, _aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "wanderer")) return null;
    const home = star.location;
    if (home == null) return null;
    const reason = rng.fork("reason").pick(REASONS);
    const s = beginStoryline(ctx, {
      kind: "wanderer",
      cast: { wanderer: star.id },
      data: {
        star: star.id,
        starRank: star.status.rank,
        home,
        reason: reason.key,
        words: 0,
      },
      stage: "away",
      firstBeatIn: rng.fork("first").intIn(6, 14),
    });
    ctx.record({
      type: "pilgrimage-departed",
      date: world.now,
      participants: { subject: star.id },
      // reason: why the road; from: the door they closed behind them.
      data: { reason: reason.text, from: home },
      location: home,
      region: world.settlements.get(home)?.region ?? null,
      importance: 8,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    star.flags[SF.away] = true;
    star.location = null;
    return s;
  },

  stages: {
    /** Years on the road; scraps of news drift home. */
    away(a: Arc): void {
      const world = a.world;
      const home = a.s.data["home"] as number;
      const words = a.s.data["words"] as number;
      const wanderer = world.people.get(a.s.cast["wanderer"]);
      // Died out there: the road keeps its own. Close quietly.
      if (!wanderer || wanderer.died !== null || !world.alive.has(wanderer.id)) {
        a.beat({
          type: "rumor",
          participants: {},
          data: { of: a.s.cast["wanderer"], word: "the last word of them was a grave-marker in a strange alphabet" },
          at: home,
          importance: 6,
        });
        a.end("ended on a far road, under a strange stone");
        return;
      }
      if (words >= 1 && a.rng.fork("home").chance(0.35 + words * 0.2)) {
        a.go("homecoming", 2, 8);
        return;
      }
      a.beat({
        type: "rumor",
        participants: {},
        // of: the far walker; word: what the roads carried home.
        data: { of: wanderer.id, word: a.rng.fork("word").pick(WORDS_FROM_AFAR) },
        at: home,
        importance: 3,
      });
      a.s.data["words"] = words + 1;
      a.go("away", 8, 18);
    },

    /** The road ends, one way or another. */
    homecoming(a: Arc): void {
      const world = a.world;
      const home = a.s.data["home"] as number;
      const wanderer = world.people.get(a.s.cast["wanderer"]);
      if (!wanderer || wanderer.died !== null || !world.alive.has(wanderer.id)) {
        a.end("ended somewhere past the last milestone");
        return;
      }
      const awayYears = Math.max(1, Math.round((world.now - a.s.started) / 12));
      const pick = a.rng.fork("outcome").weightedPairs([
        ["transformed", 1.6],
        ["never", 0.9 + Math.max(0, wanderer.personality.openness) * 0.5],
        ["changed-home", 1.1],
      ] as const);

      if (pick === "never") {
        delete wanderer.flags[SF.away];
        wanderer.flags[SF.emigrated] = true;
        world.alive.delete(wanderer.id);
        a.beat({
          type: "emigrated",
          participants: { subject: wanderer.id },
          // reason: the road won; from: the home that lost.
          data: { from: home, reason: "sent back a blessing and no promise, and the road kept them" },
          at: home,
          importance: 7,
        });
        a.end("never came home; somewhere, presumably, they grew old");
        return;
      }

      // A return, one way or the other.
      delete wanderer.flags[SF.away];
      wanderer.location = home;
      const back = a.beat({
        type: "pilgrimage-returned",
        participants: { subject: wanderer.id },
        // awayYears + manner of the return.
        data: {
          awayYears,
          manner:
            pick === "transformed"
              ? "came up the lane at dusk with road-dust to the knee and a stranger's steadiness"
              : "came home whistling, and stopped at the gate",
        },
        at: home,
        importance: 20,
      });

      if (pick === "transformed") {
        bestowEpithet(a.ctx, a.rng, a.s, wanderer, "wanderer", `walked ${awayYears} years of road and came back`, back.id);
        if (a.rng.fork("gift").chance(0.5)) wanderer.status.wealth = Math.min(5, wanderer.status.wealth + 1);
        a.echo("song", 2, 8, "the road that gave one of ours back");
        a.end(`returned to ${settlementName(world, home)} transformed`);
        return;
      }

      // The home changed shape while they walked.
      const lost = closeKinIds(world, wanderer)
        .map((id) => world.people.get(id))
        .find((p) => p && p.died !== null && p.died >= a.s.started);
      const spouse = livingPerson(world, activeSpouseId(wanderer));
      a.beat({
        type: "grief-kept",
        participants: lost ? { subject: wanderer.id, for: lost.id } : { subject: wanderer.id },
        // What was found missing at the gate.
        data: {
          manner: lost
            ? "asked at the gate for a face that had been under the ground a year"
            : "found the old house full of strangers and the neighbors grown grey",
        },
        importance: 10,
        causes: [back.id],
      });
      if (lost) {
        a.ctx.services.social.addMemory(world, wanderer.id, { event: a.last()!, weight: 3, about: lost.id, feeling: -0.9 });
      }
      void spouse;
      a.end("came home to a home that had not waited");
    },
  },
};
