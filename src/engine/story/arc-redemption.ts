/**
 * REDEMPTION — a disgraced soul tries to buy back their name. Stages:
 * penance -> temptation -> proving. Endings: earned forgiveness (warm,
 * imp 25), relapse, or a heroic death that redeems the name at the price
 * of the neck it hung on.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, Storyline } from "../core/types";
import { sortedIds } from "../core/world";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  SF,
  beginStoryline,
  bestowEpithet,
  castable,
  flagNum,
  isAdult,
  livingPerson,
  localIndex,
  residentsWhere,
} from "./helpers";

const PENANCES = [
  "carried water for the sick-house through a whole fevered month",
  "rebuilt the shrine wall alone, stone by borrowed stone",
  "stood at the church door each law-day and named their own fault aloud",
  "worked the widow's strip of field before their own",
];

const TEMPTATIONS = [
  "an old drinking friend with a full jug and a free evening",
  "a purse left carelessly on a familiar table",
  "an insult from someone who remembered the worst of them",
];

/** The person who holds the coldest grudge against the penitent. */
function coldestJudge(ctx: Ctx, penitent: Person): Person | null {
  const world = ctx.world;
  let coldest: Person | null = null;
  let low = -20; // must be a real grudge
  const rels = world.relationships;
  for (const otherId of sortedIds(world.people)) {
    const rel = rels.get(otherId)?.get(penitent.id);
    if (!rel || rel.opinion >= low) continue;
    const other = livingPerson(world, otherId);
    if (!other || other.location !== penitent.location) continue;
    low = rel.opinion;
    coldest = other;
  }
  return coldest;
}

export const redemptionArc: ArcDef = {
  kind: "redemption",
  essential: ["penitent"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star)) return 0;
    const disgraced = flagNum(star, SF.disgraced);
    const guilt = flagNum(star, SF.guilt);
    if (disgraced === null && guilt === null && star.flags["pol.deposed"] === undefined) return 0;
    // Let shame ripen a while before the turn.
    const since = Math.max(disgraced ?? 0, guilt ?? 0);
    if (since > 0 && world.now - since < 10) return 0;
    return 2.2 + star.personality.compassion;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, _aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "redemption")) return null;
    const judge = coldestJudge(ctx, star);
    const cast: Record<string, number> = { penitent: star.id };
    if (judge) cast["judge"] = judge.id;
    const s = beginStoryline(ctx, {
      kind: "redemption",
      cast,
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        acts: 0,
      },
      stage: "penance",
      firstBeatIn: rng.fork("first").intIn(2, 5),
    });
    ctx.record({
      type: "penance-done",
      date: world.now,
      participants: { subject: star.id },
      // act: the first small labor of amends.
      data: { act: "swept the temple steps before dawn, unasked and unthanked" },
      location: star.location,
      region: star.location != null ? (world.settlements.get(star.location)?.region ?? null) : null,
      importance: 5,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    return s;
  },

  stages: {
    /** Small labors, coldly received at first. */
    penance(a: Arc): void {
      const p = a.living("penitent");
      if (!p) return;
      const acts = a.s.data["acts"] as number;
      const roll = a.rng.fork("outcome");
      if (acts >= 1 && roll.fork("tempt").chance(0.5)) {
        a.go("temptation", 1, 3);
        return;
      }
      if (acts >= 2) {
        a.go("proving", 2, 6);
        return;
      }
      a.beat({
        type: "penance-done",
        participants: { subject: p.id },
        data: { act: roll.fork("act").pick(PENANCES) },
        importance: 5,
      });
      const judge = a.living("judge");
      if (judge) a.ctx.services.social.adjustOpinion(a.world, judge.id, p.id, 6);
      a.s.data["acts"] = acts + 1;
      a.go("penance", 3, 7);
    },

    /** The old life knocks once, politely. */
    temptation(a: Arc): void {
      const p = a.living("penitent");
      if (!p) return;
      const roll = a.rng.fork("outcome");
      const resists = roll.fork("resist").chance(0.55 + Math.max(0, p.personality.diligence) * 0.3 + p.personality.compassion * 0.2);
      if (resists) {
        a.beat({
          type: "penance-done",
          participants: { subject: p.id },
          // act: temptation faced down; tempted: what knocked.
          data: { act: "looked the old life in the eye and shut the door on it", tempted: roll.fork("what").pick(TEMPTATIONS) },
          importance: 7,
        });
        a.s.data["acts"] = (a.s.data["acts"] as number) + 1;
        a.go("proving", 2, 7);
        return;
      }
      // Relapse: the fizzle ending, recorded honestly.
      a.beat({
        type: "fortune-turn",
        participants: { subject: p.id },
        data: {
          direction: "stumble",
          matter: roll.fork("what").pick(TEMPTATIONS) + ", and the door opened after all",
        },
        importance: 8,
      });
      p.flags[SF.disgraced] = a.world.now; // the shame renews its date
      a.end("faltered at the first real test");
    },

    /** A moment arrives that asks everything. */
    proving(a: Arc): void {
      const p = a.living("penitent");
      if (!p) return;
      const world = a.world;
      const judge = a.living("judge");
      const pick = a.rng.fork("outcome").weightedPairs([
        ["forgiven", 2 + (judge ? judge.personality.compassion : 0.3)],
        ["relapse", 0.8],
        ["heroic-death", 0.7 + Math.max(0, p.personality.courage)],
      ] as const);

      if (pick === "forgiven") {
        const witness = judge ?? p;
        a.beat({
          type: "reconciliation",
          participants: judge ? { penitent: p.id, forgiver: judge.id } : { penitent: p.id },
          data: {
            manner: judge
              ? "the coldest door in town opened, and there was a place set at the table"
              : "the town, without ever voting on it, began using the old warm name again",
          },
          importance: 25,
        });
        delete p.flags[SF.disgraced];
        delete p.flags[SF.guilt];
        if (judge) {
          a.ctx.services.social.adjustOpinion(world, judge.id, p.id, 40);
          a.ctx.services.social.adjustOpinion(world, p.id, judge.id, 25);
        }
        void witness;
        a.end("ended at a table with a place set, forgiven");
        return;
      }

      if (pick === "relapse") {
        a.beat({
          type: "fortune-turn",
          participants: { subject: p.id },
          data: { direction: "stumble", matter: "so close to the shore, and the current took them anyway" },
          importance: 8,
        });
        p.flags[SF.disgraced] = world.now;
        a.end("came within sight of forgiveness and slid back");
        return;
      }

      // Heroic death: the name is bought back with everything.
      const saved = residentsWhere(world, localIndex(world, p.location), p.location, (q) => q.id !== p.id && q.died === null);
      const rescued = saved.length > 0 ? a.rng.fork("saved").pick(saved) : null;
      const deed = a.beat({
        type: "heroic-rescue",
        participants: rescued ? { hero: p.id, saved: rescued.id } : { hero: p.id },
        // peril: the fire/flood/beast the penitent went into.
        data: {
          peril: a.rng.fork("peril").pick([
            "went back into the burning granary for the child's crying",
            "held the flood-gate shut with their own shoulders until the others were clear",
            "stood between the wolf-pack and the fold with a staff",
          ]),
        },
        importance: 30,
      });
      bestowEpithet(a.ctx, a.rng, a.s, p, "deathless", "died buying back their name", deed.id);
      delete p.flags[SF.disgraced];
      delete p.flags[SF.guilt];
      if (rescued) {
        a.ctx.services.social.addMemory(world, rescued.id, { event: deed.id, weight: 4, about: p.id, feeling: 1 });
      }
      a.ctx.services.people.kill(a.ctx, p, "died of their hurts, having gone where no one else would", {
        event: deed.id,
      });
      a.echo("song", 2, 8, "the one who fell far and climbed back in a single hour");
      a.end("ended in a death that unwrote the disgrace");
    },
  },
};
