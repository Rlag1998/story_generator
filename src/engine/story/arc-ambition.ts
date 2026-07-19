/**
 * AMBITION — the climb toward mastery, wealth, office, or a title.
 * Stages: hunger -> climb (patronage, risks) -> price (a moral compromise)
 * -> crest. Endings: triumph (masterwork flag or claimant path for
 * politics), hollow victory, or a downfall handoff that baits the
 * redemption arc.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, Storyline } from "../core/types";
import { revealEvent } from "../core/world";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  SF,
  activeSpouseId,
  ageOf,
  beginStoryline,
  bestowEpithet,
  castable,
  isAdult,
  livingPerson,
  residentsWhere,
} from "./helpers";

type Goal = "mastery" | "wealth" | "office";

const CRAFTY = new Set(["smith", "carpenter", "mason", "weaver", "potter", "brewer", "baker", "artist", "bard", "scribe", "healer"]);
const MONied = new Set(["merchant", "peddler", "innkeeper", "sailor", "fisher", "farmer", "herder"]);

function goalFor(star: Person): Goal {
  if (CRAFTY.has(star.status.profession)) return "mastery";
  if (MONied.has(star.status.profession)) return "wealth";
  if (star.status.rank >= 3) return "office";
  return "wealth";
}

const RISES: Record<Goal, string[]> = {
  mastery: [
    "a commission won over older hands",
    "the guild's grudging nod at the winter showing",
    "an apprentice taken on, the first of several",
  ],
  wealth: [
    "a cargo that came home when three others sank",
    "a debt bought cheap and collected in full",
    "a second stall, then a third, in the market row",
  ],
  office: [
    "a word in the right ear at the right feast",
    "a rival's error quietly made much of",
    "a service done for the high seat and remembered",
  ],
};

const STUMBLES: Record<Goal, string[]> = {
  mastery: ["a jealous guild vote", "a patron dead before the fee was paid"],
  wealth: ["a wreck on the bar with the season's profit aboard", "a partner fled with the strongbox"],
  office: ["a patron fallen from favor", "a whisper campaign that stuck for a season"],
};

export const ambitionArc: ArcDef = {
  kind: "ambition",
  essential: ["climber"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star) || ageOf(world, star) > 50) return 0;
    if (star.personality.ambition < 0.55) return 0;
    return 0.3 + star.personality.ambition * 1.2;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "ambition")) return null;
    const goal = goalFor(star);
    // A patron: someone better placed in the same settlement, if one exists.
    const patrons = residentsWhere(world, aids.index, star.location, (p) => {
      return p.id !== star.id && isAdult(world, p) && p.status.rank >= star.status.rank + 1 && ageOf(world, p) >= 30;
    });
    const patron = patrons.length > 0 && rng.fork("patron-gate").chance(0.7) ? rng.fork("patron").pick(patrons) : null;
    const cast: Record<string, number> = { climber: star.id };
    if (patron) cast["patron"] = patron.id;
    const s = beginStoryline(ctx, {
      kind: "ambition",
      cast,
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        goal,
        progress: 0,
        compromised: false,
      },
      stage: "climb",
      firstBeatIn: rng.fork("first").intIn(3, 7),
    });
    const opening = ctx.record({
      type: goal === "mastery" && patron ? "mentorship-began" : "ambition-kindled",
      date: world.now,
      participants: patron ? { subject: star.id, patron: patron.id } : { subject: star.id },
      // goal: what is hungered for.
      data: { goal, spark: "a hunger that would not sit quiet any longer" },
      location: star.location,
      region: star.location != null ? (world.settlements.get(star.location)?.region ?? null) : null,
      importance: 6,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    void opening;
    if (patron) ctx.services.social.adjustOpinion(world, star.id, patron.id, 15);
    return s;
  },

  stages: {
    /** Rungs gained and lost. */
    climb(a: Arc): void {
      const climber = a.living("climber");
      if (!climber) return;
      const goal = a.s.data["goal"] as Goal;
      const progress = a.s.data["progress"] as number;
      const roll = a.rng.fork("outcome");
      if (progress >= 2) {
        const tempted = !(a.s.data["compromised"] as boolean) && roll.fork("price").chance(0.55 + Math.max(0, -climber.personality.honor) * 0.4);
        a.go(tempted ? "price" : "crest", 2, 6);
        return;
      }
      const rises = roll.fork("rise").chance(0.6 + Math.max(0, climber.personality.diligence) * 0.2);
      a.beat({
        type: "fortune-turn",
        participants: { subject: climber.id },
        // direction: rise|stumble; matter: the rung gained or lost.
        data: {
          direction: rises ? "rise" : "stumble",
          matter: rises ? roll.fork("what").pick(RISES[goal]) : roll.fork("what").pick(STUMBLES[goal]),
          goal,
        },
        importance: rises ? 5 : 6,
      });
      if (rises) a.s.data["progress"] = progress + 1;
      else if (roll.fork("give-up").chance(0.18)) {
        // Fizzle: the hunger cools into an ordinary life.
        a.beat({
          type: "fortune-turn",
          participants: { subject: climber.id },
          data: { direction: "stumble", matter: "the ladder was quietly set down; the hearth won", goal },
          importance: 4,
        });
        a.end("cooled into contentment before the summit");
        return;
      }
      a.go("climb", 4, 10);
    },

    /** The price: a line crossed to reach the last rung. */
    price(a: Arc): void {
      const climber = a.living("climber");
      if (!climber) return;
      const world = a.world;
      const goal = a.s.data["goal"] as Goal;
      const patron = a.living("patron");
      const roll = a.rng.fork("outcome");
      const way = roll.fork("way").weightedPairs([
        ["oath", 1.5],
        ["bribe", goal === "office" || goal === "wealth" ? 1.5 : 0.5],
        ["betrayal", patron ? 1.2 : 0.4],
      ] as const);
      if (way === "oath") {
        a.beat({
          type: "oath-broken",
          participants: { subject: climber.id },
          // oath: what was foresworn on the way up.
          data: { oath: "a promise made when the climb began, inconvenient now" },
          importance: 12,
        });
      } else if (way === "bribe") {
        a.beat({
          type: "crime-theft",
          participants: { subject: climber.id },
          // what: the crooked shortcut taken.
          data: { what: "weights shaved and ledgers dressed, silver moving in the dark" },
          importance: 12,
          secret: true,
        });
      } else if (patron) {
        a.beat({
          type: "quarrel",
          participants: { subject: climber.id, patron: patron.id },
          data: { over: "the hand that helped, bitten on the last rung" },
          importance: 10,
        });
        a.ctx.services.social.adjustOpinion(world, patron.id, climber.id, -35);
      }
      a.s.data["compromised"] = true;
      a.go("crest", 2, 6);
    },

    /** The summit, such as it is. */
    crest(a: Arc): void {
      const climber = a.living("climber");
      if (!climber) return;
      const world = a.world;
      const goal = a.s.data["goal"] as Goal;
      const compromised = a.s.data["compromised"] as boolean;
      const pick = a.rng.fork("outcome").weightedPairs([
        ["triumph", 2],
        ["hollow", 1 + (compromised ? 1 : 0)],
        ["downfall", compromised ? 1.4 : 0.3],
      ] as const);

      if (pick === "downfall") {
        // The compromise surfaces; the climb becomes a fall.
        const secretEv = a.s.events
          .map((eid) => world.events.get(eid))
          .find((ev) => ev && ev.secret && ev.type === "crime-theft");
        if (secretEv) revealEvent(world, secretEv.id, world.now);
        a.beat({
          type: "crime-discovered",
          participants: { culprit: climber.id },
          // crime: what the town learned.
          data: { crime: "the crooked rungs of a famous climb" },
          importance: 18,
          causes: secretEv ? [secretEv.id] : undefined,
        });
        climber.status.wealth = Math.max(0, climber.status.wealth - 2);
        climber.flags[SF.disgraced] = world.now;
        a.end("collapsed under the weight of its own shortcuts");
        return;
      }

      // The goal is reached, one way or another.
      let crestEv;
      if (goal === "mastery") {
        crestEv = a.beat({
          type: "masterwork-created",
          participants: { creator: climber.id },
          data: { kind: climber.status.profession, title: "the piece that silenced the doubters" },
          importance: pick === "triumph" ? 32 : 24,
        });
        // Event id, so the title grant can cite the work as its cause.
        climber.flags[SF.masterworkDone] = crestEv.id;
      } else if (goal === "wealth") {
        crestEv = a.beat({
          type: "fortune-made",
          participants: { subject: climber.id },
          // how: the venture that landed.
          data: { how: "the ventures came home together, and the house was suddenly rich" },
          importance: pick === "triumph" ? 15 : 12,
        });
        climber.status.wealth = Math.min(5, climber.status.wealth + 2);
      } else {
        crestEv = a.beat({
          type: "title-granted",
          participants: { subject: climber.id },
          // title: the office grasped at last.
          data: { title: "a seat at the high table", office: true },
          importance: pick === "triumph" ? 18 : 14,
        });
        climber.status.titles.push("Counselor");
        // High-born winners now stand close enough to want more.
        if (climber.status.rank >= 3 && climber.location != null) {
          const polityId = world.settlements.get(climber.location)?.polity;
          if (polityId != null && world.polities.has(polityId) && climber.personality.ambition >= 0.75) {
            climber.flags[SF.claimant] = polityId;
          }
        }
      }

      if (pick === "triumph") {
        bestowEpithet(a.ctx, a.rng, a.s, climber, goal === "mastery" ? "hammer" : goal === "wealth" ? "golden" : "cunning", "climbed further than anyone expected", crestEv.id);
        a.end("ended in triumph, the hunger fed at last");
      } else {
        // Hollow: the summit is colder than advertised.
        const spouse = livingPerson(world, activeSpouseId(climber));
        if (spouse) {
          a.ctx.services.social.adjustOpinion(world, spouse.id, climber.id, -20);
          a.ctx.services.social.addMemory(world, spouse.id, { event: crestEv.id, weight: 2, about: climber.id, feeling: -0.5 });
        }
        const patron = a.cast("patron");
        if (patron && patron.died === null) a.ctx.services.social.adjustOpinion(world, climber.id, patron.id, -10);
        a.beat({
          type: "fortune-turn",
          participants: { subject: climber.id },
          data: { direction: "stumble", matter: "the summit was reached, and found to be a narrow, windy place", goal },
          importance: 7,
          causes: [crestEv.id],
        });
        a.end("was won, and tasted of ash");
      }
    },
  },
};
