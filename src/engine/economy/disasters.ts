/**
 * Disasters: rare, regionally coherent calamities.
 *
 *  - fire: towns and cities; kills a handful of named residents, and now
 *    and then a brave local drags someone from the smoke.
 *  - flood: marsh and coast regions in the thaw and the autumn rains.
 *  - storm: coasts and ports; sailors are lost at sea.
 *  - earthquake: mountain regions, very rare, terrible.
 *  - comet: a sign in the sky for half a year; religion and story fuel.
 *
 * One material disaster at most per stretch of months (global spacing), so
 * a decade reads as "the year the granary burned", not a drumbeat of ruin.
 */

import type { Rng } from "../core/rng";
import { monthOf } from "../core/time";
import type { Ctx, EventRecord, Person, Region, Settlement } from "../core/types";
import { sortedIds } from "../core/world";
import { setLean } from "./conditions";
import {
  ageYears,
  bumpWealth,
  idsOf,
  languageNear,
  pickWeightedPeople,
  regionHasPort,
  residentsByProfession,
  residentsOf,
  settlementsOfRegion,
} from "./helpers";
import { BURN_INJURIES, cometName, QUAKE_INJURIES } from "./names";
import { type EconState, WORLD_COND } from "./state";

/** Months between material disasters, world-wide. */
const DISASTER_SPACING = 10;

/** Monthly world-wide chances (given eligible geography exists). */
const P_FIRE = 1 / 120; // ~1 per 10 years
const P_FLOOD = 1 / 150; // ~1 per 12.5 years
const P_STORM = 1 / 140; // ~1 per 11.7 years
const P_QUAKE = 1 / 540; // ~1 per 45 years
const P_COMET = 1 / 900; // ~1 per 75 years

export function disastersTick(ctx: Ctx, state: EconState): void {
  const { world } = ctx;

  // The comet keeps its own celestial schedule, indifferent to earthly spacing.
  maybeComet(ctx, state);

  if (world.now - state.lastDisasterAt < DISASTER_SPACING && state.lastDisasterAt > 0) return;

  const rng = ctx.rng.fork("econ", "disaster");
  const month = monthOf(world.now);

  // Rarest first so common calamities never starve the great ones.
  if (tryEarthquake(ctx, state, rng.fork("quake"))) return;
  if (tryFire(ctx, state, rng.fork("fire"), month)) return;
  if (tryFlood(ctx, state, rng.fork("flood"), month)) return;
  tryStorm(ctx, state, rng.fork("storm"), month);
}

// ---------------------------------------------------------------------------
// Fire
// ---------------------------------------------------------------------------

/**
 * Set a town ablaze now. Exported for tests; normally rolled monthly.
 * Kills 1-4 named residents (cause "the great fire of <place>"), sometimes
 * spares one through a heroic rescue by a brave local.
 */
export function igniteFire(ctx: Ctx, state: EconState, s: Settlement, rng: Rng): EventRecord {
  const { world } = ctx;
  state.lastDisasterAt = world.now;
  const fireName = `the great fire of ${s.name}`;

  const folk = residentsOf(world, s.id);
  const intended = Math.min(rng.fork("count").intIn(1, 4), folk.length);
  // The flames find the small and the slow first.
  const victims = pickWeightedPeople(
    rng.fork("victims"),
    folk,
    (p) => {
      const a = ageYears(world, p);
      return 1 + (a < 12 ? 0.8 : 0) + (a >= 60 ? 0.8 : 0);
    },
    intended,
  );

  // A rescue? Someone with fire in the blood, not among the victims.
  let rescuer: Person | null = null;
  let saved: Person | null = null;
  if (victims.length >= 2 && rng.fork("rescue-roll").chance(0.4)) {
    const braves = folk.filter(
      (p) =>
        !victims.includes(p) &&
        ageYears(world, p) >= 14 &&
        (p.personality.courage > 0.25 || (p.phenotype.aptitudes.war ?? 0) >= 2),
    );
    if (braves.length > 0) {
      rescuer = pickWeightedPeople(
        rng.fork("rescuer"),
        braves,
        (p) => 1 + Math.max(0, p.personality.courage) * 2 + (p.phenotype.aptitudes.war ?? 0) * 0.5,
        1,
      )[0];
      saved = victims.pop() ?? null; // pulled from the smoke at the last
    }
  }

  const homesLost = rng.fork("homes").intIn(3, Math.max(4, Math.round(s.abstractPop / 25)));
  s.abstractPop = Math.max(20, s.abstractPop - rng.fork("pop").intIn(2, 14));

  const ev = ctx.record({
    type: "fire",
    date: world.now,
    participants: {},
    // data: { name, fallen: PersonId[], homesLost }.
    data: { name: fireName, fallen: idsOf(victims), homesLost },
    location: s.id,
    region: s.region,
    importance: 30,
    causes: [],
    storyline: null,
    secret: false,
  });

  for (const v of victims) {
    ctx.services.people.kill(ctx, v, fireName, { event: ev.id });
  }

  if (rescuer && saved) {
    ctx.record({
      type: "heroic-rescue",
      date: world.now,
      participants: { rescuer: rescuer.id, saved: saved.id },
      // data: { peril: "fire" } — what the saved were pulled from.
      data: { peril: "fire" },
      location: s.id,
      region: s.region,
      importance: 25,
      causes: [ev.id],
      storyline: null,
      secret: false,
    });
    if (rng.fork("scars").chance(0.35)) {
      const mark = rng.fork("mark").pick(BURN_INJURIES);
      if (!rescuer.injuries.includes(mark)) rescuer.injuries.push(mark);
    }
  }

  // A few households lose everything but their lives.
  const burnedOut = pickWeightedPeople(
    rng.fork("burned"),
    residentsOf(world, s.id).filter((p) => p.status.wealth > 0),
    () => 1,
    2,
  );
  for (const p of burnedOut) bumpWealth(p, -1);

  return ev;
}

function tryFire(ctx: Ctx, state: EconState, rng: Rng, month: number): boolean {
  const { world } = ctx;
  const eligible = sortedIds(world.settlements)
    .map((id) => world.settlements.get(id)!)
    .filter((s) => s.kind === "town" || s.kind === "city");
  if (eligible.length === 0) return false;
  // Hearths burn all winter; droughts crack the summer shingles.
  const seasonal = month === 12 || month <= 2 ? 1.6 : month === 7 || month === 8 ? 1.3 : 1;
  if (!rng.fork("roll").chance(P_FIRE * seasonal)) return false;
  const target = rng.fork("where").weighted(
    eligible,
    eligible.map((s) => Math.max(1, s.abstractPop)),
  );
  igniteFire(ctx, state, target, rng.fork("burn", target.id));
  return true;
}

// ---------------------------------------------------------------------------
// Flood
// ---------------------------------------------------------------------------

function tryFlood(ctx: Ctx, state: EconState, rng: Rng, month: number): boolean {
  const { world } = ctx;
  // Thaw-water in spring; the long rains in autumn.
  const seasonal = month === 3 || month === 4 ? 1.6 : month === 10 || month === 11 ? 1.4 : 0.5;
  const eligible = sortedIds(world.regions)
    .map((id) => world.regions.get(id)!)
    .filter((r) => (r.biome === "marsh" || r.biome === "coast") && r.settlements.length > 0);
  if (eligible.length === 0) return false;
  if (!rng.fork("roll").chance(P_FLOOD * seasonal)) return false;

  const region = rng.fork("where").pick(eligible);
  state.lastDisasterAt = world.now;
  const settlements = settlementsOfRegion(world, region);
  const drownedAll: Person[] = [];
  for (const s of settlements) {
    setLean(state, s, world.now + 4); // stores spoiled by water
    s.abstractPop = Math.max(20, s.abstractPop - rng.fork("pop", s.id).intIn(0, 6));
    const folk = residentsOf(world, s.id);
    const n = rng.fork("drown", s.id).weightedPairs([
      [0, 5],
      [1, 2],
      [2, 0.7],
    ] as const);
    drownedAll.push(...pickWeightedPeople(rng.fork("who", s.id), folk, () => 1, Math.min(n, folk.length)));
  }

  const ev = ctx.record({
    type: "flood",
    date: world.now,
    participants: {},
    // data: { fallen: PersonId[], months the stores stay spoiled }.
    data: { fallen: idsOf(drownedAll), months: 4 },
    location: settlements.length > 0 ? settlements[0].id : null,
    region: region.id,
    importance: 24,
    causes: [],
    storyline: null,
    secret: false,
  });
  for (const p of drownedAll) {
    ctx.services.people.kill(ctx, p, "taken by the flood", { event: ev.id });
  }
  return true;
}

// ---------------------------------------------------------------------------
// Storm
// ---------------------------------------------------------------------------

function tryStorm(ctx: Ctx, state: EconState, rng: Rng, month: number): boolean {
  const { world } = ctx;
  const seasonal = month >= 9 || month <= 2 ? 1.5 : 0.6; // the gale season
  const eligible = sortedIds(world.regions)
    .map((id) => world.regions.get(id)!)
    .filter((r) => (r.biome === "coast" || regionHasPort(world, r)) && r.settlements.length > 0);
  if (eligible.length === 0) return false;
  if (!rng.fork("roll").chance(P_STORM * seasonal)) return false;

  const region = rng.fork("where").weighted(
    eligible,
    eligible.map((r) => (regionHasPort(world, r) ? 2 : 1)),
  );
  state.lastDisasterAt = world.now;
  const settlements = settlementsOfRegion(world, region);
  const harbor = settlements.find((s) => s.kind === "port") ?? settlements[0] ?? null;

  // The sea keeps what it catches: sailors and fisherfolk out in the gale.
  const lost: Person[] = [];
  for (const s of settlements) {
    const seafolk = residentsByProfession(world, s.id, ["sailor", "fisher"]);
    const n = rng.fork("lost", s.id).weightedPairs([
      [0, 3],
      [1, 2.4],
      [2, 1],
    ] as const);
    lost.push(...pickWeightedPeople(rng.fork("who", s.id), seafolk, () => 1, Math.min(n, seafolk.length)));
  }
  const shipsLost = rng.fork("ships").intIn(1, 5);

  const ev = ctx.record({
    type: "storm",
    date: world.now,
    participants: {},
    // data: { fallen: PersonId[] (lost at sea), shipsLost }.
    data: { fallen: idsOf(lost), shipsLost },
    location: harbor ? harbor.id : null,
    region: region.id,
    importance: 22,
    causes: [],
    storyline: null,
    secret: false,
  });
  for (const p of lost) {
    ctx.services.people.kill(ctx, p, "swallowed by the sea in the great gale", { event: ev.id });
  }
  // Boats splinter; a few owners are beggared for a season.
  if (harbor) {
    const owners = pickWeightedPeople(
      rng.fork("boats"),
      residentsByProfession(world, harbor.id, ["fisher", "merchant", "sailor"]).filter(
        (p) => p.status.wealth > 0,
      ),
      () => 1,
      2,
    );
    for (const p of owners) bumpWealth(p, -1);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Earthquake
// ---------------------------------------------------------------------------

function tryEarthquake(ctx: Ctx, state: EconState, rng: Rng): boolean {
  const { world } = ctx;
  const eligible = sortedIds(world.regions)
    .map((id) => world.regions.get(id)!)
    .filter((r) => r.biome === "mountains" && r.settlements.length > 0);
  if (eligible.length === 0) return false;
  if (!rng.fork("roll").chance(P_QUAKE)) return false;

  const region = rng.fork("where").pick(eligible);
  state.lastDisasterAt = world.now;
  const settlements = settlementsOfRegion(world, region);
  const fallen: Person[] = [];
  let ruinedHomes = 0;
  for (const s of settlements) {
    const loss = Math.round(s.abstractPop * rng.fork("pop", s.id).range(0.03, 0.09));
    s.abstractPop = Math.max(20, s.abstractPop - loss);
    ruinedHomes += rng.fork("homes", s.id).intIn(4, 20);
    const folk = residentsOf(world, s.id);
    const n = Math.min(rng.fork("dead", s.id).intIn(1, 3), folk.length);
    fallen.push(...pickWeightedPeople(rng.fork("who", s.id), folk, () => 1, n));
  }

  const ev = ctx.record({
    type: "earthquake",
    date: world.now,
    participants: {},
    // data: { fallen: PersonId[], ruinedHomes across the region }.
    data: { fallen: idsOf(fallen), ruinedHomes },
    location: settlements.length > 0 ? settlements[0].id : null,
    region: region.id,
    importance: 60,
    causes: [],
    storyline: null,
    secret: false,
  });
  for (const p of fallen) {
    ctx.services.people.kill(ctx, p, "crushed when the earth shook", { event: ev.id });
  }
  // Survivors dug from the rubble carry the day in their bones.
  for (const s of settlements) {
    const hurt = pickWeightedPeople(
      rng.fork("hurt", s.id),
      residentsOf(world, s.id),
      () => 1,
      rng.fork("hurt-n", s.id).intIn(0, 2),
    );
    for (const p of hurt) {
      const mark = rng.fork("mark", p.id).pick(QUAKE_INJURIES);
      if (!p.injuries.includes(mark)) p.injuries.push(mark);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Comet
// ---------------------------------------------------------------------------

function maybeComet(ctx: Ctx, state: EconState): void {
  const { world } = ctx;
  if (world.conditions[WORLD_COND.comet]) return; // one sign at a time
  const rng = ctx.rng.fork("econ", "comet");
  if (!rng.fork("roll").chance(P_COMET)) return;

  const lang = languageNear(world, null);
  const name = cometName(rng.fork("name"), ctx.services.language, lang);
  const months = rng.fork("months").intIn(5, 8);
  state.cometUntil = world.now + months;
  world.conditions[WORLD_COND.comet] = name;

  ctx.record({
    type: "comet",
    date: world.now,
    participants: {},
    // data: { name, months it hangs in the sky }.
    data: { name, months },
    location: null,
    region: null,
    importance: 40,
    causes: [],
    storyline: null,
    secret: false,
  });
}
