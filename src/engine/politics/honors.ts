/**
 * Honors and houses: title grants for the deserving flagged (war heroes,
 * masters of a craft), prestige drift, cadet branches budding off swollen
 * houses, extinctions mourned, and court benches refilled. The heavy
 * bookkeeping runs once a year, in high summer, when lords count things.
 */

import type { Ctx, EventId, House, Person, Polity } from "../core/types";
import type { Rng } from "../core/rng";
import { monthOf } from "../core/time";
import { livingIds, nextId, sortedIds } from "../core/world";
import {
  PF,
  ageOf,
  clamp,
  houseMemberIndex,
  housesOfPolity,
  isAdult,
  isClanCulture,
  languageOfCulture,
  livingPerson,
  lordTitle,
  polState,
  politiesSorted,
  regionOfSettlement,
} from "./helpers";

export function honorsTick(ctx: Ctx, rng: Rng): void {
  grantTitles(ctx, rng.fork("titles"));
  if (monthOf(ctx.world.now) === 7) {
    const index = houseMemberIndex(ctx.world);
    driftPrestige(ctx, rng.fork("prestige"), index);
    foundCadetHouses(ctx, rng.fork("cadet"), index);
    mournExtinctHouses(ctx, index);
    refillCourts(ctx, rng.fork("court"), index);
  }
}

// ---------------------------------------------------------------------------
// Title grants for the flagged deserving
// ---------------------------------------------------------------------------

function grantTitles(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (!p) continue;
    const heroFlag = p.flags[PF.warHero];
    const masterFlag = p.flags[PF.masterwork];
    if (heroFlag === undefined && masterFlag === undefined) continue;
    // Honors come with the seasons, not the morning post.
    if (!rng.fork("gate", id).chance(0.12)) continue;
    const honored = p.flags[PF.honored];
    if (typeof honored === "number" && world.now - honored < 120) {
      // Once ennobled, further glory buys renown, not another rank.
      delete p.flags[PF.warHero];
      delete p.flags[PF.masterwork];
      continue;
    }
    const polity = p.location != null ? world.polities.get(world.settlements.get(p.location)?.polity ?? -1) : null;
    if (!polity) continue;
    const ruler = livingPerson(world, polity.ruler);
    if (!ruler || ruler.id === p.id) continue;

    const forWar = heroFlag !== undefined;
    const cause: EventId[] = [];
    if (forWar && typeof heroFlag === "number") cause.push(heroFlag);
    if (!forWar && typeof masterFlag === "number") cause.push(masterFlag);
    delete p.flags[PF.warHero];
    delete p.flags[PF.masterwork];

    const newRank = clamp(p.status.rank + 1, p.status.rank, 3);
    if (newRank === p.status.rank && p.status.rank >= 3) continue; // nothing left to give
    p.status.rank = newRank;
    p.status.wealth = clamp(p.status.wealth + 1, 0, 5);
    p.flags[PF.honored] = world.now;

    const seatName = p.location != null ? (world.settlements.get(p.location)?.name ?? polity.name) : polity.name;
    const title = forWar
      ? rng.fork("title", id).pick([
          `Shield of ${seatName}`,
          `Defender of ${seatName}`,
          `Sworn Blade of ${polity.name}`,
        ])
      : rng.fork("title", id).pick([
          `Master of the ${seatName} Guild`,
          `Keeper of the Craft at ${seatName}`,
        ]);
    p.status.titles.push(title);

    // title-granted data: { title: string, rank: number, reason: string,
    // granter: PersonId } — granter lives in data, not participants, so
    // routine grants don't flood the ruler's own chronicle or notability.
    ctx.record({
      type: "title-granted",
      date: world.now,
      participants: { subject: p.id },
      data: {
        title,
        rank: newRank,
        granter: ruler.id,
        reason: forWar
          ? "for valor under the banners"
          : "for work no living hand could better",
      },
      location: p.location,
      region: regionOfSettlement(world, p.location),
      importance: 15,
      causes: cause,
      storyline: null,
      secret: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Prestige drift (yearly)
// ---------------------------------------------------------------------------

function driftPrestige(ctx: Ctx, rng: Rng, index: Map<number, Person[]>): void {
  const world = ctx.world;
  for (const polity of politiesSorted(world)) {
    const resting = 25 + polity.regions.length * 12 + (polity.kind === "kingdom" ? 8 : 0);
    polity.prestige += (resting - polity.prestige) * 0.15;
    const ruler = livingPerson(world, polity.ruler);
    if (ruler) polity.prestige += Math.min(3, ruler.notability / 200);
    polity.prestige = Math.max(0, Math.round(polity.prestige * 10) / 10);
  }
  for (const hid of sortedIds(world.houses)) {
    const house = world.houses.get(hid)!;
    const members = index.get(hid) ?? [];
    const resting = 8 + Math.min(20, members.length * 1.5);
    house.prestige += (resting - house.prestige) * 0.1;
    for (const m of members) house.prestige += Math.min(0.6, m.notability / 500);
    house.prestige = Math.max(0, Math.round(house.prestige * 10) / 10);
  }
}

// ---------------------------------------------------------------------------
// Cadet houses (yearly)
// ---------------------------------------------------------------------------

function foundCadetHouses(ctx: Ctx, rng: Rng, index: Map<number, Person[]>): void {
  const world = ctx.world;
  for (const hid of sortedIds(world.houses)) {
    const house = world.houses.get(hid)!;
    const members = index.get(hid) ?? [];
    if (members.length < 9) continue;
    if (!rng.fork("gate", hid).chance(0.18)) continue;

    // The restless younger blood: adult, not the head, not the head's own
    // firstborn, with a family of their own to carry off.
    const head = livingPerson(world, house.head);
    const candidates = members.filter((p) => {
      if (!isAdult(world, p) || p.id === house.head) return false;
      if (p.flags[PF.marriedIn] === true) return false;
      if (head && head.children.length > 0 && p.id === head.children[0]) return false;
      return p.children.length > 0 && p.personality.ambition > 0.45;
    });
    if (candidates.length === 0) continue;
    const founder = rng.fork("founder", hid).weighted(
      candidates,
      candidates.map((p) => 1 + p.personality.ambition * 2 + p.children.length * 0.5),
    );

    const culture = world.cultures.get(house.culture) ?? null;
    const lang = languageOfCulture(world, house.culture);
    if (!culture || !lang) continue;
    const familyName = ctx.services.language.familyName(rng.fork("name", hid), lang);
    const styled = `${isClanCulture(culture) ? "Clan" : "House"} ${familyName}`;
    const newId = nextId(world, "house");
    const seat = founder.location ?? house.seat;
    const cadet: House = {
      id: newId,
      name: styled,
      motto: house.motto, // the old words carried to a new hall
      founder: founder.id,
      founded: world.now,
      head: founder.id,
      seat,
      culture: house.culture,
      parent: house.id,
      prestige: Math.max(6, house.prestige * 0.4),
      bannerSeed: `${house.bannerSeed}>cadet#${newId}`,
      feuds: new Map(),
    };
    world.houses.set(newId, cadet);

    // The founder walks out with spouse and children still under the roof.
    const moving = new Set<number>([founder.id]);
    for (const m of founder.marriages) {
      if (!m.active) continue;
      const spouse = world.people.get(m.spouse);
      if (spouse && spouse.house === house.id) moving.add(spouse.id);
    }
    for (const cid of founder.children) {
      const child = world.people.get(cid);
      if (child && child.house === house.id && child.died === null && !isAdult(world, child)) {
        moving.add(cid);
      }
    }
    const movedPeople: Person[] = [];
    for (const pid of [...moving].sort((a, b) => a - b)) {
      const person = world.people.get(pid)!;
      person.house = newId;
      if (person.died === null) movedPeople.push(person);
    }
    // Keep the member index true for the passes that follow this one.
    index.set(newId, movedPeople);
    index.set(house.id, (index.get(house.id) ?? []).filter((p) => !moving.has(p.id)));

    const seatName = seat != null ? (world.settlements.get(seat)?.name ?? "") : "";
    // house-cadet-founded data: { house, parent: HouseId, houseName, parentName, seatName }
    ctx.record({
      type: "house-cadet-founded",
      date: world.now,
      participants: { founder: founder.id },
      data: {
        house: newId,
        houseName: styled,
        parent: house.id,
        parentName: house.name,
        seatName,
      },
      location: seat,
      region: regionOfSettlement(world, seat),
      importance: 12,
      causes: [],
      storyline: null,
      secret: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Extinctions (yearly)
// ---------------------------------------------------------------------------

function mournExtinctHouses(ctx: Ctx, index: Map<number, Person[]>): void {
  const world = ctx.world;
  const state = polState(world);
  for (const hid of sortedIds(world.houses)) {
    if (state.extinctHouses.includes(hid)) continue;
    const house = world.houses.get(hid)!;
    if (world.now - house.founded < 12) continue; // newborn lines get a year
    const members = index.get(hid) ?? [];
    if (members.length > 0) continue;
    state.extinctHouses.push(hid);
    house.head = null;
    // house-extinct data: { house: HouseId, houseName, motto, founded: SimDate }
    ctx.record({
      type: "house-extinct",
      date: world.now,
      participants: {},
      data: {
        house: hid,
        houseName: house.name,
        motto: house.motto,
        founded: house.founded,
      },
      location: house.seat,
      region: regionOfSettlement(world, house.seat),
      importance: 20,
      causes: [],
      storyline: null,
      secret: false,
    });
  }
}

// ---------------------------------------------------------------------------
// Court refills (yearly, quiet)
// ---------------------------------------------------------------------------

function refillCourts(ctx: Ctx, rng: Rng, index: Map<number, Person[]>): void {
  const world = ctx.world;
  for (const polity of politiesSorted(world)) {
    for (const role of [...polity.court.keys()].sort()) {
      if (livingPerson(world, polity.court.get(role)) !== null) continue;
      polity.court.delete(role);
      const seated = new Set([...polity.court.values()]);
      // The bench: adult house blood of the realm, then capital notables.
      const bench: Person[] = [];
      for (const h of housesOfPolity(world, polity)) {
        for (const p of index.get(h.id) ?? []) {
          if (isAdult(world, p) && !seated.has(p.id) && p.id !== polity.ruler) bench.push(p);
        }
      }
      if (bench.length === 0) {
        for (const id of livingIds(world)) {
          const p = world.people.get(id);
          if (!p || p.location !== polity.capital) continue;
          if (p.status.rank >= 2 && isAdult(world, p) && ageOf(world, p) < 65 && !seated.has(p.id)) {
            bench.push(p);
          }
          if (bench.length >= 40) break;
        }
      }
      if (bench.length === 0) continue;
      const weights = bench.map((p) => {
        let w = 1 + p.status.rank * 0.5;
        const apt = p.phenotype.aptitudes;
        if (role === "marshal") w += (apt["war"] ?? 0) * 3;
        if (role === "steward" || role === "master of coin") w += (apt["trade"] ?? 0) * 2 + p.personality.diligence;
        if (role === "court poet" || role === "skald") w += (apt["music"] ?? 0) * 3;
        if (role === "lorekeeper" || role === "master of letters") w += (apt["lore"] ?? 0) * 3;
        if (role === "court physician") w += (apt["healing"] ?? 0) * 3;
        return Math.max(0.1, w);
      });
      const chosen = rng.fork("pick", polity.id, role).weighted(bench, weights);
      polity.court.set(role, chosen.id);
      // A quiet appointment; the chronicle keeps its ink for blood and crowns.
    }
  }
}
