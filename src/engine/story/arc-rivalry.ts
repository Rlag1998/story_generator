/**
 * RIVALRY — two craftsmen, bards, or courtiers, each convinced the other
 * stands in their light. Stages: spark -> contests (escalating bouts) ->
 * maybe sabotage -> settled. Endings: hard-won respect (sworn friends),
 * one rival ruined, or obsession curdling into a crime.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, ProfessionKey, Storyline } from "../core/types";
import { revealEvent } from "../core/world";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  ageOf,
  beginStoryline,
  bestowEpithet,
  castable,
  isAdult,
  residentsWhere,
} from "./helpers";

type Field = "craft" | "song" | "court";

const CRAFT_TRADES = new Set<ProfessionKey>([
  "smith",
  "carpenter",
  "mason",
  "weaver",
  "potter",
  "brewer",
  "baker",
  "artist",
]);
const SONG_TRADES = new Set<ProfessionKey>(["bard"]);
const COURT_TRADES = new Set<ProfessionKey>(["courtier", "steward", "scribe", "judge"]);

function fieldOf(p: Person): Field | null {
  if (CRAFT_TRADES.has(p.status.profession)) return "craft";
  if (SONG_TRADES.has(p.status.profession)) return "song";
  if (COURT_TRADES.has(p.status.profession)) return "court";
  return null;
}

const CONTEST_FORMS: Record<Field, string[]> = {
  craft: [
    "a blade tempered against a blade at the market fair",
    "two gates carved for the same temple door",
    "a wager of masterworks judged by the guild elders",
  ],
  song: [
    "a singing contest at the harvest fire",
    "dueling verses on the steps of the great hall",
    "a lament for the dead lord, sung one against the other",
  ],
  court: [
    "rival counsel before the high seat",
    "a race to bring the better tally of the granaries",
    "two toasts at the feast, each sharper than the last",
  ],
};

function skillOf(p: Person, field: Field): number {
  const apt =
    field === "song"
      ? (p.phenotype.aptitudes["music"] ?? 0)
      : field === "court"
        ? (p.phenotype.aptitudes["oratory"] ?? 0) + (p.phenotype.aptitudes["intrigue"] ?? 0) * 0.5
        : (p.phenotype.aptitudes["craft"] ?? 0);
  return apt + Math.max(0, p.personality.diligence);
}

export const rivalryArc: ArcDef = {
  kind: "rivalry",
  essential: ["a", "b"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star) || fieldOf(star) === null) return 0;
    // Needs an appetite for contest, not just a workbench.
    const appetite = star.personality.ambition + Math.max(0, -star.personality.agreeableness) + Math.max(0, star.personality.wrath) * 0.5;
    if (appetite < 0.5) return 0;
    return 0.3 + appetite * 0.45;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    const field = fieldOf(star);
    if (field === null || !castable(world, star, "rivalry")) return null;
    const peers = residentsWhere(world, aids.index, star.location, (p) => {
      if (p.id === star.id || fieldOf(p) !== field) return false;
      if (!isAdult(world, p) || !castable(world, p, "rivalry")) return false;
      return Math.abs(ageOf(world, p) - ageOf(world, star)) <= 18;
    });
    if (peers.length === 0) return null;
    const rival = rng.fork("rival").pick(peers);
    const s = beginStoryline(ctx, {
      kind: "rivalry",
      cast: { a: star.id, b: rival.id },
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        field,
        bouts: 0,
        scoreA: 0,
        scoreB: 0,
      },
      stage: "contests",
      firstBeatIn: rng.fork("first").intIn(2, 6),
    });
    // Opening beat: the rivalry declared before witnesses.
    const existing = ctx.services.social.getRelation(world, star.id, rival.id);
    ctx.record({
      type: existing?.kind === "rival" || existing?.kind === "nemesis" ? "insult" : "rivalry-formed",
      date: world.now,
      participants: { a: star.id, b: rival.id },
      // field: the shared trade the rivalry burns over.
      data: { field, slight: "each named the other second-best in the same breath" },
      location: star.location,
      region: star.location != null ? (world.settlements.get(star.location)?.region ?? null) : null,
      importance: 7,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    ctx.services.social.setRelation(world, star.id, rival.id, { kind: "rival", since: world.now, opinion: -25 });
    ctx.services.social.setRelation(world, rival.id, star.id, { kind: "rival", since: world.now, opinion: -25 });
    return s;
  },

  stages: {
    /** Bout after bout, the town keeping score. */
    contests(a: Arc): void {
      const A = a.living("a");
      const B = a.living("b");
      if (!A || !B) return;
      const field = a.s.data["field"] as Field;
      const bouts = a.s.data["bouts"] as number;
      const roll = a.rng.fork("outcome");
      if (bouts >= 2) {
        const pick = roll.fork("branch").weightedPairs([
          ["settle", 2.5],
          ["sabotage", 1 + Math.max(0, -A.personality.honor, -B.personality.honor) * 2],
          ["again", 1],
        ] as const);
        if (pick === "settle") {
          a.go("settled", 1, 4);
          return;
        }
        if (pick === "sabotage") {
          a.go("sabotage", 1, 3);
          return;
        }
      }
      const skillA = skillOf(A, field);
      const skillB = skillOf(B, field);
      const aWins = roll.fork("victor").chance(0.5 + (skillA - skillB) * 0.1);
      const victor = aWins ? A : B;
      a.beat({
        type: "contest-held",
        participants: { a: A.id, b: B.id, victor: victor.id },
        // form: the shape of the bout; field: the contested trade.
        data: { form: roll.fork("form").pick(CONTEST_FORMS[field]), field },
        importance: 9 + bouts * 2,
      });
      if (aWins) a.s.data["scoreA"] = (a.s.data["scoreA"] as number) + 1;
      else a.s.data["scoreB"] = (a.s.data["scoreB"] as number) + 1;
      const loser = aWins ? B : A;
      a.ctx.services.social.adjustOpinion(a.world, loser.id, victor.id, -8);
      a.s.data["bouts"] = bouts + 1;
      a.go("contests", 4, 12);
    },

    /** A hand in the dark: the losing rival ruins the other's work. */
    sabotage(a: Arc): void {
      const A = a.living("a");
      const B = a.living("b");
      if (!A || !B) return;
      const world = a.world;
      const behind = (a.s.data["scoreA"] as number) >= (a.s.data["scoreB"] as number) ? B : A;
      const ahead = behind.id === A.id ? B : A;
      const field = a.s.data["field"] as Field;
      const deed = a.beat({
        type: "sabotage",
        participants: { saboteur: behind.id, victim: ahead.id },
        // method: what was ruined and how.
        data: {
          method:
            field === "craft"
              ? a.rng.fork("m").pick(["a flawed billet swapped into the forge stock", "the kiln door left cracked on firing night"])
              : field === "song"
                ? "a slanderous verse seeded in the taverns under the other's name"
                : "letters gone missing from the other's dispatch case",
          field,
        },
        importance: 14,
        secret: true,
      });
      if (a.rng.fork("caught").chance(0.5)) {
        revealEvent(world, deed.id, world.now);
        a.beat({
          type: "crime-discovered",
          participants: { culprit: behind.id, victim: ahead.id },
          // crime: what came to light.
          data: { crime: "sabotage of a rival's work" },
          importance: 16,
          causes: [deed.id],
        });
        a.ctx.services.social.adjustOpinion(world, ahead.id, behind.id, -35);
        behind.status.wealth = Math.max(0, behind.status.wealth - 1);
        a.go("settled", 1, 3);
      } else {
        ahead.status.wealth = Math.max(0, ahead.status.wealth - 1);
        a.ctx.services.social.addMemory(world, ahead.id, { event: deed.id, weight: 2, about: behind.id, feeling: -0.6 });
        a.go("settled", 2, 6);
      }
    },

    /** The rivalry finds its final shape. */
    settled(a: Arc): void {
      const A = a.living("a");
      const B = a.living("b");
      if (!A || !B) return;
      const world = a.world;
      const field = a.s.data["field"] as Field;
      const sabotaged = a.s.events.some((eid) => world.events.get(eid)?.type === "sabotage");
      const pick = a.rng.fork("outcome").weightedPairs([
        ["respect", 2 + Math.max(0, A.personality.agreeableness + B.personality.agreeableness) - (sabotaged ? 1 : 0)],
        ["ruin", 1.5],
        ["obsession", 0.6 + Math.max(0, A.personality.volatility, B.personality.volatility) + (sabotaged ? 0.8 : 0)],
      ] as const);

      if (pick === "respect") {
        a.beat({
          type: "reconciliation",
          participants: { a: A.id, b: B.id },
          data: { manner: "each finally named the other the better half of his own skill" },
          importance: 12,
        });
        const oath = a.beat({
          type: "oath-sworn",
          participants: { a: A.id, b: B.id },
          // oath: sworn companionship between old rivals.
          data: { oath: "swore friendship over the tools of their trade" },
          importance: 10,
        });
        void oath;
        a.ctx.services.social.setRelation(world, A.id, B.id, { kind: "sworn", since: world.now, opinion: 55 });
        a.ctx.services.social.setRelation(world, B.id, A.id, { kind: "sworn", since: world.now, opinion: 55 });
        a.end("burned out into a grudging, then a sworn, friendship");
        return;
      }

      if (pick === "ruin") {
        const scoreA = a.s.data["scoreA"] as number;
        const scoreB = a.s.data["scoreB"] as number;
        const winner = scoreA >= scoreB ? A : B;
        const loser = winner.id === A.id ? B : A;
        const work = a.beat({
          type: "masterwork-created",
          participants: { creator: winner.id, outshone: loser.id },
          // Canonical payload: kind + title.
          data: {
            kind: field === "song" ? "song" : field === "court" ? "oration" : "craftwork",
            title: field === "song" ? "the song that ended the argument" : "the piece no rival could answer",
          },
          importance: 26,
        });
        loser.status.wealth = Math.max(0, loser.status.wealth - 2);
        a.ctx.services.social.addMemory(world, loser.id, { event: work.id, weight: 3, about: winner.id, feeling: -0.9 });
        a.ctx.services.social.adjustOpinion(world, loser.id, winner.id, -25);
        bestowEpithet(a.ctx, a.rng, a.s, winner, field === "song" ? "singer" : "hammer", "settled a famous rivalry once and for all", work.id);
        a.end(`ended with ${loser.givenName} ruined in the town's eyes`);
        return;
      }

      // Obsession: the rivalry stops being about the work at all.
      const scoreA2 = a.s.data["scoreA"] as number;
      const scoreB2 = a.s.data["scoreB"] as number;
      const obsessed = scoreA2 >= scoreB2 ? B : A;
      const target = obsessed.id === A.id ? B : A;
      a.ctx.services.social.setRelation(world, obsessed.id, target.id, { kind: "nemesis", since: world.now, opinion: -85 });
      const violent = a.rng.fork("violent").chance(0.45 + Math.max(0, obsessed.personality.wrath) * 0.4);
      if (violent) {
        const deed = a.beat({
          type: "crime-murder",
          participants: { killer: obsessed.id, victim: target.id },
          // method: the crime the obsession came to.
          data: { method: "a rival's shears, a dark workshop, and a story about thieves" },
          importance: 42,
          secret: true,
        });
        a.ctx.services.people.kill(a.ctx, target, "found dead in the workshop, the good work smashed around them", {
          killer: obsessed.id,
          event: deed.id,
        });
        a.end("curdled into obsession, and then into murder");
      } else {
        const brawlEv = a.beat({
          type: "brawl",
          participants: { attacker: obsessed.id, victim: target.id },
          // over: what the fists were about.
          data: { over: "an obsession that had outgrown the workbench" },
          importance: 12,
        });
        target.injuries.push("a hand that never quite closed right again");
        a.ctx.services.social.adjustOpinion(world, target.id, obsessed.id, -40);
        void brawlEv;
        a.end("guttered into an ugly obsession the town learned to walk around");
      }
    },
  },
};
