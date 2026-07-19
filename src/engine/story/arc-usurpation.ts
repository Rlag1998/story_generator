/**
 * USURPATION-PLOT — a flagged claimant ("pol.claimant") gathers malcontents
 * in the dark. Stages: whispers (plot-formed, secret) -> recruitment
 * (conspirators' oaths, exposure risk) -> ripening. Endings: coup-ready
 * (sets "story.coup-ready:<polityId>" for politics to spend), exposure
 * (trial and the headsman, flags cleared), or nerve lost and the whispers
 * let die.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, PersonId, Polity, Storyline } from "../core/types";
import { revealEvent } from "../core/world";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  SF,
  addCastMember,
  beginStoryline,
  castable,
  flagNum,
  isAdult,
  livingPerson,
  localIndex,
  residentsWhere,
} from "./helpers";

function claimedPolity(ctx: Ctx, star: Person): Polity | null {
  const claim = flagNum(star, SF.claimant);
  if (claim === null) return null;
  return ctx.world.polities.get(claim) ?? null;
}

/** Clear every conspiratorial flag when a plot dies. */
function clearPlotFlags(a: Arc, polityId: number): void {
  const world = a.world;
  for (const role of Object.keys(a.s.cast)) {
    const p = world.people.get(a.s.cast[role]);
    if (!p) continue;
    delete p.flags[SF.coupReadyPrefix + polityId];
    if (role === "claimant") delete p.flags[SF.claimant];
  }
}

export const usurpationArc: ArcDef = {
  kind: "usurpation-plot",
  essential: ["claimant"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (!isAdult(world, star)) return 0;
    const polity = claimedPolity(ctx, star);
    if (!polity || polity.ruler === null || polity.ruler === star.id) return 0;
    if (star.personality.ambition < 0.6) return 0;
    return 2.2 + star.personality.ambition + (star.phenotype.aptitudes["intrigue"] ?? 0) * 0.5;
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    if (!castable(world, star, "usurpation-plot")) return null;
    const polity = claimedPolity(ctx, star);
    if (!polity || polity.ruler === null) return null;
    const ruler = livingPerson(world, polity.ruler);
    if (!ruler) return null;
    // A first confidant: someone near the capital who has little love for
    // the crown, or much love for the claimant.
    const capital = polity.capital;
    const malcontents = residentsWhere(world, aids.index, capital, (p) => {
      if (p.id === star.id || p.id === ruler.id || !isAdult(world, p)) return false;
      if (p.storylines.length >= 2) return false;
      const opinionOfRuler = ctx.services.social.getOpinion(world, p.id, ruler.id);
      const opinionOfStar = ctx.services.social.getOpinion(world, p.id, star.id);
      return opinionOfRuler <= -15 || opinionOfStar >= 25 || p.personality.ambition >= 0.7;
    });
    const near = star.location != null && star.location !== capital
      ? residentsWhere(world, aids.index, star.location, (p) => p.id !== star.id && isAdult(world, p) && p.storylines.length < 2 && ctx.services.social.getOpinion(world, p.id, star.id) >= 20)
      : [];
    const pool = malcontents.length > 0 ? malcontents : near;
    if (pool.length === 0) return null;
    const confidant = rng.fork("confidant").pick(pool);
    const s = beginStoryline(ctx, {
      kind: "usurpation-plot",
      cast: { claimant: star.id, confidant: confidant.id },
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        polity: polity.id,
        recruits: 1,
        heat: 0.08,
      },
      stage: "recruitment",
      firstBeatIn: rng.fork("first").intIn(2, 5),
    });
    ctx.record({
      type: "plot-formed",
      date: world.now,
      participants: { plotter: star.id, confidant: confidant.id },
      // polity + against: the crown measured for other shoulders.
      data: { polity: polity.id, against: ruler.id, whisper: "two cups, one candle, and a map weighted open with a knife" },
      location: star.location ?? capital,
      region: (world.settlements.get(star.location ?? capital)?.region ?? null),
      importance: 14,
      causes: [],
      storyline: s.id,
      secret: true,
    });
    return s;
  },

  stages: {
    /** More hands are sworn in; each oath is another mouth. */
    recruitment(a: Arc): void {
      const claimant = a.living("claimant");
      const world = a.world;
      const polity = world.polities.get(a.s.data["polity"] as number);
      if (!claimant || !polity) return;
      // The throne changed hands (or emptied) under them: the plot is moot.
      if (polity.ruler === null || polity.ruler === claimant.id) {
        a.beat({
          type: "rumor",
          participants: { keeper: claimant.id },
          data: { of: claimant.id, word: "the knives were oiled for a door that opened by itself" },
          importance: 5,
          secret: true,
        });
        clearPlotFlags(a, polity.id);
        if (polity.ruler === claimant.id) claimant.flags[SF.claimant] = polity.id;
        a.end("was overtaken by events; the plot died unneeded");
        return;
      }
      const heat = a.s.data["heat"] as number;
      const recruits = a.s.data["recruits"] as number;
      const roll = a.rng.fork("outcome");
      if (roll.fork("exposed").chance(heat)) {
        a.go("exposure", 1, 1);
        return;
      }
      if (recruits >= 2 || (recruits >= 1 && roll.fork("ripe").chance(0.45))) {
        a.go("ripening", 1, 3);
        return;
      }
      // One more sworn blade.
      const pool = residentsWhere(world, localIndex(world, polity.capital), polity.capital, (p) => {
        if (p.id === claimant.id || p.id === polity.ruler) return false;
        if (Object.values(a.s.cast).includes(p.id)) return false;
        return isAdult(world, p) && (p.personality.honor < 0.2 || a.ctx.services.social.getOpinion(world, p.id, claimant.id) >= 15);
      });
      if (pool.length > 0) {
        const sworn = roll.fork("who").pick(pool);
        addCastMember(world, a.s, `sworn-${recruits + 1}`, sworn);
        a.beat({
          type: "oath-sworn",
          participants: { plotter: claimant.id, sworn: sworn.id },
          // oath: conspiracy, sworn in the dark.
          data: { oath: "swore on iron, in a cellar, to a name that was not yet a crown" },
          importance: 8,
          secret: true,
        });
        a.s.data["recruits"] = recruits + 1;
        a.s.data["heat"] = Math.min(0.5, heat + 0.09);
      } else {
        a.s.data["heat"] = Math.min(0.5, heat + 0.05);
      }
      a.go("recruitment", 2, 6);
    },

    /** A mouth has opened somewhere: the plot is dragged into the light. */
    exposure(a: Arc): void {
      const world = a.world;
      const claimant = a.living("claimant");
      const polity = world.polities.get(a.s.data["polity"] as number);
      if (!claimant || !polity) return;
      const ruler = livingPerson(world, polity.ruler);
      // Reveal the conspiracy's paper trail.
      for (const eid of a.s.events) {
        const ev = world.events.get(eid);
        if (ev && ev.secret && (ev.type === "plot-formed" || ev.type === "oath-sworn")) {
          revealEvent(world, eid, world.now);
        }
      }
      a.beat({
        type: "plot-exposed",
        participants: ruler ? { plotter: claimant.id, ruler: ruler.id } : { plotter: claimant.id },
        // polity + how the whisper got out.
        data: { polity: polity.id, how: "a sworn man drank the wrong amount and toasted the wrong name" },
        at: polity.capital,
        importance: 25,
      });
      clearPlotFlags(a, polity.id);
      const trial = a.beat({
        type: "trial",
        participants: ruler ? { accused: claimant.id, judge: ruler.id } : { accused: claimant.id },
        // charge: treason.
        data: { charge: "treason against the crown", verdict: "guilty" },
        at: polity.capital,
        importance: 20,
      });
      const mercy = a.rng.fork("mercy").chance(0.3 + (ruler?.personality.compassion ?? 0) * 0.4);
      if (mercy) {
        claimant.flags[SF.disgraced] = world.now;
        a.beat({
          type: "exile",
          participants: { subject: claimant.id },
          data: { reason: "spared the axe and shown the border", from: claimant.location },
          at: polity.capital,
          importance: 16,
          causes: [trial.id],
        });
        claimant.flags[SF.emigrated] = true;
        claimant.location = null;
        world.alive.delete(claimant.id);
        a.end("was exposed; the claimant kept their head and lost everything else");
      } else {
        const block = a.beat({
          type: "execution",
          participants: ruler ? { condemned: claimant.id, orderedBy: ruler.id } : { condemned: claimant.id },
          // manner: the scaffold in the capital square.
          data: { manner: "beheaded before the hall they had meant to sleep in" },
          at: polity.capital,
          importance: 35,
          causes: [trial.id],
        });
        a.ctx.services.people.kill(a.ctx, claimant, "went to the block for treason", {
          killer: ruler?.id,
          event: block.id,
        });
        a.end("was exposed and paid for on the scaffold");
      }
    },

    /** The hour is chosen. */
    ripening(a: Arc): void {
      const world = a.world;
      const claimant = a.living("claimant");
      const polity = world.polities.get(a.s.data["polity"] as number);
      if (!claimant || !polity) return;
      if (polity.ruler === null || polity.ruler === claimant.id) {
        clearPlotFlags(a, polity.id);
        if (polity.ruler === claimant.id) claimant.flags[SF.claimant] = polity.id;
        a.end("was overtaken by events; the plot died unneeded");
        return;
      }
      const pick = a.rng.fork("outcome").weightedPairs([
        ["ready", 1.6 + claimant.personality.ambition],
        ["exposed", 0.6],
        ["abandoned", 0.8 + Math.max(0, claimant.personality.honor)],
      ] as const);
      if (pick === "exposed") {
        a.go("exposure", 1, 1);
        return;
      }
      if (pick === "abandoned") {
        a.beat({
          type: "rumor",
          participants: { keeper: claimant.id },
          // The plot let quietly die.
          data: { of: claimant.id, word: "the cellar meetings simply stopped; the map was folded away" },
          importance: 5,
          secret: true,
        });
        clearPlotFlags(a, polity.id);
        a.end("was folded away unspent; some knives are wiser sheathed");
        return;
      }
      // Coup-ready: hand the ripened plot to politics.
      claimant.flags[SF.coupReadyPrefix + polity.id] = true;
      claimant.flags[SF.claimant] = polity.id; // politics clears it on the deed
      a.beat({
        type: "plot-ripened",
        participants: { plotter: claimant.id },
        // polity: the crown now within reach; politics executes the deed.
        data: { polity: polity.id, word: "the hour was chosen, and every sworn hand knew its door" },
        importance: 10,
        secret: true,
      });
      a.end("ripened in the dark; what followed belongs to the chronicle of crowns");
    },
  },

  onCastDeath(a: Arc, role: string, person: Person): boolean {
    if (role !== "claimant") return false;
    const polity = a.world.polities.get(a.s.data["polity"] as number);
    if (polity) clearPlotFlags(a, polity.id);
    void person;
    return false; // generic quiet close records the fade
  },
};
