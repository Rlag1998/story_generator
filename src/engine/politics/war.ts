/**
 * War: rare, slow-burning, and personal. A polity marches roughly once a
 * generation, driven by pressed claims, feuds between great houses, or the
 * plain hunger of conquest cultures. Campaigns grind monthly; battles fall
 * every few months, kill named people, mint heroes, and end in conquest,
 * tribute, or two exhausted realms hating each other politely.
 */

import type {
  Ctx,
  EventId,
  EventRecord,
  Person,
  PersonId,
  Polity,
  PolityId,
  RegionId,
  World,
} from "../core/types";
import type { Rng } from "../core/rng";
import { livingIds } from "../core/world";
import {
  PF,
  atWar,
  bordering,
  clamp,
  isAdult,
  languageOfCulture,
  livingPerson,
  polState,
  politiesSorted,
  setStance,
  stanceBetween,
  warBetween,
  type WarState,
} from "./helpers";
import { claimCasus, conquestCasus, feudCasus, tributeFlavor } from "./prose";

/** Expected years between wars for an unprovoked polity. */
const PEACE_YEARS = 38;
const DECISIVE_SCORE = 30;
const EXHAUSTION = 100;

export function warTick(ctx: Ctx, rng: Rng): void {
  maybeDeclareWars(ctx, rng.fork("declare"));
  runCampaigns(ctx, rng.fork("campaign"));
}

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

function maybeDeclareWars(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  const state = polState(world);
  for (const polity of politiesSorted(world)) {
    if (atWar(state, polity.id)) continue;
    const ruler = livingPerson(world, polity.ruler);
    if (!ruler) continue;
    const culture = world.cultures.get(polity.culture);

    let p = 1 / (PEACE_YEARS * 12);
    if (culture?.values.includes("conquest")) p *= 2.2;
    if (culture?.values.includes("vengeance")) p *= 1.4;
    p *= 0.55 + ruler.personality.wrath * 0.7 + ruler.personality.ambition * 0.6;
    const lastEnd = state.lastWarEnd[String(polity.id)];
    if (lastEnd !== undefined && world.now - lastEnd < 96) p *= 0.2;
    if (!rng.fork("gate", polity.id).chance(p)) continue;

    declareChosenWar(ctx, rng.fork("target", polity.id), polity, ruler);
  }
}

function declareChosenWar(ctx: Ctx, rng: Rng, attacker: Polity, ruler: Person): void {
  const world = ctx.world;
  const state = polState(world);

  // Standing claimants sharpen appetites: who here claims which crown?
  const claimsAgainst = new Map<PolityId, PersonId[]>();
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (!p) continue;
    const claim = p.flags[PF.claimant];
    if (typeof claim !== "number" || claim === attacker.id) continue;
    const home = p.location != null ? world.settlements.get(p.location) : null;
    if (!home || home.polity !== attacker.id) continue;
    const list = claimsAgainst.get(claim);
    if (list) list.push(id);
    else claimsAgainst.set(claim, [id]);
  }

  const candidates: Polity[] = [];
  const weights: number[] = [];
  for (const target of politiesSorted(world)) {
    if (target.id === attacker.id) continue;
    if (warBetween(state, attacker.id, target.id)) continue;
    let w = 1;
    if (bordering(world, attacker, target)) w *= 3;
    else w *= 0.15;
    const stance = stanceBetween(attacker, target.id);
    if (stance === "rivalry") w *= 3;
    if (stance === "alliance") w *= 0.05;
    if (target.culture === attacker.culture) w *= 0.7;
    if (claimsAgainst.has(target.id)) w *= 4;
    if (feudingHouses(world, attacker, target)) w *= 2;
    if (w > 0.02) {
      candidates.push(target);
      weights.push(w);
    }
  }
  if (candidates.length === 0) return;
  const defender = rng.fork("pick").weighted(candidates, weights);
  const defRuler = livingPerson(world, defender.ruler);

  // Choose and voice the cause of war.
  const causes: EventId[] = [];
  let casus: string;
  const claimants = claimsAgainst.get(defender.id) ?? [];
  const feud = feudingHouses(world, attacker, defender);
  if (claimants.length > 0) {
    const claimant = world.people.get(claimants[0])!;
    casus = claimCasus(rng.fork("casus"), claimant.givenName, defender.name);
    // claim-pressed data: { polity: PolityId claimed, claimedBy: PersonId }
    const pressed = ctx.record({
      type: "claim-pressed",
      date: world.now,
      participants: { claimant: claimant.id, backer: ruler.id },
      data: { polity: defender.id, claimedBy: claimant.id },
      location: attacker.capital,
      region: world.settlements.get(attacker.capital)?.region ?? null,
      importance: 25,
      causes: [],
      storyline: null,
      secret: false,
    });
    causes.push(pressed.id);
  } else if (feud) {
    casus = feudCasus(rng.fork("casus"), feud[0], feud[1]);
  } else {
    const targetRegion = world.regions.get(defender.regions[0]);
    const demonym = world.cultures.get(attacker.culture)?.demonym ?? attacker.name;
    casus = conquestCasus(rng.fork("casus"), demonym, targetRegion?.name ?? defender.name);
  }

  const participants: Record<string, PersonId> = { attacker: ruler.id };
  if (defRuler) participants.defender = defRuler.id;
  // war-declared data: { attacker: PolityId, defender: PolityId, casus: string }
  const declared = ctx.record({
    type: "war-declared",
    date: world.now,
    participants,
    data: { attacker: attacker.id, defender: defender.id, casus },
    location: attacker.capital,
    region: world.settlements.get(attacker.capital)?.region ?? null,
    importance: 45,
    causes,
    storyline: null,
    secret: false,
  });

  setStance(attacker, defender, "war", world.now);
  polState(world).wars.push({
    id: polState(world).nextWarId++,
    attacker: attacker.id,
    defender: defender.id,
    began: world.now,
    declaredEvent: declared.id,
    score: 0,
    weariness: 0,
    battles: 0,
    lastBattle: world.now,
    lastBattleEvent: null,
    casus,
  });
}

/** First feud pair between houses of the two polities, as display names. */
function feudingHouses(world: World, a: Polity, b: Polity): [string, string] | null {
  const houseIds = [...world.houses.keys()].sort((x, y) => x - y);
  const polityOfHouse = (hid: number): PolityId | null => {
    const h = world.houses.get(hid);
    if (!h || h.seat == null) return null;
    return world.settlements.get(h.seat)?.polity ?? null;
  };
  for (const hid of houseIds) {
    if (polityOfHouse(hid) !== a.id) continue;
    const h = world.houses.get(hid)!;
    for (const fid of [...h.feuds.keys()].sort((x, y) => x - y)) {
      if ((h.feuds.get(fid) ?? 0) < 0.4) continue;
      if (polityOfHouse(fid) === b.id) {
        return [h.name, world.houses.get(fid)?.name ?? "an old enemy"];
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

function runCampaigns(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  const state = polState(world);
  // Iterate a snapshot: peace-making splices the live array.
  const wars = [...state.wars].sort((a, b) => a.id - b.id);
  for (const war of wars) {
    const attacker = world.polities.get(war.attacker);
    const defender = world.polities.get(war.defender);
    if (!attacker || !defender || attacker.regions.length === 0 || defender.regions.length === 0) {
      endWarQuietly(world, war);
      continue;
    }
    const wRng = rng.fork("war", war.id);
    war.weariness += 0.5;
    if (attacker.ruler === null) war.weariness += 1.5; // a headless realm bleeds resolve
    if (defender.ruler === null) war.score += 0.6;

    const monthsSince = world.now - war.lastBattle;
    const battleChance = monthsSince <= 1 ? 0 : clamp(0.12 + monthsSince * 0.06, 0, 0.5);
    if (wRng.fork("battle-gate").chance(battleChance)) {
      fightBattle(ctx, wRng.fork("battle", war.battles), war, attacker, defender);
    }

    if (Math.abs(war.score) >= DECISIVE_SCORE || war.weariness >= EXHAUSTION) {
      makePeace(ctx, wRng.fork("peace"), war, attacker, defender);
    }
  }
}

function endWarQuietly(world: World, war: WarState): void {
  const state = polState(world);
  state.wars = state.wars.filter((w) => w.id !== war.id);
  state.lastWarEnd[String(war.attacker)] = world.now;
  state.lastWarEnd[String(war.defender)] = world.now;
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

/** Those who can be made to stand in a shield line, ascending id. */
export function combatants(world: World, polity: Polity): Person[] {
  const out: Person[] = [];
  for (const id of livingIds(world)) {
    const p = world.people.get(id);
    if (!p || p.location == null) continue;
    const s = world.settlements.get(p.location);
    if (!s || s.polity !== polity.id) continue;
    const prof = p.status.profession;
    const soldierly = prof === "soldier" || prof === "guard";
    const nobleSword = p.status.rank >= 4 && isAdult(world, p) && p.personality.courage > -0.2;
    if (soldierly || nobleSword) out.push(p);
    if (out.length >= 400) break;
  }
  return out;
}

function marshalOf(world: World, polity: Polity): Person | null {
  return livingPerson(world, polity.court.get("marshal"));
}

function sideStrength(world: World, polity: Polity, rng: Rng, defending: boolean): number {
  let s = polity.prestige * 0.35;
  const marshal = marshalOf(world, polity);
  if (marshal) s += (marshal.phenotype.aptitudes["war"] ?? 0) * 7 + marshal.personality.courage * 3;
  const ruler = livingPerson(world, polity.ruler);
  if (ruler) s += Math.max(0, ruler.personality.courage) * 5;
  if (defending) s += 6;
  return s + rng.next() * 25;
}

function fightBattle(
  ctx: Ctx,
  rng: Rng,
  war: WarState,
  attacker: Polity,
  defender: Polity,
): void {
  const world = ctx.world;

  // Theater: a defender region on the border, else the defender heartland.
  const attackerRegions = new Set(attacker.regions);
  const border = defender.regions.filter((rid) => {
    const r = world.regions.get(rid);
    return r ? r.adjacent.some((adj) => attackerRegions.has(adj)) : false;
  });
  const theaterId: RegionId = (border.length > 0 ? border : defender.regions)[0];
  const theater = world.regions.get(theaterId);
  if (!theater || theater.settlements.length === 0) return;
  const site = world.settlements.get(rng.fork("site").pick([...theater.settlements].sort((a, b) => a - b)));
  if (!site) return;

  // Name the field. Sieges take the walls; open battles sometimes take a
  // nameless ford or meadow the chroniclers must christen.
  const walled = site.kind === "stronghold" || site.kind === "city" || site.kind === "town";
  const isSiege = walled && rng.fork("siege").chance(0.35);
  let placeName = site.name;
  if (!isSiege && rng.fork("fresh-name").chance(0.3)) {
    const lang = languageOfCulture(world, defender.culture);
    if (lang) placeName = ctx.services.language.placeName(rng.fork("field"), lang, "settlement");
  }
  const battleName = isSiege ? `Siege of ${placeName}` : `Battle of ${placeName}`;

  const atkStrength = sideStrength(world, attacker, rng.fork("atk"), false) - war.weariness * 0.08;
  const defStrength = sideStrength(world, defender, rng.fork("def"), true);
  const diff = atkStrength - defStrength;
  const outcome: "attacker" | "defender" | "draw" =
    diff > 8 ? "attacker" : diff < -8 ? "defender" : "draw";

  // The fallen: named people from both hosts, losers bleeding harder.
  const atkHost = combatants(world, attacker);
  const defHost = combatants(world, defender);
  const scale = isSiege ? 1 : 0.8;
  const atkLosses = rng.fork("atk-losses").intIn(0, outcome === "defender" ? 3 : outcome === "draw" ? 2 : 1);
  const defLosses = rng.fork("def-losses").intIn(outcome === "attacker" ? 1 : 0, outcome === "attacker" ? 3 : 2);
  const fallen: Person[] = [
    ...pickCasualties(rng.fork("atk-dead"), atkHost, Math.round(atkLosses * scale)),
    ...pickCasualties(rng.fork("def-dead"), defHost, Math.round(defLosses * scale)),
  ];

  // Commanders: the marshal leads, or the crown itself takes the field.
  const participants: Record<string, PersonId> = {};
  const atkCommander = marshalOf(world, attacker) ?? livingPerson(world, attacker.ruler);
  const defCommander = marshalOf(world, defender) ?? livingPerson(world, defender.ruler);
  if (atkCommander) participants.attackerCommander = atkCommander.id;
  if (defCommander) participants.defenderCommander = defCommander.id;

  const nobleFell = fallen.some((p) => p.status.rank >= 4);
  const battle = ctx.record({
    type: isSiege ? "siege" : "battle",
    date: world.now,
    participants,
    data: {
      name: battleName,
      attacker: attacker.id,
      defender: defender.id,
      outcome,
      fallen: fallen.map((p) => p.id),
      war: war.id,
    },
    location: site.id,
    region: theater.id,
    importance: clamp(38 + (isSiege ? 6 : 0) + (nobleFell ? 4 : 0), 35, 50),
    causes: [war.declaredEvent],
    storyline: null,
    secret: false,
  });

  for (const p of fallen) {
    ctx.services.people.kill(ctx, p, `fell in the ${battleName}`, { event: battle.id });
  }

  // A hero steps out of the shield-wall smoke.
  const winners = outcome === "attacker" ? atkHost : outcome === "defender" ? defHost : [];
  const standing = winners.filter((p) => p.died === null);
  if (standing.length > 0 && rng.fork("hero-gate").chance(0.3)) {
    const hero = rng.fork("hero").pick(standing);
    hero.flags[PF.warHero] = battle.id;
    const others = standing.filter((p) => p.id !== hero.id);
    if (others.length > 0 && rng.fork("rescue-gate").chance(0.5)) {
      const saved = rng.fork("saved").pick(others);
      // heroic-rescue data: { battle: string name, deed: string }
      ctx.record({
        type: "heroic-rescue",
        date: world.now,
        participants: { subject: hero.id, saved: saved.id },
        data: {
          battle: battleName,
          deed: rng.fork("deed").pick([
            "dragged a fallen shieldmate from under the press of spears",
            "held the broken gate alone until help came",
            "carried the standard through the rout unbowed",
          ]),
        },
        location: site.id,
        region: theater.id,
        importance: 20,
        causes: [battle.id],
        storyline: null,
        secret: false,
      });
    }
  }

  // Ledger.
  const swing = 10 + rng.fork("swing").int(6);
  if (outcome === "attacker") war.score += swing;
  else if (outcome === "defender") war.score -= swing;
  else war.score += war.score > 0 ? -2 : 2;
  war.weariness += rng.fork("weary").intIn(6, 11);
  war.battles += 1;
  war.lastBattle = world.now;
  war.lastBattleEvent = battle.id;
  if (outcome === "attacker") {
    attacker.prestige += 2;
    defender.prestige = Math.max(0, defender.prestige - 2);
  } else if (outcome === "defender") {
    defender.prestige += 2;
    attacker.prestige = Math.max(0, attacker.prestige - 2);
  }
}

/** Weighted draw without replacement: the line soldier dies oftener than the lord. */
function pickCasualties(rng: Rng, host: Person[], n: number): Person[] {
  const pool = host.filter((p) => p.died === null);
  const out: Person[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const weights = pool.map((p) => (p.status.rank >= 4 ? 1 : 3));
    const chosen = rng.fork("pick", i).weighted(pool, weights);
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Peace
// ---------------------------------------------------------------------------

function makePeace(
  ctx: Ctx,
  rng: Rng,
  war: WarState,
  attacker: Polity,
  defender: Polity,
): void {
  const world = ctx.world;
  const decisive = Math.abs(war.score) >= DECISIVE_SCORE;
  const attackerWon = war.score > 0;
  const victor = decisive ? (attackerWon ? attacker : defender) : null;
  const loser = decisive ? (attackerWon ? defender : attacker) : null;

  let outcome: "conquest" | "tribute" | "white-peace" = "white-peace";
  let regionTaken: RegionId | null = null;
  let terms: string;

  if (victor && loser && loser.regions.length >= 2) {
    outcome = "conquest";
    regionTaken = pickSpoils(world, victor, loser);
    transferRegion(world, regionTaken, loser, victor);
    const regionName = world.regions.get(regionTaken)?.name ?? "the marches";
    terms = `the ${regionName} passes under the banners of ${victor.name}`;
  } else if (victor && loser) {
    outcome = "tribute";
    terms = tributeFlavor(rng.fork("tribute"));
  } else {
    terms = "both hosts limp home; the border stands where it stood";
  }

  const participants: Record<string, PersonId> = {};
  const vRuler = victor ? livingPerson(world, victor.ruler) : null;
  const lRuler = loser ? livingPerson(world, loser.ruler) : null;
  if (vRuler) participants.victor = vRuler.id;
  if (lRuler) participants.vanquished = lRuler.id;
  if (!victor) {
    const aRuler = livingPerson(world, attacker.ruler);
    const dRuler = livingPerson(world, defender.ruler);
    if (aRuler) participants.a = aRuler.id;
    if (dRuler) participants.b = dRuler.id;
  }

  const causes: EventId[] = [war.declaredEvent];
  if (war.lastBattleEvent !== null) causes.push(war.lastBattleEvent);
  // peace-made data: { attacker, defender: PolityId, outcome: "conquest" |
  //   "tribute" | "white-peace", terms: string, regionTaken?, regionName? }
  const peace = ctx.record({
    type: "peace-made",
    date: world.now,
    participants,
    data: {
      attacker: attacker.id,
      defender: defender.id,
      outcome,
      terms,
      war: war.id,
      ...(regionTaken !== null
        ? { regionTaken, regionName: world.regions.get(regionTaken)?.name ?? "" }
        : {}),
    },
    location: (victor ?? attacker).capital,
    region: world.settlements.get((victor ?? attacker).capital)?.region ?? null,
    importance: 40,
    causes,
    storyline: null,
    secret: false,
  });

  if (victor && loser) {
    victor.prestige += 12;
    loser.prestige = Math.max(0, loser.prestige - 8);
  }
  // Peace with teeth: the defeated remember.
  setStance(attacker, defender, "rivalry", world.now);
  endWarQuietly(world, war);

  // Conquerors are named for it, once.
  if (outcome === "conquest" && vRuler && vRuler.epithet === "" && rng.fork("epithet-gate").chance(0.4)) {
    const lang = languageOfCulture(world, vRuler.culture);
    if (lang) {
      const epithet = ctx.services.language.epithet(rng.fork("epithet"), lang, "conqueror");
      vRuler.epithet = epithet;
      ctx.record({
        type: "nickname-earned",
        date: world.now,
        participants: { subject: vRuler.id },
        data: { epithet, reason: `took the war to ${loser!.name} and won` },
        location: victor!.capital,
        region: world.settlements.get(victor!.capital)?.region ?? null,
        importance: 18,
        causes: [peace.id],
        storyline: null,
        secret: false,
      });
    }
  }
}

/** The loser region most exposed to the victor; ties break low. */
function pickSpoils(world: World, victor: Polity, loser: Polity): RegionId {
  const victorRegions = new Set(victor.regions);
  const scored = loser.regions.map((rid) => {
    const r = world.regions.get(rid);
    const exposed = r ? r.adjacent.filter((a) => victorRegions.has(a)).length : 0;
    const isCapitalRegion = r ? r.settlements.includes(loser.capital) : false;
    return { rid, score: exposed * 10 - (isCapitalRegion ? 100 : 0) };
  });
  scored.sort((a, b) => b.score - a.score || a.rid - b.rid);
  return scored[0].rid;
}

export function transferRegion(world: World, rid: RegionId, from: Polity, to: Polity): void {
  from.regions = from.regions.filter((r) => r !== rid);
  if (!to.regions.includes(rid)) to.regions.push(rid);
  const region = world.regions.get(rid);
  if (region) {
    for (const sid of region.settlements) {
      const s = world.settlements.get(sid);
      if (s) s.polity = to.id;
    }
  }
  // The loser's capital may not stand on ceded soil.
  const capital = world.settlements.get(from.capital);
  if (capital && capital.polity !== from.id) {
    let best: number | null = null;
    let bestPop = -1;
    for (const r of from.regions) {
      const reg = world.regions.get(r);
      if (!reg) continue;
      for (const sid of reg.settlements) {
        const s = world.settlements.get(sid);
        if (s && (s.abstractPop > bestPop || (s.abstractPop === bestPop && (best === null || sid < best)))) {
          bestPop = s.abstractPop;
          best = sid;
        }
      }
    }
    if (best !== null) from.capital = best;
  }
}

/** Test/story hook: open a war between two polities right now. */
export function declareWar(
  ctx: Ctx,
  attacker: Polity,
  defender: Polity,
  casus = "old grievances found new blood",
): WarState {
  const world = ctx.world;
  const aRuler = livingPerson(world, attacker.ruler);
  const dRuler = livingPerson(world, defender.ruler);
  const participants: Record<string, PersonId> = {};
  if (aRuler) participants.attacker = aRuler.id;
  if (dRuler) participants.defender = dRuler.id;
  const declared = ctx.record({
    type: "war-declared",
    date: world.now,
    participants,
    data: { attacker: attacker.id, defender: defender.id, casus },
    location: attacker.capital,
    region: world.settlements.get(attacker.capital)?.region ?? null,
    importance: 45,
    causes: [],
    storyline: null,
    secret: false,
  });
  setStance(attacker, defender, "war", world.now);
  const state = polState(world);
  const war: WarState = {
    id: state.nextWarId++,
    attacker: attacker.id,
    defender: defender.id,
    began: world.now,
    declaredEvent: declared.id,
    score: 0,
    weariness: 0,
    battles: 0,
    lastBattle: world.now,
    lastBattleEvent: null,
    casus,
  };
  state.wars.push(war);
  return war;
}
