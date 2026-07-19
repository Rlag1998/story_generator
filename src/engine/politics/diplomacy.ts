/**
 * Diplomacy: slow stance drift between realms, and the marriages that seal
 * it. Alliances are made of people: a betrothal across borders, recorded
 * with intent, wedded later by the people module's marriage market.
 */

import type { Ctx, Person, PersonId, Polity, World } from "../core/types";
import type { Rng } from "../core/rng";
import { livingIds } from "../core/world";
import {
  PF,
  ageOf,
  atWar,
  housesOfPolity,
  isAdult,
  livingPerson,
  polState,
  politiesSorted,
  setStance,
  stanceBetween,
} from "./helpers";

export function diplomacyTick(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  const polities = politiesSorted(world);
  const state = polState(world);

  for (let i = 0; i < polities.length; i++) {
    for (let j = i + 1; j < polities.length; j++) {
      const a = polities[i];
      const b = polities[j];
      const stance = stanceBetween(a, b.id);
      if (stance === "war") continue; // the war engine owns this pair
      const pRng = rng.fork("pair", a.id, b.id);

      // Drift: alliances loosen, rivalries cool, grudges kindle.
      if (stance === "alliance" && pRng.fork("lapse").chance(0.0025)) {
        setStance(a, b, "peace", world.now);
      } else if (stance === "rivalry" && pRng.fork("cool").chance(0.004)) {
        setStance(a, b, "peace", world.now);
      } else if (stance === "peace" && pRng.fork("sour").chance(sourChance(world, state, a, b))) {
        setStance(a, b, "rivalry", world.now);
      }

      // A match across the border. Likeliest in the raw years after a war,
      // when both courts want the peace nailed down in blood.
      if (atWar(state, a.id) || atWar(state, b.id)) continue;
      const lastEndA = state.lastWarEnd[String(a.id)];
      const recentWar =
        lastEndA !== undefined &&
        world.now - lastEndA < 60 &&
        state.lastWarEnd[String(b.id)] !== undefined &&
        world.now - (state.lastWarEnd[String(b.id)] ?? 0) < 60;
      let matchChance = stance === "alliance" ? 0.0008 : 0.0022;
      if (recentWar) matchChance *= 6;
      if (stance === "rivalry") matchChance *= 0.5;
      if (pRng.fork("match-gate").chance(matchChance)) {
        arrangeAllianceMatch(ctx, pRng.fork("match"), a, b, recentWar);
      }
    }
  }
}

function sourChance(
  world: World,
  state: ReturnType<typeof polState>,
  a: Polity,
  b: Polity,
): number {
  let p = 0.0012;
  // Feuding great houses drag their realms with them.
  for (const h of housesOfPolity(world, a)) {
    for (const fid of [...h.feuds.keys()].sort((x, y) => x - y)) {
      if ((h.feuds.get(fid) ?? 0) < 0.4) continue;
      const rival = world.houses.get(fid);
      if (rival?.seat != null && world.settlements.get(rival.seat)?.polity === b.id) p += 0.004;
    }
  }
  // A war within living memory leaves a scar that reopens.
  const endA = state.lastWarEnd[String(a.id)];
  const endB = state.lastWarEnd[String(b.id)];
  if (endA !== undefined && endB !== undefined && Math.abs(endA - endB) < 2 && world.now - endA < 180) {
    p += 0.002;
  }
  if (a.culture !== b.culture) p += 0.0006;
  return p;
}

// ---------------------------------------------------------------------------
// Alliance betrothals
// ---------------------------------------------------------------------------

/** Marriageable high blood of a polity: unwed adult house members, young. */
function matchPool(world: World, polity: Polity): Person[] {
  const houseIds = new Set<number>();
  if (polity.rulingHouse != null) houseIds.add(polity.rulingHouse);
  for (const h of housesOfPolity(world, polity)) houseIds.add(h.id);
  const out: Person[] = [];
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (!p || p.house == null || !houseIds.has(p.house)) continue;
    if (!isAdult(world, p) || ageOf(world, p) > 38) continue;
    if (p.betrothed !== null || p.marriages.some((m) => m.active)) continue;
    if (p.flags[PF.marriedIn] === true) continue;
    out.push(p);
  }
  return out;
}

function arrangeAllianceMatch(
  ctx: Ctx,
  rng: Rng,
  a: Polity,
  b: Polity,
  sealingPeace: boolean,
): void {
  const world = ctx.world;
  const poolA = matchPool(world, a);
  const poolB = matchPool(world, b);
  if (poolA.length === 0 || poolB.length === 0) return;

  // Prefer blood nearest the two crowns; the bride and groom are chosen for
  // their houses, not their hearts.
  const weigh = (p: Person, polity: Polity): number => {
    let w = 1 + p.status.rank;
    if (p.house === polity.rulingHouse) w *= 2.5;
    const house = p.house != null ? world.houses.get(p.house) : null;
    if (house?.head === p.id) w *= 0.4; // heads themselves rarely leave
    return w;
  };
  const one = rng.fork("a").weighted(poolA, poolA.map((p) => weigh(p, a)));
  const partners = poolB.filter((p) => p.sex !== one.sex);
  if (partners.length === 0) return;
  const two = rng.fork("b").weighted(partners, partners.map((p) => weigh(p, b)));
  if (ctx.services.social.closeKin(world, one.id, two.id)) return;

  const bride = one.sex === "f" ? one : two;
  const groom = one.sex === "f" ? two : one;

  const reason = sealingPeace
    ? `to seal the peace between ${a.name} and ${b.name}`
    : `to bind ${a.name} and ${b.name} in friendship`;
  // betrothal data (political): { alliance: true, reason, polities: PolityId[] }
  const ev = ctx.record({
    type: "betrothal",
    date: world.now,
    participants: { bride: bride.id, groom: groom.id },
    data: { alliance: true, reason, polities: [a.id, b.id] },
    location: a.capital,
    region: world.settlements.get(a.capital)?.region ?? null,
    importance: 12,
    causes: [],
    storyline: null,
    secret: false,
  });

  bride.betrothed = groom.id;
  groom.betrothed = bride.id;
  const wait = world.now + rng.fork("wait").intIn(6, 18);
  for (const p of [bride, groom]) {
    p.flags[PF.wedAfter] = wait;
    p.flags[PF.betrothalEvent] = ev.id;
  }

  if (stanceBetween(a, b.id) !== "alliance") {
    setStance(a, b, "alliance", world.now);
    const aRuler = livingPerson(world, a.ruler);
    const bRuler = livingPerson(world, b.ruler);
    const participants: Record<string, PersonId> = {};
    if (aRuler) participants.a = aRuler.id;
    if (bRuler) participants.b = bRuler.id;
    // alliance-formed data: { polities: PolityId[], sealedBy: betrothal EventId }
    ctx.record({
      type: "alliance-formed",
      date: world.now,
      participants,
      data: { polities: [a.id, b.id], sealedBy: ev.id },
      location: a.capital,
      region: world.settlements.get(a.capital)?.region ?? null,
      importance: 18,
      causes: [ev.id],
      storyline: null,
      secret: false,
    });
  }
}
