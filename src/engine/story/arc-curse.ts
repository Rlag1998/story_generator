/**
 * CURSE — after a wrong, the wronged pronounces a curse on a family; the
 * arc then WATCHES that family's real misfortunes and records the folk
 * attribution, cause-linking chronicle to curse. Stages: watching ->
 * endings: lifted by amends, spent when the line ends, or simply
 * forgotten. The curse never pushes fate; it only keeps the books.
 */

import type { Rng } from "../core/rng";
import type { Ctx, EventRecord, Person, PersonId, Storyline } from "../core/types";
import { eventsBetween } from "../core/world";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  beginStoryline,
  castable,
  closeKinIds,
  cultureOf,
  isAdult,
  livingPerson,
} from "./helpers";

const CURSES = [
  "may your roof know smoke and your byre know sickness until amends are made",
  "let no luck cross that threshold while the wrong stands unpaid",
  "the debt will be collected from the blood, coin by coin, year by year",
];

const MISFORTUNE_TYPES = new Set([
  "death",
  "illness",
  "injury",
  "pregnancy-loss",
  "fire",
  "beast-attack",
  "crime-theft",
  "work-ruined",
]);

/** The still-living target family: target plus close kin, ascending. */
function familyOf(world: Ctx["world"], targetId: PersonId): PersonId[] {
  const target = world.people.get(targetId);
  if (!target) return [];
  const out = new Set<PersonId>([targetId]);
  for (const kid of closeKinIds(world, target)) out.add(kid);
  return [...out].sort((a, b) => a - b);
}

/** A misfortune striking the family since the last look, oldest first. */
function findMisfortune(
  world: Ctx["world"],
  family: PersonId[],
  since: number,
  attributed: number[],
): EventRecord | null {
  const fam = new Set(family);
  for (const ev of eventsBetween(world, since, world.now)) {
    if (!MISFORTUNE_TYPES.has(ev.type)) continue;
    if (ev.secret || attributed.includes(ev.id)) continue;
    for (const role of Object.keys(ev.participants)) {
      if (fam.has(ev.participants[role])) return ev;
    }
  }
  return null;
}

export const curseArc: ArcDef = {
  kind: "curse",
  essential: [],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star)) return 0;
    const mysticism = cultureOf(world, star)?.attitudes.mysticism ?? 0.5;
    // A grievance hot enough to curse over: a strong bitter memory.
    const memories = world.memories.get(star.id) ?? [];
    const wronged = memories.some((m) => m.feeling <= -0.65);
    if (!wronged) return 0;
    return (0.4 + Math.max(0, star.personality.volatility) * 0.5 + star.personality.piety * 0.4) * (0.4 + mysticism);
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, _aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "curse")) return null;
    // Find the offender: the living person the star's bitterest memory
    // points at (a participant in the memory's event who is not the star).
    const memories = (world.memories.get(star.id) ?? [])
      .filter((m) => m.feeling <= -0.6)
      .sort((x, y) => x.feeling - y.feeling || x.event - y.event);
    let target: Person | null = null;
    let wrongEvent: number | null = null;
    for (const m of memories) {
      const cause = world.events.get(m.event);
      if (!cause) continue;
      for (const role of Object.keys(cause.participants).sort()) {
        const pid = cause.participants[role];
        if (pid === star.id || pid === m.about) continue;
        const other = livingPerson(world, pid);
        if (other && other.id !== star.id) {
          target = other;
          wrongEvent = cause.id;
          break;
        }
      }
      if (target) break;
    }
    if (!target) return null;
    // One does not curse one's own hearth: same (real) house or close kin.
    if (target.house !== null && target.house === star.house) return null;
    if (closeKinIds(world, star).includes(target.id)) return null;
    const s = beginStoryline(ctx, {
      kind: "curse",
      cast: { wronged: star.id, target: target.id },
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        attributed: [] as number[],
        looks: 0,
        lastLook: world.now,
      },
      stage: "watching",
      firstBeatIn: rng.fork("first").intIn(6, 12),
    });
    const words = rng.fork("words").pick(CURSES);
    ctx.record({
      type: "curse-pronounced",
      date: world.now,
      participants: { curser: star.id, target: target.id },
      // words: the curse itself; wrong: the event it answers.
      data: { words, wrong: wrongEvent },
      location: star.location,
      region: star.location != null ? (world.settlements.get(star.location)?.region ?? null) : null,
      importance: 15,
      causes: wrongEvent != null ? [wrongEvent] : [],
      storyline: s.id,
      secret: false,
    });
    target.flags["story.cursed"] = s.id;
    ctx.services.social.adjustOpinion(world, target.id, star.id, -20);
    return s;
  },

  stages: {
    /** The village keeps the ledger of the family's bad years. */
    watching(a: Arc): void {
      const world = a.world;
      const wronged = a.cast("wronged");
      const target = a.cast("target");
      if (!target) return;
      const looks = a.s.data["looks"] as number;
      const attributed = a.s.data["attributed"] as number[];
      const family = familyOf(world, target.id);
      const living = family.filter((id) => livingPerson(world, id) !== null);

      // The line has ended: the curse is spent.
      if (living.length === 0) {
        a.beat({
          type: "omen",
          participants: wronged && wronged.died === null ? { keeper: wronged.id } : {},
          data: {
            sign: "the last hearth of that blood gone cold",
            interpretation: "the old folk nodded and said the curse was spent at last",
          },
          importance: 12,
        });
        a.end("was spent: the line it named has ended");
        return;
      }

      // Amends: if the target has come to think well of the wronged, or the
      // wronged has softened, gifts pass and the words are taken back.
      if (wronged && wronged.died === null && target.died === null) {
        const opinion = a.ctx.services.social.getOpinion(world, target.id, wronged.id);
        if (opinion > 5 || a.rng.fork("amends").chance(0.08 + target.personality.compassion * 0.1)) {
          a.beat({
            type: "gift",
            participants: { giver: target.id, to: wronged.id },
            // what: the amends that unmake a curse.
            data: { what: "a heifer, a bolt of good cloth, and the wrong named aloud at the giving" },
            importance: 8,
          });
          a.beat({
            type: "reconciliation",
            participants: { a: wronged.id, b: target.id },
            data: { manner: "the words were taken back at the same threshold where they were thrown" },
            importance: 10,
          });
          delete target.flags["story.cursed"];
          a.ctx.services.social.adjustOpinion(world, wronged.id, target.id, 30);
          a.ctx.services.social.adjustOpinion(world, target.id, wronged.id, 20);
          a.end("was lifted with amends at the threshold");
          return;
        }
      }

      // Watch the family's real events for something to blame on the words.
      const misfortune = findMisfortune(world, family, a.s.data["lastLook"] as number, attributed);
      a.s.data["lastLook"] = world.now;
      if (misfortune) {
        attributed.push(misfortune.id);
        const struck = Object.keys(misfortune.participants)
          .map((r) => misfortune.participants[r])
          .find((pid) => family.includes(pid));
        a.beat({
          type: "omen",
          participants: struck != null ? { struck } : {},
          // sign: the misfortune; interpretation: the folk attribution.
          data: {
            sign: `misfortune on that family again: ${misfortune.type}`,
            interpretation: "no one said the word aloud at the burying, and everyone thought it",
          },
          importance: 6 + Math.min(3, attributed.length),
          causes: [misfortune.id, a.s.events[0] ?? misfortune.id],
        });
      }

      // Long quiet: the curse fades from talk.
      if (looks >= 3 && !misfortune) {
        a.beat({
          type: "omen",
          participants: {},
          data: {
            sign: "good harvests, quiet winters, and the family thriving",
            interpretation: "the curse slipped out of the village's stories, as spent words do",
          },
          importance: 4,
        });
        if (target.died === null) delete target.flags["story.cursed"];
        a.end("was talked of less each year, and then not at all");
        return;
      }
      a.s.data["looks"] = looks + 1;
      a.go("watching", 8, 16);
    },
  },
};
