/**
 * MASTERWORK — an aging artisan or bard sets out to make the one thing
 * they will be remembered by. Stages: resolve -> labor (family strain) ->
 * maybe setback (ruined work) -> completion. Endings: the masterwork
 * (named in their own tongue, "story.masterwork-done" set for politics to
 * honor), or death before completion, with an apprentice sometimes
 * inheriting the ambition in a linked arc.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, ProfessionKey, Storyline } from "../core/types";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  SF,
  activeSpouseId,
  ageOf,
  beginStoryline,
  bestowEpithet,
  castable,
  deathEventOf,
  isAdult,
  langOf,
  livingPerson,
  localIndex,
  residentsWhere,
} from "./helpers";

interface WorkShape {
  kind: string;
  /** Display pattern; <Word> is filled from the artisan's tongue. */
  pattern: string;
  concept: string;
  epithetTheme: string;
}

const WORK_SHAPES: Partial<Record<ProfessionKey, WorkShape[]>> = {
  smith: [
    { kind: "blade", pattern: "the <Word> Blade", concept: "fire", epithetTheme: "hammer" },
    { kind: "bell", pattern: "the <Word> Bell", concept: "voice", epithetTheme: "iron" },
  ],
  carpenter: [
    { kind: "roof", pattern: "the <Word> Hall roof", concept: "oak", epithetTheme: "builder" },
    { kind: "ship", pattern: "the <Word>, a ship without sister", concept: "wave", epithetTheme: "sea" },
  ],
  mason: [
    { kind: "bridge", pattern: "the <Word> Bridge", concept: "stone", epithetTheme: "builder" },
    { kind: "gate", pattern: "the <Word> Gate", concept: "mountain", epithetTheme: "builder" },
  ],
  weaver: [{ kind: "tapestry", pattern: "the <Word> Hanging", concept: "thread", epithetTheme: "silver" }],
  potter: [{ kind: "vessel", pattern: "the <Word> Cup", concept: "earth", epithetTheme: "golden" }],
  brewer: [{ kind: "brew", pattern: "the <Word> Cask", concept: "harvest", epithetTheme: "harvest" }],
  bard: [{ kind: "saga", pattern: "the <Word> Saga", concept: "memory", epithetTheme: "singer" }],
  artist: [{ kind: "fresco", pattern: "the <Word> Wall", concept: "light", epithetTheme: "golden" }],
  scribe: [{ kind: "chronicle", pattern: "the <Word> Book", concept: "truth", epithetTheme: "scholar" }],
};

const RUIN_WAYS = [
  "the casting cracked in the cooling and a year's labor rang dead",
  "a lamp overturned, and the work fed the fire that found it",
  "the flood took the workshop and gave back nothing worth keeping",
  "a careless hand, a broken scaffold, months undone in a heartbeat",
];

function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function nameWork(ctx: Ctx, rng: Rng, artisan: Person, shape: WorkShape): string {
  const lang = langOf(ctx.world, artisan);
  const word = lang ? cap(ctx.services.language.word(rng.fork("word"), lang, shape.concept)) : "Nameless";
  return shape.pattern.replace("<Word>", word);
}

export const masterworkArc: ArcDef = {
  kind: "masterwork",
  essential: [],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star)) return 0;
    const age = ageOf(world, star);
    if (age < 38 || age > 66) return 0;
    if (!WORK_SHAPES[star.status.profession]) return 0;
    const apt = Math.max(star.phenotype.aptitudes["craft"] ?? 0, star.phenotype.aptitudes["music"] ?? 0);
    return 0.9 + apt * 0.6 + Math.max(0, star.personality.diligence) * 0.6;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, _aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    const shapes = WORK_SHAPES[star.status.profession];
    if (!shapes || !castable(world, star, "masterwork")) return null;
    const shape = rng.fork("shape").pick(shapes);
    const title = nameWork(ctx, rng.fork("name"), star, shape);
    const s = beginStoryline(ctx, {
      kind: "masterwork",
      cast: { artisan: star.id },
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        workKind: shape.kind,
        title,
        epithetTheme: shape.epithetTheme,
        labors: 0,
        ruined: 0,
      },
      stage: "labor",
      firstBeatIn: rng.fork("first").intIn(4, 9),
    });
    ctx.record({
      type: "great-work-begun",
      date: world.now,
      participants: { artisan: star.id },
      // work: what is attempted; title: the name it will bear if finished.
      data: { work: shape.kind, title },
      location: star.location,
      region: star.location != null ? (world.settlements.get(star.location)?.region ?? null) : null,
      importance: 8,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    return s;
  },

  stages: {
    /** Obsessive months; the household pays the toll. */
    labor(a: Arc): void {
      const artisan = a.living("artisan");
      if (!artisan) return;
      const labors = a.s.data["labors"] as number;
      const roll = a.rng.fork("outcome");
      if (labors >= 2 && roll.fork("done").chance(0.35 + labors * 0.18)) {
        a.go("completion", 1, 4);
        return;
      }
      if (labors >= 1 && roll.fork("ruin").chance(0.22)) {
        a.go("setback", 1, 2);
        return;
      }
      const spouseId = activeSpouseId(artisan);
      const spouse = livingPerson(a.world, spouseId);
      if (spouse && roll.fork("strain").chance(0.5)) {
        a.beat({
          type: "quarrel",
          participants: { a: artisan.id, b: spouse.id },
          // over: the cost of obsession.
          data: { over: "cold suppers, spent silver, and a door shut on the family for the work's sake" },
          importance: 6,
        });
        a.ctx.services.social.adjustOpinion(a.world, spouse.id, artisan.id, -8);
      } else {
        a.beat({
          type: "fortune-turn",
          participants: { subject: artisan.id },
          // direction + matter: quiet progress on the great work.
          data: { direction: "rise", matter: `the ${a.s.data["workKind"]} grows under stubborn hands` },
          importance: 4,
        });
      }
      a.s.data["labors"] = labors + 1;
      a.go("labor", 5, 11);
    },

    /** Ruin: the work is lost, and the artisan chooses. */
    setback(a: Arc): void {
      const artisan = a.living("artisan");
      if (!artisan) return;
      a.beat({
        type: "work-ruined",
        participants: { artisan: artisan.id },
        // work + how: what was lost and the way of it.
        data: { work: a.s.data["workKind"], how: a.rng.fork("how").pick(RUIN_WAYS) },
        importance: 11,
      });
      a.s.data["ruined"] = (a.s.data["ruined"] as number) + 1;
      const grit = Math.max(0, artisan.personality.diligence) + Math.max(0, -artisan.personality.volatility) * 0.5;
      if (a.rng.fork("persist").chance(0.55 + grit * 0.3)) {
        a.go("labor", 3, 8);
      } else {
        // The heart goes out of it; a quiet fizzle beat closes the tale.
        a.beat({
          type: "fortune-turn",
          participants: { subject: artisan.id },
          data: { direction: "stumble", matter: "the tools were hung up and not taken down again" },
          importance: 6,
        });
        a.end("was abandoned after the ruin of the work");
      }
    },

    /** The unveiling. */
    completion(a: Arc): void {
      const artisan = a.living("artisan");
      if (!artisan) return;
      const world = a.world;
      const title = a.s.data["title"] as string;
      const ev = a.beat({
        type: "masterwork-created",
        participants: { creator: artisan.id },
        // Canonical payload: kind + title.
        data: { kind: a.s.data["workKind"], title },
        importance: 35,
      });
      // Store the event id so the eventual title grant can cite it as cause.
      artisan.flags[SF.masterworkDone] = ev.id;
      artisan.status.wealth = Math.min(5, artisan.status.wealth + 1);
      bestowEpithet(
        a.ctx,
        a.rng,
        a.s,
        artisan,
        a.s.data["epithetTheme"] as string,
        `made ${title}`,
        ev.id,
      );
      a.echo("song", 3, 12, `${title}, and the hands that made it`);
      a.end(`finished ${title} after ${Math.max(1, Math.round((world.now - a.s.started) / 12))} years of labor`);
    },
  },

  /** Death at the bench: the ambition may pass to an apprentice. */
  onCastDeath(a: Arc, _role: string, person: Person): boolean {
    const world = a.world;
    const deathEv = deathEventOf(world, person);
    const title = a.s.data["title"] as string;
    a.beat({
      type: "tale-ended",
      participants: { artisan: person.id },
      // of + reason: the unfinished work standing in a dead man's shop.
      data: { of: person.id, reason: `${title} stood unfinished when death called the maker` },
      importance: 8,
      causes: deathEv != null ? [deathEv] : undefined,
    });
    a.end(`ended at the bench, ${title} unfinished`);
    // An apprentice may take up the tools: a linked arc, cause-chained.
    const heirs = residentsWhere(
      world,
      // Small local scan: same settlement, same trade, younger.
      localIndex(world, person.location),
      person.location,
      (p) =>
        p.id !== person.id &&
        p.status.profession === person.status.profession &&
        isAdult(world, p) &&
        ageOf(world, p) < ageOf(world, person) - 8 &&
        castable(world, p, "masterwork"),
    );
    if (heirs.length > 0 && a.rng.fork("inherit").chance(0.55)) {
      const heir = a.rng.fork("heir").pick(heirs);
      const s2 = beginStoryline(a.ctx, {
        kind: "masterwork",
        cast: { artisan: heir.id },
        data: {
          star: heir.id,
          starRank: heir.status.rank,
          home: heir.location,
          workKind: a.s.data["workKind"],
          title,
          epithetTheme: a.s.data["epithetTheme"],
          labors: 0,
          ruined: 0,
          inheritedFrom: a.s.id,
        },
        stage: "labor",
        firstBeatIn: a.rng.fork("first2").intIn(4, 10),
      });
      a.ctx.record({
        type: "oath-sworn",
        date: world.now,
        participants: { heir: heir.id, master: person.id },
        // oath: the apprentice vows to finish the master's work.
        data: { oath: `swore over the cold tools to finish ${title}` },
        location: heir.location,
        region: heir.location != null ? (world.settlements.get(heir.location)?.region ?? null) : null,
        importance: 10,
        causes: deathEv != null ? [deathEv] : [],
        storyline: s2.id,
        secret: false,
      });
    }
    return true;
  },
};
