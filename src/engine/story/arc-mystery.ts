/**
 * MYSTERY-DISAPPEARANCE — someone walks out of the world. The truth is
 * decided (and, if it is murder, secretly authored) at the vanishing;
 * the world only gets searches and rumors. Stages: gone -> search -> cold.
 * Endings: found dead (the hidden crime revealed, cause-chained), a return
 * changed years later ("the Returned"), or never found: a haunting closing
 * beat, the vanished left to time.
 */

import type { Rng } from "../core/rng";
import type { Ctx, EventId, Person, Storyline } from "../core/types";
import { revealEvent, sortedIds } from "../core/world";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  SF,
  beginStoryline,
  bestowEpithet,
  castable,
  closeKinIds,
  isAdult,
  livingPerson,
  settlementName,
} from "./helpers";

type Truth = "murdered" | "wandered" | "lost";

const LAST_SEEN = [
  "walking out to check the eel traps in the evening",
  "on the high path after the market, alone",
  "leaving the tavern sober and in good spirits",
  "going to the shrine before first light, as always",
];

const RUMORS = [
  "a charcoal burner swears he heard singing in the wood that night",
  "a peddler sold a cloak-pin very like theirs, two valleys over",
  "someone matching them was seen at a ferry, paying with foreign coin",
  "the dogs will not go past the old quarry, and folk have noticed",
];

/** Someone with cold reason to want the vanished gone, if any. */
function findEnemy(ctx: Ctx, target: Person): Person | null {
  const world = ctx.world;
  const rels = world.relationships;
  for (const otherId of sortedIds(world.people)) {
    const rel = rels.get(otherId)?.get(target.id);
    if (!rel) continue;
    if ((rel.kind === "nemesis" || rel.kind === "rival") && rel.opinion <= -55) {
      const enemy = livingPerson(world, otherId);
      if (enemy) return enemy;
    }
  }
  return null;
}

export const mysteryArc: ArcDef = {
  kind: "mystery-disappearance",
  essential: [],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star) || star.location == null) return 0;
    // Rare by design; enemies and lonely trades tip the scales.
    let w = 0.12;
    const solitary = ["fisher", "hunter", "herder", "peddler", "gravedigger", "falconer"].includes(star.status.profession);
    if (solitary) w += 0.15;
    return w;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, _aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "mystery-disappearance")) return null;
    const home = star.location;
    if (home == null) return null;
    const enemy = findEnemy(ctx, star);
    const truth: Truth = rng.fork("truth").weightedPairs([
      ["murdered", enemy ? 1.6 : 0.5],
      ["wandered", 1],
      ["lost", 1.1],
    ] as const);

    // The kin most likely to keep the search alive.
    const searcher = closeKinIds(world, star)
      .map((id) => livingPerson(world, id))
      .find((p): p is Person => p !== null && isAdult(world, p) && p.location === home);

    const cast: Record<string, number> = { vanished: star.id };
    if (searcher) cast["searcher"] = searcher.id;
    if (truth === "murdered" && enemy) cast["culprit"] = enemy.id;

    const s = beginStoryline(ctx, {
      kind: "mystery-disappearance",
      cast,
      data: {
        star: star.id,
        starRank: star.status.rank,
        home,
        truth: truth === "murdered" && !enemy ? "lost" : truth,
        searches: 0,
      },
      stage: "search",
      firstBeatIn: rng.fork("first").intIn(1, 3),
    });

    // The vanishing itself.
    const gone = ctx.record({
      type: "disappearance",
      date: world.now,
      participants: { subject: star.id },
      // lastSeen: the final ordinary moment anyone can swear to.
      data: { lastSeen: rng.fork("seen").pick(LAST_SEEN) },
      location: home,
      region: world.settlements.get(home)?.region ?? null,
      importance: 25,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    star.flags[SF.vanished] = true;
    star.location = null;

    // If it was murder, the crime is authored NOW, hidden, cause-chained.
    if ((s.data["truth"] as Truth) === "murdered" && enemy) {
      const crime = ctx.record({
        type: "crime-murder",
        date: world.now,
        participants: { killer: enemy.id, victim: star.id },
        // method: what actually happened out there.
        data: {
          method: rng.fork("method").pick([
            "met on the high path, and only one walked on",
            "a quarrel by the water, a stone, and a long quiet",
          ]),
        },
        location: home,
        region: world.settlements.get(home)?.region ?? null,
        importance: 40,
        causes: [gone.id],
        storyline: s.id,
        secret: true,
      });
      s.data["crimeEvent"] = crime.id;
    }
    if (searcher) {
      ctx.services.social.addMemory(world, searcher.id, { event: gone.id, weight: 3, about: star.id, feeling: -0.7 });
    }
    return s;
  },

  stages: {
    /** Torches on the hillsides; rumors in the taverns. */
    search(a: Arc): void {
      const world = a.world;
      const home = a.s.data["home"] as number;
      const searcher = a.living("searcher");
      const searches = a.s.data["searches"] as number;
      if (searches >= 2 || (!searcher && searches >= 1)) {
        a.go("cold", 10, 30);
        return;
      }
      if (searches === 0) {
        a.beat({
          type: "search-mounted",
          participants: searcher ? { leader: searcher.id, for: a.s.cast["vanished"] } : { for: a.s.cast["vanished"] },
          // for: the missing; found: nothing.
          data: { found: "a dropped mitten, a cold fire ring, nothing that answered anything" },
          at: home,
          importance: 8,
        });
      } else {
        a.beat({
          type: "rumor",
          participants: searcher ? { keeper: searcher.id } : {},
          // of: the vanished; word: what the roads are saying.
          data: { of: a.s.cast["vanished"], word: a.rng.fork("rumor").pick(RUMORS) },
          at: home,
          importance: 4,
        });
      }
      void world;
      a.s.data["searches"] = searches + 1;
      a.go("search", 3, 8);
    },

    /** The trail is years cold; the truth surfaces or it does not. */
    cold(a: Arc): void {
      const world = a.world;
      const truth = a.s.data["truth"] as Truth;
      const vanishedId = a.s.cast["vanished"];
      const vanished = world.people.get(vanishedId) ?? null;
      const home = a.s.data["home"] as number;
      const searcher = a.living("searcher");

      // If the vanished died of the world's own hazards while away, close.
      if (!vanished || vanished.died !== null || !world.alive.has(vanishedId)) {
        a.beat({
          type: "omen",
          participants: searcher ? { keeper: searcher.id } : {},
          data: { sign: "an empty chair kept at the table for years", interpretation: "the family stopped setting it without ever agreeing to" },
          at: home,
          importance: 5,
        });
        a.end("was never answered; the chair went unset at last");
        return;
      }

      if (truth === "murdered") {
        const crimeId = a.s.data["crimeEvent"] as EventId | undefined;
        const culprit = a.cast("culprit");
        if (crimeId != null) revealEvent(world, crimeId, world.now);
        const found = a.beat({
          type: "crime-discovered",
          participants: culprit && culprit.died === null ? { culprit: culprit.id, victim: vanishedId } : { victim: vanishedId },
          // crime: what the shepherd's dog finally dug out of the bracken.
          data: { crime: "bones in the bracken above the high path, and a cloak-pin everyone knew" },
          at: home,
          importance: 30,
          causes: crimeId != null ? [crimeId] : undefined,
        });
        delete vanished.flags[SF.vanished];
        a.ctx.services.people.kill(a.ctx, vanished, "found slain, long dead, on the high path", {
          killer: culprit?.id,
          event: found.id,
        });
        a.echo("omen", 2, 6, "the high path, where folk still walk quickly");
        a.end("ended with bones in the bracken and a name whispered");
        return;
      }

      if (truth === "wandered") {
        delete vanished.flags[SF.vanished];
        vanished.location = home;
        const back = a.beat({
          type: "return-from-exile",
          participants: { subject: vanishedId },
          // awayYears: how long the road kept them; changed: what came back.
          data: {
            awayYears: Math.max(1, Math.round((world.now - a.s.started) / 12)),
            changed: "leaner, quieter, with coins no one recognized and a scar no one asked about",
          },
          at: home,
          importance: 20,
        });
        bestowEpithet(a.ctx, a.rng, a.s, vanished, "twice-born", "walked out of the world and back into it", back.id);
        if (searcher) a.ctx.services.social.adjustOpinion(world, searcher.id, vanishedId, 20);
        a.end(`returned to ${settlementName(world, home)} changed`);
        return;
      }

      // Never found: the haunting close. The vanished stays beyond the map;
      // the world's ordinary hazards will take them in their own time.
      a.beat({
        type: "omen",
        participants: searcher ? { keeper: searcher.id } : {},
        data: {
          sign: a.rng.fork("sign").pick([
            "a lantern kept burning in the window every winter since",
            "their name carved on the boundary stone by an unknown hand",
          ]),
          interpretation: "the village counts them among neither the living nor the dead",
        },
        at: home,
        importance: 6,
      });
      a.echo("song", 3, 10, "the one who walked out and never walked back");
      a.end("was never found");
    },
  },
};
