/**
 * PRODIGY — a gifted child (aptitude 3) and the adult who takes them in
 * hand. Stages: spark (discovery) -> tutelage (mentorship) -> bloom
 * (jealousy complication) -> zenith. Endings: an early masterwork or a
 * legendary performance, burnout, or the fever that takes bright children,
 * leaving the mentor scarred.
 */

import type { Rng } from "../core/rng";
import type { Aptitude, Ctx, Person, ProfessionKey, Storyline } from "../core/types";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  ageOf,
  beginStoryline,
  bestowEpithet,
  castable,
  deathEventOf,
  isAdult,
  livingPerson,
  localIndex,
  residentsWhere,
} from "./helpers";

const GIFT_APTS: Aptitude[] = ["craft", "music", "lore", "healing", "oratory"];

const MENTOR_TRADES: Record<string, ProfessionKey[]> = {
  craft: ["smith", "carpenter", "mason", "weaver", "potter", "artist"],
  music: ["bard"],
  lore: ["scholar", "scribe", "priest", "monastic"],
  healing: ["healer", "midwife"],
  oratory: ["priest", "judge", "courtier", "bard"],
};

const DISCOVERIES: Record<string, string> = {
  craft: "mended the miller's broken lock with a bent nail and an hour, aged nine",
  music: "picked up a dead man's fiddle at the wake and silenced the room",
  lore: "read the tax-scribe's ledger upside down and found the error he had missed",
  healing: "set a dog's leg so cleanly the healer came to watch the child work",
  oratory: "argued a grown drover to a standstill at the boundary court, to general delight",
};

const WONDERS: Record<string, string[]> = {
  craft: ["a hinge so smooth the temple bought it for the reliquary door", "a puzzle-lock no journeyman in the district could open"],
  music: ["a lament that made the old soldiers put down their cups", "a dance-tune the whole valley was humming by midsummer"],
  lore: ["recited the whole law of the ford from one hearing", "found the flaw in a charter three judges had blessed"],
  healing: ["talked a breech birth right when the midwife's hands had given up", "named the sickness in the well before anyone else sickened"],
  oratory: ["spoke at the grain-meet and grown men voted with a child", "shamed a cheating factor out of town with one speech"],
};

function giftOf(p: Person): Aptitude | null {
  for (const apt of GIFT_APTS) {
    if ((p.phenotype.aptitudes[apt] ?? 0) >= 3) return apt;
  }
  return null;
}

export const prodigyArc: ArcDef = {
  kind: "prodigy",
  essential: ["prodigy"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    const age = ageOf(world, star);
    if (age < 6 || age > 14) return 0;
    if (giftOf(star) === null) return 0;
    return 3.2; // rare gift, strong pull
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "prodigy")) return null;
    const gift = giftOf(star);
    if (gift === null || star.location == null) return null;
    const trades = MENTOR_TRADES[gift] ?? [];
    const mentors = residentsWhere(world, aids.index, star.location, (p) => {
      if (p.id === star.id || !isAdult(world, p)) return false;
      if (!trades.includes(p.status.profession)) return false;
      return ageOf(world, p) >= 25 && castable(world, p, "prodigy");
    });
    const mentor = mentors.length > 0 ? rng.fork("mentor").pick(mentors) : null;
    const cast: Record<string, number> = { prodigy: star.id };
    if (mentor) cast["mentor"] = mentor.id;
    const s = beginStoryline(ctx, {
      kind: "prodigy",
      cast,
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        gift,
        wonders: 0,
      },
      stage: mentor ? "tutelage" : "bloom",
      firstBeatIn: rng.fork("first").intIn(2, 6),
    });
    ctx.record({
      type: "gift-revealed",
      date: world.now,
      participants: mentor ? { child: star.id, witness: mentor.id } : { child: star.id },
      // gift: the aptitude; how: the moment the town noticed.
      data: { gift, how: DISCOVERIES[gift] },
      location: star.location,
      region: world.settlements.get(star.location)?.region ?? null,
      importance: 10,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    return s;
  },

  stages: {
    /** The gift is given a teacher. */
    tutelage(a: Arc): void {
      const child = a.living("prodigy");
      const mentor = a.living("mentor");
      if (!child) return;
      if (!mentor) {
        a.go("bloom", 2, 6);
        return;
      }
      a.beat({
        type: "mentorship-began",
        participants: { ward: child.id, mentor: mentor.id },
        // gift: what is being trained.
        data: { gift: a.s.data["gift"] },
        importance: 8,
      });
      a.ctx.services.social.setRelation(a.world, mentor.id, child.id, { kind: "ward", since: a.world.now, opinion: 45 });
      a.ctx.services.social.setRelation(a.world, child.id, mentor.id, { kind: "mentor", since: a.world.now, opinion: 50 });
      a.go("bloom", 6, 14);
    },

    /** Wonders, and the shadow they cast on other people's children. */
    bloom(a: Arc): void {
      const child = a.living("prodigy");
      if (!child) return;
      const world = a.world;
      const gift = a.s.data["gift"] as string;
      const wonders = a.s.data["wonders"] as number;
      const roll = a.rng.fork("outcome");
      if (wonders >= 1 && (ageOf(world, child) >= 15 || roll.fork("zenith").chance(0.3 + wonders * 0.2))) {
        a.go("zenith", 3, 10);
        return;
      }
      if (wonders >= 1 && roll.fork("jealousy").chance(0.4)) {
        // Complication: a peer, or the mentor's own child, grows bitter.
        const mentor = a.living("mentor");
        const rivals = residentsWhere(world, localIndex(world, child.location), child.location, (p) => {
          if (p.id === child.id) return false;
          const pa = ageOf(world, p);
          if (pa < 6 || pa > 18) return false;
          return mentor ? true : giftOf(p) === null;
        });
        const jealous = rivals.length > 0 ? roll.fork("who").pick(rivals) : null;
        if (jealous) {
          a.beat({
            type: "quarrel",
            participants: { a: jealous.id, b: child.id },
            // over: the light one child stands in.
            data: { over: "a broken tool, a torn page, and the word 'favorite' spat like a stone" },
            importance: 7,
          });
          a.ctx.services.social.adjustOpinion(world, jealous.id, child.id, -25);
          a.ctx.services.social.setRelation(world, jealous.id, child.id, { kind: "rival", since: world.now, opinion: -30 });
        }
        a.go("bloom", 4, 10);
        return;
      }
      a.beat({
        type: "wonder-shown",
        participants: { child: child.id },
        // feat: what the child did this time.
        data: { feat: roll.fork("feat").pick(WONDERS[gift] ?? WONDERS["craft"]), gift },
        importance: 9 + wonders * 2,
      });
      a.s.data["wonders"] = wonders + 1;
      a.go("bloom", 5, 12);
    },

    /** The gift comes due. */
    zenith(a: Arc): void {
      const child = a.living("prodigy");
      if (!child) return;
      const world = a.world;
      const gift = a.s.data["gift"] as string;
      const mentor = a.living("mentor");
      const pick = a.rng.fork("outcome").weightedPairs([
        ["glory", 1.8],
        ["burnout", 1],
        ["fever", 0.8],
      ] as const);

      if (pick === "glory") {
        const musical = gift === "music" || gift === "oratory";
        const ev = a.beat({
          type: musical ? "song-composed" : "masterwork-created",
          participants: mentor ? { creator: child.id, mentor: mentor.id } : { creator: child.id },
          data: musical
            ? // title + occasion of the legendary performance.
              { title: "the song everyone afterward claimed to have heard sung first", occasion: "the high feast" }
            : { kind: gift, title: "a journeyman piece the masters signed as one of their own" },
          importance: musical ? 25 : 30,
        });
        bestowEpithet(a.ctx, a.rng, a.s, child, gift === "music" ? "singer" : gift === "lore" ? "wise" : "golden", "outran every teacher before coming of age", ev.id);
        if (mentor) a.ctx.services.social.adjustOpinion(world, mentor.id, child.id, 20);
        a.echo("song", 3, 12, "the child who did what the grown could not");
        a.end("bloomed into a name the district will not soon forget");
        return;
      }

      if (pick === "burnout") {
        a.beat({
          type: "fortune-turn",
          participants: mentor ? { subject: child.id, mentor: mentor.id } : { subject: child.id },
          data: {
            direction: "stumble",
            matter: "one day the wonder simply declined to come out of its room, and everyone had asked too much for too long",
          },
          importance: 8,
        });
        if (mentor) {
          a.ctx.services.social.adjustOpinion(world, child.id, mentor.id, -20);
          a.ctx.services.social.addMemory(world, mentor.id, { event: a.last()!, weight: 2, about: child.id, feeling: -0.4 });
        }
        a.end("dimmed under the weight of every watching eye");
        return;
      }

      // The fever that loves bright children.
      const ill = a.beat({
        type: "illness",
        participants: { subject: child.id },
        // name: what took hold.
        data: { name: "the spotted fever", swift: true },
        importance: 8,
      });
      a.ctx.services.people.kill(a.ctx, child, "a fever took them in a week, mid-lesson, mid-sentence", {
        event: ill.id,
      });
      if (mentor) {
        a.ctx.services.social.addMemory(world, mentor.id, { event: ill.id, weight: 4, about: child.id, feeling: -1 });
        a.ctx.services.social.adjustOpinion(world, mentor.id, child.id, 10); // the dead are loved harder
      }
      a.echo("song", 2, 9, "the bright one the fever took");
      a.end("ended in a small grave and a district that talks of what might have been");
    },
  },

  onCastDeath(a: Arc, role: string, person: Person): boolean {
    if (role !== "prodigy") return false;
    const mentor = a.living("mentor");
    const dev = deathEventOf(a.world, person);
    a.beat({
      type: "tale-ended",
      participants: mentor ? { of: person.id, mourner: mentor.id } : { of: person.id },
      // of + reason: the promise buried early.
      data: { of: person.id, reason: "the gift went into the ground with its keeper" },
      importance: 6,
      causes: dev != null ? [dev] : undefined,
    });
    if (mentor) {
      a.ctx.services.social.addMemory(a.world, mentor.id, { event: a.last()!, weight: 3, about: person.id, feeling: -0.9 });
    }
    a.end("was buried with the child who carried it");
    return true;
  },
};
