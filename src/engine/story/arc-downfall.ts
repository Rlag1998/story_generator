/**
 * DOWNFALL — a comfortable person and the vice that unmakes them: drink,
 * dice, or pride. Stages: slide (losses, family strain) -> disgrace ->
 * bottom. Endings: a redemption handoff, exile in shame, or a sad quiet
 * death. The slow arcs matter: ruin should read like a road, not a cliff.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, Storyline } from "../core/types";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  SF,
  activeSpouseId,
  ageOf,
  beginStoryline,
  castable,
  isAdult,
  livingPerson,
} from "./helpers";

type Vice = "drink" | "dice" | "pride";

const SLIDE_BEATS: Record<Vice, string[]> = {
  drink: [
    "the tavern took the week's coin again, and the walk home needed both walls",
    "a morning trembling at the workbench, and work sent back unpaid",
    "a night lost entire, and a friend's trust lost with it",
  ],
  dice: [
    "the dice ran cold and the good cloak went across the table",
    "a note of debt signed with a borrowed flourish",
    "the winter stores wagered on a horse that ran like weather",
  ],
  pride: [
    "good counsel waved away in front of the very people who gave it",
    "a customer turned out the door for speaking plainly",
    "an apology owed and pointedly not paid",
  ],
};

function viceFor(rng: Rng, p: Person): Vice {
  return rng.weightedPairs([
    ["drink", 0.6 + Math.max(0, p.personality.volatility)],
    ["dice", 0.4 + p.personality.greed],
    ["pride", 0.3 + Math.max(0, -p.personality.agreeableness) + p.personality.ambition * 0.3],
  ] as const);
}

export const downfallArc: ArcDef = {
  kind: "downfall",
  essential: ["subject"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star) || ageOf(world, star) > 58) return 0;
    if (star.status.wealth < 3) return 0;
    const viceness =
      Math.max(0, star.personality.volatility) + star.personality.greed * 0.7 + Math.max(0, -star.personality.diligence) * 0.5;
    return viceness < 0.35 ? 0 : 0.35 + viceness * 0.6;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, _aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "downfall")) return null;
    const vice = viceFor(rng.fork("vice"), star);
    const s = beginStoryline(ctx, {
      kind: "downfall",
      cast: { subject: star.id },
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        vice,
        depth: 0,
      },
      stage: "slide",
      firstBeatIn: rng.fork("first").intIn(3, 8),
    });
    ctx.record({
      type: "fortune-turn",
      date: world.now,
      participants: { subject: star.id },
      // direction: stumble; vice: the road taken; matter: the first slip.
      data: {
        direction: "stumble",
        vice,
        matter:
          vice === "drink"
            ? "the cup began coming down later and later"
            : vice === "dice"
              ? "one lucky night at the dice, which is how the unlucky ones start"
              : "success curdled into a certainty no one could speak against",
      },
      location: star.location,
      region: star.location != null ? (world.settlements.get(star.location)?.region ?? null) : null,
      importance: 4,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    return s;
  },

  stages: {
    /** Down one slow stair at a time. */
    slide(a: Arc): void {
      const p = a.living("subject");
      if (!p) return;
      const world = a.world;
      const vice = a.s.data["vice"] as Vice;
      const depth = a.s.data["depth"] as number;
      const roll = a.rng.fork("outcome");
      if (depth >= 2 && roll.fork("break").chance(0.35 + depth * 0.15)) {
        a.go("disgrace", 1, 4);
        return;
      }
      // A rung down: coin, then trust.
      p.status.wealth = Math.max(0, p.status.wealth - 1);
      a.beat({
        type: "fortune-turn",
        participants: { subject: p.id },
        data: { direction: "stumble", vice, matter: roll.fork("what").pick(SLIDE_BEATS[vice]) },
        importance: 5,
      });
      const spouse = livingPerson(world, activeSpouseId(p));
      if (spouse && roll.fork("strain").chance(0.6)) {
        a.beat({
          type: "quarrel",
          participants: { a: spouse.id, b: p.id },
          data: { over: vice === "dice" ? "the empty place where the winter coin had been" : "the person the household was slowly losing" },
          importance: 7,
        });
        a.ctx.services.social.adjustOpinion(world, spouse.id, p.id, -12);
      }
      a.s.data["depth"] = depth + 1;
      a.go("slide", 4, 10);
    },

    /** The fall becomes public property. */
    disgrace(a: Arc): void {
      const p = a.living("subject");
      if (!p) return;
      const world = a.world;
      const vice = a.s.data["vice"] as Vice;
      if (vice === "drink") {
        a.beat({
          type: "brawl",
          participants: { subject: p.id },
          data: { over: "a festival, a full cup, and an old grievance shouted for the whole square to hear" },
          importance: 12,
        });
        if (a.rng.fork("hurt").chance(0.35)) p.injuries.push("a nose set crooked in a tavern yard");
      } else {
        a.beat({
          type: "crime-discovered",
          participants: { culprit: p.id },
          // crime: debts and the small dishonesties that hid them.
          data: { crime: vice === "dice" ? "debts hidden under borrowed names" : "a ruinous suit pressed out of pure pride and lost" },
          importance: 14,
        });
      }
      p.status.wealth = Math.max(0, p.status.wealth - 1);
      p.flags[SF.disgraced] = world.now;
      a.go("bottom", 3, 9);
    },

    /** Rock bottom has three doors. */
    bottom(a: Arc): void {
      const p = a.living("subject");
      if (!p) return;
      const world = a.world;
      const vice = a.s.data["vice"] as Vice;
      const pick = a.rng.fork("outcome").weightedPairs([
        ["turn", 1.5 + p.personality.compassion + Math.max(0, p.personality.diligence)],
        ["exile", 1],
        ["death", vice === "drink" ? 1.2 : 0.6],
      ] as const);

      if (pick === "turn") {
        a.beat({
          type: "fortune-turn",
          participants: { subject: p.id },
          data: {
            direction: "rise",
            vice,
            matter: "a grey morning at the bottom of everything, and a first small honest day",
          },
          importance: 8,
        });
        // The disgraced flag stays: bait for the redemption arc to find.
        a.end("hit bottom, and lay there looking up");
        return;
      }

      if (pick === "exile") {
        const from = p.location;
        a.beat({
          type: "exile",
          participants: { subject: p.id },
          // reason: driven out by debt and shame rather than law.
          data: { reason: "creditors at the door and no face left to show the street", from },
          importance: 14,
        });
        p.flags[SF.emigrated] = true;
        p.location = null;
        world.alive.delete(p.id);
        a.end("ended on the far side of the town gate, walking");
        return;
      }

      // The sad quiet door.
      const last = a.beat({
        type: "illness",
        participants: { subject: p.id },
        // name: what the healers called it; the town knew better.
        data: { name: vice === "drink" ? "a wasting of the liver" : "a failing heart", vice },
        importance: 6,
      });
      a.ctx.services.people.kill(
        a.ctx,
        p,
        vice === "drink" ? "the drink took them at the last, quietly" : "went to bed ruined and did not get up",
        { event: last.id },
      );
      a.end("ended in a small room, quietly");
    },
  },
};
