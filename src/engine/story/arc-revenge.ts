/**
 * REVENGE — kin of the slain circles the killer. Stages: brooding ->
 * vow (oath-sworn) -> stalking -> the strike. Endings: bloody justice
 * (secret murder or open duel), mercy at the brink (imp 30), miscarried
 * vengeance (the wrong grave gets filled and guilt moves in), or the
 * debt reversed when the killer proves the quicker.
 */

import type { Rng } from "../core/rng";
import type { Ctx, EventId, Person, PersonId, Storyline } from "../core/types";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  SF,
  beginStoryline,
  bestowEpithet,
  castable,
  closeKinIds,
  deathEventOf,
  isAdult,
  livingPerson,
  localIndex,
  residentsWhere,
} from "./helpers";

/** A slain kinsman with a publicly known, still-living killer. */
export function findGrievance(
  ctx: Ctx,
  star: Person,
): { slain: Person; slayer: Person; deathEvent: EventId | null } | null {
  const world = ctx.world;
  for (const kid of closeKinIds(world, star)) {
    const kin = world.people.get(kid);
    if (!kin || kin.died === null) continue;
    if (world.now - kin.died > 120) continue; // within ten years
    const devId = deathEventOf(world, kin);
    if (devId == null) continue;
    const dev = world.events.get(devId);
    const killerId = dev?.participants["killer"];
    if (killerId == null) continue;
    // Only public knowledge feeds vengeance; hidden murders wait for reveal.
    const causeEv = dev && dev.causes.length > 0 ? world.events.get(dev.causes[0]) : null;
    if (causeEv && causeEv.secret) continue;
    const slayer = livingPerson(world, killerId);
    if (!slayer || slayer.id === star.id) continue;
    return { slain: kin, slayer, deathEvent: devId };
  }
  return null;
}

const VOWS = [
  "swore it on the grave-earth, kneeling, with witnesses pretending not to hear",
  "swore it into the winter fire, and fed the fire the dead one's ribbon",
  "swore it quietly over the mended tools the dead had left behind",
];

export const revengeArc: ArcDef = {
  kind: "revenge",
  essential: ["avenger", "slayer"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star)) return 0;
    const grievance = findGrievance(ctx, star);
    if (!grievance) return 0;
    return 2 + Math.max(0, star.personality.wrath) * 1.5 + Math.max(0, -star.personality.compassion);
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, _aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "revenge")) return null;
    const grievance = findGrievance(ctx, star);
    if (!grievance) return null;
    const { slain, slayer, deathEvent } = grievance;
    const s = beginStoryline(ctx, {
      kind: "revenge",
      cast: { avenger: star.id, slayer: slayer.id, slain: slain.id },
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        hesitations: 0,
      },
      stage: "brooding",
      firstBeatIn: rng.fork("first").intIn(2, 6),
    });
    ctx.record({
      type: "grief-kept",
      date: world.now,
      participants: { subject: star.id, for: slain.id },
      // for: the unquiet dead; against: the name not yet spoken aloud.
      data: { against: slayer.id, manner: "kept the grief like a whetstone, and used it daily" },
      location: star.location,
      region: star.location != null ? (world.settlements.get(star.location)?.region ?? null) : null,
      importance: 6,
      causes: deathEvent != null ? [deathEvent] : [],
      storyline: s.id,
      secret: false,
    });
    return s;
  },

  stages: {
    /** The grief sits down to sharpen itself. */
    brooding(a: Arc): void {
      const avenger = a.living("avenger");
      const slayer = a.living("slayer");
      if (!avenger || !slayer) return;
      // Time can do what mercy cannot.
      if (a.rng.fork("cool").chance(0.15 + avenger.personality.compassion * 0.25)) {
        const slain = a.cast("slain");
        a.beat({
          type: "grief-kept",
          participants: slain ? { subject: avenger.id, for: slain.id } : { subject: avenger.id },
          data: { manner: "one season the whetstone stayed in the drawer, and then another" },
          importance: 5,
        });
        a.end("cooled season by season into an ordinary grief");
        return;
      }
      a.go("vow", 1, 4);
    },

    /** The oath is spoken. */
    vow(a: Arc): void {
      const avenger = a.living("avenger");
      const slayer = a.living("slayer");
      const slain = a.cast("slain");
      if (!avenger || !slayer) return;
      a.beat({
        type: "oath-sworn",
        participants: slain ? { subject: avenger.id, for: slain.id } : { subject: avenger.id },
        // oath: vengeance; against: the debtor.
        data: { oath: a.rng.fork("vow").pick(VOWS), against: slayer.id },
        importance: 12,
      });
      a.go("stalking", 2, 7);
    },

    /** Learning the killer's roads and hours. */
    stalking(a: Arc): void {
      const avenger = a.living("avenger");
      const slayer = a.living("slayer");
      if (!avenger || !slayer) return;
      const hesitations = a.s.data["hesitations"] as number;
      const roll = a.rng.fork("outcome");
      const pick = roll.fork("branch").weightedPairs([
        ["strike", 2 + hesitations],
        ["hesitate", hesitations >= 2 ? 0 : 1.2 + avenger.personality.compassion],
        ["noticed", 0.7],
      ] as const);
      if (pick === "hesitate") {
        a.beat({
          type: "stalking",
          participants: { subject: avenger.id, target: slayer.id },
          // watched: the moment that was let pass.
          data: { watched: "had the moment on the mill road, and let it walk by" },
          importance: 6,
          secret: true,
        });
        a.s.data["hesitations"] = hesitations + 1;
        a.go("stalking", 3, 8);
        return;
      }
      if (pick === "noticed") {
        // The prey feels the eyes; the strike comes hurried.
        a.beat({
          type: "stalking",
          participants: { subject: avenger.id, target: slayer.id },
          data: { watched: "was seen watching from the treeline, and the quarry began carrying a knife" },
          importance: 7,
          secret: true,
        });
        a.s.data["hurried"] = true;
        a.go("strike", 1, 2);
        return;
      }
      a.go("strike", 1, 3);
    },

    /** The brink. */
    strike(a: Arc): void {
      const avenger = a.living("avenger");
      const slayer = a.living("slayer");
      const slain = a.cast("slain");
      if (!avenger || !slayer) return;
      const world = a.world;
      const hurried = a.s.data["hurried"] === true;
      const pick = a.rng.fork("outcome").weightedPairs([
        ["duel", 1.2 + Math.max(0, avenger.personality.honor) * 1.5],
        ["murder", 1 + Math.max(0, -avenger.personality.honor) * 1.5],
        ["mercy", 0.8 + avenger.personality.compassion * 2],
        ["miscarry", hurried ? 1.2 : 0.35],
      ] as const);

      if (pick === "mercy") {
        a.beat({
          type: "reconciliation",
          participants: { avenger: avenger.id, spared: slayer.id },
          // manner: the knife at the throat, and the hand that opened.
          data: { manner: "spared at the last, blade already cold on skin, for reasons the avenger never explained" },
          importance: 30,
        });
        a.ctx.services.social.adjustOpinion(world, slayer.id, avenger.id, 30);
        a.ctx.services.social.addMemory(world, slayer.id, { event: a.last()!, weight: 3, about: avenger.id, feeling: 0.6 });
        bestowEpithet(a.ctx, a.rng, a.s, avenger, "merciful", "held the debt and forgave it at knife's edge", a.last());
        a.end("ended in mercy at the very brink");
        return;
      }

      if (pick === "duel") {
        const skillA = (avenger.phenotype.aptitudes["war"] ?? 0) + avenger.personality.courage;
        const skillS = (slayer.phenotype.aptitudes["war"] ?? 0) + slayer.personality.courage;
        const avengerWins = a.rng.fork("victor").chance(0.55 + (skillA - skillS) * 0.12);
        const victor = avengerWins ? avenger : slayer;
        const fallen = avengerWins ? slayer : avenger;
        const ev = a.beat({
          type: "duel",
          participants: { challenger: avenger.id, challenged: slayer.id, victor: victor.id, slain: fallen.id },
          data: { over: "a blood-debt called in before witnesses", outcome: "death" },
          importance: 34,
        });
        a.ctx.services.people.kill(a.ctx, fallen, avengerWins ? "cut down answering for an old killing" : "died collecting a debt of blood", {
          killer: victor.id,
          event: ev.id,
        });
        if (avengerWins) {
          bestowEpithet(a.ctx, a.rng, a.s, avenger, "bloody", "collected a blood-debt in the open square", ev.id);
          a.echo("song", 2, 9, "the debt paid before witnesses");
          a.end("ended in blood, openly, and the town called it justice");
        } else {
          a.end("ended with the avenger in the same earth as the avenged");
        }
        return;
      }

      if (pick === "murder") {
        const deed = a.beat({
          type: "crime-murder",
          participants: { killer: avenger.id, victim: slayer.id },
          // method: the quiet way.
          data: { method: "waited at the ford in the dusk, and the river swore silence", vengeanceFor: slain?.id },
          importance: 40,
          secret: true,
        });
        a.ctx.services.people.kill(a.ctx, slayer, "did not come home from the ford", {
          killer: avenger.id,
          event: deed.id,
        });
        a.end("was settled in the dusk at the ford, and never proven");
        return;
      }

      // Miscarried: the wrong shape in the dark.
      const bystanders = residentsWhere(world, localIndex(world, slayer.location), slayer.location, (q) => {
        return q.id !== avenger.id && q.id !== slayer.id && isAdult(world, q) && q.sex === slayer.sex;
      });
      const wrong = bystanders.length > 0 ? a.rng.fork("wrong").pick(bystanders) : null;
      if (!wrong) {
        // Fate declines to provide a victim; the strike simply fails.
        a.beat({
          type: "stalking",
          participants: { subject: avenger.id, target: slayer.id },
          data: { watched: "the night chosen for it turned to storm, and the nerve went out with the lamps" },
          importance: 6,
          secret: true,
        });
        a.end("guttered out in bad weather and worse nerve");
        return;
      }
      const deed = a.beat({
        type: "crime-murder",
        participants: { killer: avenger.id, victim: wrong.id, intended: slayer.id },
        // method: the dark and a borrowed cloak did the choosing.
        data: { method: "a borrowed cloak, a dark lane, and the wrong man's height", vengeanceFor: slain?.id },
        importance: 42,
        secret: true,
      });
      a.ctx.services.people.kill(a.ctx, wrong, "killed in the dark in another's place", {
        killer: avenger.id,
        event: deed.id,
      });
      avenger.flags[SF.guilt] = world.now;
      a.ctx.services.social.addMemory(world, avenger.id, { event: deed.id, weight: 4, about: wrong.id, feeling: -1 });
      a.beat({
        type: "grief-kept",
        participants: { subject: avenger.id, for: wrong.id },
        data: { manner: "learned the name of the one in the borrowed cloak, and began to rot from the inside" },
        importance: 9,
        causes: [deed.id],
      });
      a.end("struck the wrong neck in the dark, and the guilt moved in for good");
    },
  },

  onCastDeath(a: Arc, role: string, person: Person): boolean {
    if (role !== "slayer") return false;
    // The debtor dies before the debt is called: a hollow quiet close.
    const avenger = a.living("avenger");
    if (!avenger) return false;
    const dev = deathEventOf(a.world, person);
    a.beat({
      type: "grief-kept",
      participants: { subject: avenger.id, for: person.id },
      data: { manner: "the debtor died owing, and the whetstone had nothing left to sharpen for" },
      importance: 7,
      causes: dev != null ? [dev] : undefined,
    });
    a.end("was cheated by an ordinary death");
    return true;
  },
};
