/**
 * Plots and empty thrones. Ambitious kin near the line of succession are
 * marked as claimants for the story module to corrupt. When a storyline
 * ripens someone to "story.coup-ready:<polityId>", this file spends it:
 * poison in the cup or spears in the hall, reigns closed and opened, and
 * the chronicle told why. Open succession crises also settle here, once
 * the realm has stewed long enough.
 */

import type { Ctx, Person, PersonId, Polity } from "../core/types";
import type { Rng } from "../core/rng";
import { livingIds } from "../core/world";
import {
  PF,
  housesOfPolity,
  isAdult,
  languageOfCulture,
  livingPerson,
  polState,
  politiesSorted,
  regionOfSettlement,
  rulerTitle,
} from "./helpers";
import { successionLine } from "./succession";
import { crownRuler } from "./crown";

export function plotsTick(ctx: Ctx, rng: Rng): void {
  markClaimants(ctx, rng.fork("claimants"));
  executeCoups(ctx, rng.fork("coups"));
  resolveCrises(ctx, rng.fork("crises"));
}

// ---------------------------------------------------------------------------
// Claimants: hungry blood near the throne
// ---------------------------------------------------------------------------

function markClaimants(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  for (const polity of politiesSorted(world)) {
    if (polity.ruler === null) continue; // crises mint their own claimants
    if (!rng.fork("gate", polity.id).chance(0.05)) continue;
    const line = successionLine(world, polity, 5);
    // Positions two through four: close enough to taste it, far enough to
    // need a knife.
    for (const id of line.slice(1, 4)) {
      const p = livingPerson(world, id);
      if (!p || !isAdult(world, p)) continue;
      if (p.flags[PF.claimant] !== undefined) continue;
      if (p.personality.ambition < 0.65) continue;
      if (rng.fork("mark", id).chance(0.35)) {
        p.flags[PF.claimant] = polity.id;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Coups and assassinations (spending story.coup-ready flags)
// ---------------------------------------------------------------------------

function executeCoups(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  // Gather plotters first; execution mutates the living set.
  const plots: { plotter: PersonId; polity: number; flag: string }[] = [];
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (!p) continue;
    const keys = Object.keys(p.flags)
      .filter((k) => k.startsWith(PF.coupReadyPrefix))
      .sort();
    for (const key of keys) {
      const polityId = Number(key.slice(PF.coupReadyPrefix.length));
      if (Number.isFinite(polityId)) plots.push({ plotter: id, polity: polityId, flag: key });
    }
  }
  for (const plot of plots) {
    const plotter = livingPerson(world, plot.plotter);
    if (!plotter) continue;
    delete plotter.flags[plot.flag]; // spent, whatever happens
    const polity = world.polities.get(plot.polity);
    if (!polity) continue;
    const ruler = livingPerson(world, polity.ruler);
    if (!ruler || ruler.id === plotter.id) continue;
    const pRng = rng.fork("plot", plotter.id, polity.id);
    const knives = (plotter.phenotype.aptitudes["intrigue"] ?? 0) >= 1 || pRng.fork("method").chance(0.5);
    if (knives) {
      assassinate(ctx, pRng.fork("kill"), polity, plotter, ruler);
    } else {
      stageCoup(ctx, pRng.fork("coup"), polity, plotter, ruler);
    }
  }
}

function assassinate(ctx: Ctx, rng: Rng, polity: Polity, plotter: Person, ruler: Person): void {
  const world = ctx.world;
  const method = rng.fork("method").pick([
    "a slow poison in the evening cup",
    "a bowstring in the dark of the wardrobe stair",
    "a thin blade between the fourth and fifth ribs",
  ]);
  // The deed is secret; the death it causes is not. The social module may
  // drag it into daylight later.
  // assassination data: { polity: PolityId, method: string }
  const deed = ctx.record({
    type: "assassination",
    date: world.now,
    participants: { killer: plotter.id, target: ruler.id },
    data: { polity: polity.id, method },
    location: polity.capital,
    region: regionOfSettlement(world, polity.capital),
    importance: 60,
    causes: [],
    storyline: null,
    secret: true,
  });
  ctx.services.people.kill(ctx, ruler, "died suddenly, and none could say of what", {
    event: deed.id,
  });
  // Succession has already run inside kill(); if fate handed the plotter the
  // crown, the realm suspects nothing yet. Either way the hunger is fed.
  delete plotter.flags[PF.claimant];
}

function stageCoup(ctx: Ctx, rng: Rng, polity: Polity, plotter: Person, ruler: Person): void {
  const world = ctx.world;
  // coup data: { polity: PolityId, manner: string }
  const coup = ctx.record({
    type: "coup",
    date: world.now,
    participants: { usurper: plotter.id, deposed: ruler.id },
    data: {
      polity: polity.id,
      manner: rng.fork("manner").pick([
        "spears filled the hall before the morning meal",
        "the household guard turned their cloaks at a word",
        "the gates were barred with the court inside and the crown outside",
      ]),
    },
    location: polity.capital,
    region: regionOfSettlement(world, polity.capital),
    importance: 55,
    causes: [],
    storyline: null,
    secret: false,
  });

  // The fallen ruler is stripped, not slain; exiles breed better stories.
  const lostTitle = `${rulerTitle(polity, ruler.sex)} of ${polity.name}`;
  ruler.status.titles = ruler.status.titles.filter((t) => t !== lostTitle);
  ruler.flags[PF.deposed] = polity.id;
  ruler.status.profession = "noble";

  crownRuler(ctx, rng.fork("crown"), polity, plotter, {
    causes: [coup.id],
    usurped: true,
    data: { deposed: ruler.id },
  });

  // Usurpers get named for how they took it, sometimes.
  if (plotter.epithet === "" && rng.fork("epithet-gate").chance(0.45)) {
    const lang = languageOfCulture(world, plotter.culture);
    if (lang) {
      const theme = rng.fork("theme").pick(["cunning", "bold", "grim", "oathbreaker"]);
      const epithet = ctx.services.language.epithet(rng.fork("epithet"), lang, theme);
      plotter.epithet = epithet;
      ctx.record({
        type: "nickname-earned",
        date: world.now,
        participants: { subject: plotter.id },
        data: { epithet, reason: `took the high seat of ${polity.name} by force` },
        location: polity.capital,
        region: regionOfSettlement(world, polity.capital),
        importance: 15,
        causes: [coup.id],
        storyline: null,
        secret: false,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Crisis resolution: the empty seat is filled at last
// ---------------------------------------------------------------------------

function resolveCrises(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  const state = polState(world);
  const keys = Object.keys(state.crises).sort((a, b) => Number(a) - Number(b));
  for (const key of keys) {
    const crisis = state.crises[key];
    const polity = world.polities.get(crisis.polity);
    if (!polity) {
      delete state.crises[key];
      continue;
    }
    if (polity.ruler !== null) {
      delete state.crises[key]; // someone already took it (coup, story)
      continue;
    }
    if (world.now < crisis.resolveAfter) continue;

    // Living claimants to this crown, in id order.
    const claimants: Person[] = [];
    for (const id of livingIds(world)) {
      const p = world.people.get(id);
      if (p && p.flags[PF.claimant] === polity.id) claimants.push(p);
    }

    let winner: Person | null = null;
    if (claimants.length > 0) {
      const scored = claimants.map((p) => {
        let score = p.status.rank * 10 + Math.min(30, p.notability / 8) + p.personality.ambition * 15;
        const house = p.house != null ? world.houses.get(p.house) : null;
        if (house) score += Math.min(25, house.prestige / 2);
        if (!isAdult(world, p)) score -= 30;
        score += rng.fork("jitter", p.id).next() * 10;
        return { p, score };
      });
      scored.sort((a, b) => b.score - a.score || a.p.id - b.p.id);
      winner = scored[0].p;
    } else {
      // No claimant stood; the strongest house present takes the seat and a
      // new dynasty begins.
      const heads = housesOfPolity(world, polity)
        .map((h) => ({ h, head: livingPerson(world, h.head) }))
        .filter((x): x is { h: (typeof x)["h"]; head: Person } => x.head !== null)
        .sort((a, b) => b.h.prestige - a.h.prestige || a.h.id - b.h.id);
      winner = heads[0]?.head ?? null;
    }

    if (!winner) {
      // The seat stays cold another season; try again in a year.
      crisis.resolveAfter = world.now + 12;
      continue;
    }

    crownRuler(ctx, rng.fork("crown", polity.id), polity, winner, {
      causes: [crisis.event],
      disputed: true,
      data: claimants.length === 0 ? { newDynasty: true } : {},
    });
    delete state.crises[key];
    // The defeated keep their claims, and their grudges.
  }
}
