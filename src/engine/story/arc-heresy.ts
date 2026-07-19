/**
 * HERESY — a visionary (the Sight, or a burning piety) begins to preach
 * against the temple. Stages: vision -> preaching (a following grows) ->
 * tension (the clergy answer). Endings: schism (a new faith via
 * services.religion.schism, imp 70, sympathizers converted), recantation,
 * or martyrdom with the occasional posthumous miracle.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, PersonId, Storyline } from "../core/types";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  addCastMember,
  beginStoryline,
  bestowEpithet,
  castable,
  isAdult,
  livingPerson,
  localIndex,
  residentsWhere,
} from "./helpers";

const VISIONS = [
  "stood three days at the spring and came back speaking of a light under the water",
  "woke from fever with the same dream four nights running, each time further in",
  "heard, in the empty shrine at noon, a voice using their childhood name",
];

const SERMONS = [
  "preached barefoot on the temple steps that the god has no need of roofs",
  "taught in the sheep-meadow that the dead are near, not distant, and want speaking to",
  "said aloud what many whispered: that the offerings feed the clergy and not the god",
];

function hasSight(p: Person): boolean {
  return p.phenotype.rareTraits.includes("the-sight");
}

/** The nearest voice of the established faith. */
function findCleric(ctx: Ctx, near: Person): Person | null {
  const world = ctx.world;
  const local = residentsWhere(world, localIndex(world, near.location), near.location, (p) => {
    return p.id !== near.id && (p.status.profession === "priest" || p.status.profession === "monastic") && isAdult(world, p);
  });
  if (local.length > 0) return local[0];
  // Any priest of the same faith, lowest id: the faith always has ears.
  for (const id of [...world.alive].sort((a, b) => a - b)) {
    const p = world.people.get(id);
    if (p && p.id !== near.id && p.status.profession === "priest" && p.religion === near.religion) return p;
  }
  return null;
}

export const heresyArc: ArcDef = {
  kind: "heresy",
  essential: ["visionary"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star)) return 0;
    if (hasSight(star)) return 3;
    if (star.personality.piety >= 0.75 && star.personality.openness > 0.2) return 0.6;
    return 0;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, _aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "heresy")) return null;
    if (!world.religions.has(star.religion)) return null;
    const cleric = findCleric(ctx, star);
    const cast: Record<string, number> = { visionary: star.id };
    if (cleric) cast["cleric"] = cleric.id;
    const s = beginStoryline(ctx, {
      kind: "heresy",
      cast,
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        religion: star.religion,
        followers: [] as PersonId[],
        sermons: 0,
      },
      stage: "preaching",
      firstBeatIn: rng.fork("first").intIn(2, 5),
    });
    ctx.record({
      type: "vision",
      date: world.now,
      participants: { subject: star.id },
      // what: the vision; sight: whether the Sight is in them.
      data: { what: rng.fork("vision").pick(VISIONS), sight: hasSight(star) },
      location: star.location,
      region: star.location != null ? (world.settlements.get(star.location)?.region ?? null) : null,
      importance: 12,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    return s;
  },

  stages: {
    /** The word spreads; so do the frowns. */
    preaching(a: Arc): void {
      const visionary = a.living("visionary");
      if (!visionary) return;
      const world = a.world;
      const sermons = a.s.data["sermons"] as number;
      const followers = a.s.data["followers"] as PersonId[];
      const roll = a.rng.fork("outcome");
      if (sermons >= 2) {
        a.go("tension", 2, 6);
        return;
      }
      a.beat({
        type: "heresy-preached",
        participants: { preacher: visionary.id },
        // sermon: what was said; against: the faith it grates on.
        data: { sermon: roll.fork("sermon").pick(SERMONS), against: a.s.data["religion"] },
        importance: 14,
      });
      // A deterministic sample of listeners becomes sympathizers.
      const drawn = residentsWhere(world, localIndex(world, visionary.location), visionary.location, (p) => {
        if (p.id === visionary.id || followers.includes(p.id)) return false;
        if (!isAdult(world, p) || p.religion !== visionary.religion) return false;
        return p.personality.openness > 0 || p.personality.piety >= 0.55;
      });
      const take = Math.min(drawn.length, roll.fork("take").intIn(1, 3));
      for (let i = 0; i < take; i++) {
        // Sorted pool + rng pick keyed off the sermon: stable and seeded.
        const idx = roll.fork("follower", sermons, i).int(drawn.length);
        const f = drawn[idx];
        if (!followers.includes(f.id)) {
          followers.push(f.id);
          a.ctx.services.social.adjustOpinion(world, f.id, visionary.id, 20);
        }
      }
      a.s.data["sermons"] = sermons + 1;
      a.go("preaching", 3, 8);
    },

    /** The temple notices. */
    tension(a: Arc): void {
      const visionary = a.living("visionary");
      if (!visionary) return;
      const world = a.world;
      const cleric = a.living("cleric") ?? findCleric(a.ctx, visionary);
      if (cleric && !("cleric" in a.s.cast)) addCastMember(world, a.s, "cleric", cleric);
      const religion = world.religions.get(a.s.data["religion"] as number);
      const zeal = religion?.zeal ?? 0.5;
      const followers = a.s.data["followers"] as PersonId[];
      const trial = a.beat({
        type: "trial",
        participants: cleric ? { accused: visionary.id, judge: cleric.id } : { accused: visionary.id },
        // charge: heresy; the temple's patience formally ends.
        data: { charge: "preaching against the faith", followers: followers.length },
        importance: 18,
      });
      const pick = a.rng.fork("outcome").weightedPairs([
        ["schism", 0.8 + followers.length * 0.35 + Math.max(0, visionary.personality.courage)],
        ["recant", 0.9 + Math.max(0, -visionary.personality.courage) + (1 - zeal) * 0.5],
        ["martyr", 0.4 + zeal * 1.4],
      ] as const);

      if (pick === "recant") {
        a.beat({
          type: "recanted",
          participants: cleric ? { subject: visionary.id, before: cleric.id } : { subject: visionary.id },
          // manner: the words taken back at the rail.
          data: { manner: "knelt at the rail and unsaid it all, in a voice no one quite believed" },
          importance: 12,
          causes: [trial.id],
        });
        for (const fid of [...followers].sort((x, y) => x - y)) {
          const f = livingPerson(world, fid);
          if (f) a.ctx.services.social.adjustOpinion(world, f.id, visionary.id, -25);
        }
        a.end("ended at the rail, recanted and privately unrepented");
        return;
      }

      if (pick === "martyr") {
        const pyre = a.beat({
          type: "execution",
          participants: cleric ? { condemned: visionary.id, orderedBy: cleric.id } : { condemned: visionary.id },
          // manner: the faith makes its point.
          data: { manner: "given to the fire before the temple doors, still preaching through the smoke" },
          importance: 40,
          causes: [trial.id],
        });
        bestowEpithet(a.ctx, a.rng, a.s, visionary, "martyr", "burned rather than unsay the vision", pyre.id);
        a.ctx.services.people.kill(a.ctx, visionary, "burned for heresy", {
          killer: cleric?.id,
          event: pyre.id,
        });
        for (const fid of [...followers].sort((x, y) => x - y)) {
          const f = livingPerson(world, fid);
          if (f) a.ctx.services.social.addMemory(world, f.id, { event: pyre.id, weight: 3, about: visionary.id, feeling: -0.8 });
        }
        a.echo("miracle", 1, 6, "the fire that would not take the heart");
        a.echo("song", 4, 12, "the one who preached through the smoke");
        a.end("ended at the stake, and did not end there");
        return;
      }

      // Schism: a new faith is born.
      const parent = religion;
      if (!parent) {
        a.end("dissolved when the old faith itself was no longer to be found");
        return;
      }
      const newFaith = a.ctx.services.religion.schism(a.rng.fork("schism"), world, parent, visionary);
      const schismEv = a.beat({
        type: "schism",
        participants: cleric ? { founder: visionary.id, opposed: cleric.id } : { founder: visionary.id },
        // Canonical-ish payload: old and new faith ids and the following.
        data: { parent: parent.id, religion: newFaith.id, name: newFaith.name, followers: followers.length },
        importance: 70,
        causes: [trial.id],
      });
      visionary.religion = newFaith.id;
      // A deterministic sample of sympathizers converts outright.
      const sorted = [...followers].sort((x, y) => x - y);
      for (const fid of sorted) {
        const f = livingPerson(world, fid);
        if (!f) continue;
        if (a.rng.fork("convert", fid).chance(0.75)) {
          f.religion = newFaith.id;
          a.ctx.record({
            type: "conversion",
            date: world.now,
            participants: { convert: f.id, to: visionary.id },
            // from/to: the faiths.
            data: { from: parent.id, religion: newFaith.id },
            location: f.location,
            region: f.location != null ? (world.settlements.get(f.location)?.region ?? null) : null,
            importance: 5,
            causes: [schismEv.id],
            storyline: a.s.id,
            secret: false,
          });
        }
      }
      bestowEpithet(a.ctx, a.rng, a.s, visionary, "prophet", `founded ${newFaith.name}`, schismEv.id);
      a.echo("song", 3, 10, `the founding of ${newFaith.name}`);
      a.end(`ended in schism: ${newFaith.name} was born`);
    },
  },
};
