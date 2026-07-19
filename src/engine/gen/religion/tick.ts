/**
 * Monthly religious observances. Kept deliberately low-volume:
 *
 *  - Festivals: on a holy-day month, ONE "festival" event per polity, with a
 *    couple of deterministically chosen pious/notable locals. Occasionally a
 *    festival throws off a story hook (a quarrel, a betrothal spark, a
 *    miracle claimed) recorded as a single caused event.
 *  - Omens: rare, roughly one per polity every 2-4 years, scaled by culture
 *    mysticism and zeal, more under comet or plague, read against current
 *    anxieties (war, famine, plague, an empty high seat).
 *  - Miracles: very rare, at temples or through the Sighted.
 *  - Temples: very rare, in prosperous settlements.
 *
 * Heresy arcs are NOT run here; the story module drives them via schism().
 */

import type {
  Ctx,
  Culture,
  EventRecord,
  Person,
  PersonId,
  Polity,
  PolityId,
  Religion,
  Settlement,
  SettlementId,
  World,
} from "../../core/types";
import type { Rng } from "../../core/rng";
import { monthOf, yearsBetween } from "../../core/time";
import { livingIds, sortedIds } from "../../core/world";
import {
  DOMAIN_BY_KEY,
  OMEN_READINGS,
  OMEN_SIGNS,
  QUARREL_TOPICS,
  SIGHTED_MIRACLES,
  TEMPLE_DEDICATION_PATTERNS,
  TEMPLE_MIRACLES,
  type OmenAnxiety,
} from "./pools";
import { fillTokens } from "./generate";

/** Cap on residents gathered per polity; keeps the monthly scan bounded. */
const RESIDENT_SCAN_CAP = 800;

interface PolityScope {
  polity: Polity;
  religion: Religion;
  culture: Culture | null;
  settlements: SettlementId[];
  /** Living residents in ascending person-id order (bounded). */
  residents: PersonId[];
}

export function religionTick(ctx: Ctx): void {
  const world = ctx.world;
  if (world.polities.size === 0 || world.religions.size === 0) return;
  const rng = ctx.rng.fork("religion");
  const scopes = gatherScopes(world);

  for (const scope of scopes) {
    const pid = scope.polity.id;
    const month = monthOf(world.now);
    const holy = scope.religion.holyDays.find((h) => h.month === month);
    if (holy && scope.settlements.length > 0) {
      holdFestival(ctx, rng.fork("festival", pid), scope, holy.name, holy.theme);
    }
    if (scope.settlements.length > 0) {
      maybeOmen(ctx, rng.fork("omen", pid), scope);
      maybeMiracle(ctx, rng.fork("miracle", pid), scope);
    }
  }

  maybeRaiseTemples(ctx, rng.fork("temple"));
}

// ---------------------------------------------------------------------------
// Shared gathering (one bounded pass per tick)
// ---------------------------------------------------------------------------

function gatherScopes(world: World): PolityScope[] {
  const settlementsOf = new Map<PolityId, SettlementId[]>();
  const polityOfSettlement = new Map<SettlementId, PolityId>();
  for (const sid of sortedIds(world.settlements)) {
    const s = world.settlements.get(sid)!;
    polityOfSettlement.set(sid, s.polity);
    const list = settlementsOf.get(s.polity);
    if (list) list.push(sid);
    else settlementsOf.set(s.polity, [sid]);
  }

  const residentsOf = new Map<PolityId, PersonId[]>();
  for (const personId of livingIds(world)) {
    const p = world.people.get(personId);
    if (!p || p.location == null) continue;
    const pid = polityOfSettlement.get(p.location);
    if (pid == null) continue;
    const list = residentsOf.get(pid);
    if (list) {
      if (list.length < RESIDENT_SCAN_CAP) list.push(personId);
    } else {
      residentsOf.set(pid, [personId]);
    }
  }

  const scopes: PolityScope[] = [];
  for (const pid of sortedIds(world.polities)) {
    const polity = world.polities.get(pid)!;
    const religion = world.religions.get(polity.religion);
    if (!religion) continue;
    scopes.push({
      polity,
      religion,
      culture: world.cultures.get(polity.culture) ?? null,
      settlements: settlementsOf.get(pid) ?? [],
      residents: residentsOf.get(pid) ?? [],
    });
  }
  return scopes;
}

function ageOf(world: World, p: Person): number {
  return yearsBetween(p.born, world.now);
}

function isPriestly(p: Person): boolean {
  return p.status.profession === "priest" || p.status.profession === "monastic";
}

/**
 * The polity's devout: living adult adherents ranked by piety, notability
 * and holy profession, with rng jitter so the chosen faces rotate across the
 * years instead of the same clique absorbing every feast. Iteration is in
 * ascending person-id order with one draw per candidate, so it is stable.
 * Falls back to any adult resident when the faith has few local adherents.
 */
function devoutPool(world: World, scope: PolityScope, size: number, rng: Rng): Person[] {
  const adulthood = scope.culture?.adulthoodAge ?? 15;
  const adults: Person[] = [];
  const adherents: Person[] = [];
  for (const id of scope.residents) {
    const p = world.people.get(id);
    if (!p || p.died !== null) continue;
    if (ageOf(world, p) < adulthood) continue;
    adults.push(p);
    if (p.religion === scope.religion.id) adherents.push(p);
  }
  const base = adherents.length >= 4 ? adherents : adults;
  const scored = base.map((p) => ({
    p,
    s:
      p.personality.piety * 2 +
      Math.min(1, p.notability / 120) +
      (isPriestly(p) ? 1.5 : 0) +
      rng.next() * 1.2,
  }));
  scored.sort((a, b) => b.s - a.s || a.p.id - b.p.id);
  return scored.slice(0, size).map((e) => e.p);
}

function festivalSite(world: World, scope: PolityScope): Settlement {
  const capital = world.settlements.get(scope.polity.capital);
  if (capital && scope.settlements.includes(capital.id)) return capital;
  return world.settlements.get(scope.settlements[0])!;
}

// ---------------------------------------------------------------------------
// Festivals
// ---------------------------------------------------------------------------

function holdFestival(
  ctx: Ctx,
  rng: Rng,
  scope: PolityScope,
  holyDayName: string,
  theme: string,
): void {
  const world = ctx.world;
  const site = festivalSite(world, scope);
  const pool = devoutPool(world, scope, 24, rng.fork("pool"));
  if (pool.length === 0) return;

  // Priests usually lead, but not always; a lay elder sometimes takes the rite.
  const officiant = rng
    .fork("officiant")
    .weighted(pool, pool.map((p) => (isPriestly(p) ? 6 : 1)));
  const others = pool.filter((p) => p.id !== officiant.id);
  const participants: Record<string, PersonId> = { officiant: officiant.id };
  const extras = Math.min(others.length, rng.fork("extras").intIn(1, 2));
  const chosen = rng.fork("celebrants").pickN(others, extras);
  if (chosen.length > 0) participants.celebrant = chosen[0].id;
  if (chosen.length > 1) participants.guest = chosen[1].id;

  const festival = ctx.record({
    type: "festival",
    date: world.now,
    participants,
    // { religion, holyDay, theme, polity } — which feast, whose calendar.
    data: {
      religion: scope.religion.id,
      holyDay: holyDayName,
      theme,
      polity: scope.polity.id,
    },
    location: site.id,
    region: site.region,
    importance: rng.fork("importance").intIn(4, 8),
    causes: [],
    storyline: null,
    secret: false,
  });

  // Occasionally the feast leaves more than crumbs behind.
  const hookRng = rng.fork("hook");
  if (!hookRng.chance(0.09 + 0.09 * scope.religion.zeal)) return;
  const kind = hookRng.fork("kind").weightedPairs([
    ["quarrel", 4.5],
    ["spark", 3.5],
    ["miracle", 1.5],
  ] as const);
  if (kind === "quarrel") festivalQuarrel(ctx, hookRng.fork("quarrel"), scope, site, pool, festival);
  else if (kind === "spark") betrothalSpark(ctx, hookRng.fork("spark"), scope, site, festival);
  else festivalMiracle(ctx, hookRng.fork("miracle"), scope, site, officiant, festival);
}

function festivalQuarrel(
  ctx: Ctx,
  rng: Rng,
  scope: PolityScope,
  site: Settlement,
  pool: Person[],
  festival: EventRecord,
): void {
  if (pool.length < 2) return;
  // The hot-tempered find each other in a crowd.
  const heated = pool
    .map((p) => ({ p, s: p.personality.volatility + p.personality.wrath + rng.next() * 0.4 }))
    .sort((a, b) => b.s - a.s || a.p.id - b.p.id)
    .slice(0, 5)
    .map((e) => e.p);
  const two = rng.fork("pair").pickN(heated, 2);
  if (two.length < 2) return;
  ctx.record({
    type: "quarrel",
    date: ctx.world.now,
    participants: { instigator: two[0].id, target: two[1].id },
    // { over } — what the shouting was about.
    data: { over: rng.fork("topic").pick(QUARREL_TOPICS) },
    location: site.id,
    region: site.region,
    importance: rng.fork("importance").intIn(9, 13),
    causes: [festival.id],
    storyline: null,
    secret: false,
  });
}

function betrothalSpark(
  ctx: Ctx,
  rng: Rng,
  scope: PolityScope,
  site: Settlement,
  festival: EventRecord,
): void {
  const world = ctx.world;
  const minF = scope.culture?.marriageAgeF ?? 16;
  const minM = scope.culture?.marriageAgeM ?? 18;
  const eligible = (p: Person, minAge: number): boolean => {
    const age = ageOf(world, p);
    return (
      age >= minAge &&
      age <= minAge + 18 &&
      p.betrothed === null &&
      p.marriages.every((m) => !m.active)
    );
  };
  const women: Person[] = [];
  const men: Person[] = [];
  for (const id of scope.residents) {
    const p = world.people.get(id);
    if (!p || p.died !== null) continue;
    if (p.sex === "f" && eligible(p, minF)) women.push(p);
    else if (p.sex === "m" && eligible(p, minM)) men.push(p);
    if (women.length >= 20 && men.length >= 20) break;
  }
  if (women.length === 0 || men.length === 0) return;
  const a = rng.fork("her").pick(women);
  const bPool = men.filter(
    (m) =>
      m.id !== a.id &&
      !(m.father !== null && m.father === a.father) &&
      !(m.mother !== null && m.mother === a.mother) &&
      m.father !== a.id &&
      m.mother !== a.id &&
      a.father !== m.id &&
      a.mother !== m.id,
  );
  if (bPool.length === 0) return;
  const b = rng.fork("him").pick(bPool);
  ctx.record({
    type: "romance-began",
    date: world.now,
    participants: { lover: a.id, beloved: b.id },
    // { spark, holyDay } — kindled at the feast.
    data: { spark: "festival", holyDay: String(festival.data.holyDay ?? "") },
    location: site.id,
    region: site.region,
    importance: rng.fork("importance").intIn(8, 11),
    causes: [festival.id],
    storyline: null,
    secret: false,
  });
}

function festivalMiracle(
  ctx: Ctx,
  rng: Rng,
  scope: PolityScope,
  site: Settlement,
  officiant: Person,
  festival: EventRecord,
): void {
  const chief = scope.religion.deities[0];
  ctx.record({
    type: "miracle-claimed",
    date: ctx.world.now,
    participants: { witness: officiant.id },
    // { description, deity } — the tale as told by nightfall.
    data: {
      description: fillTokens(rng.fork("tale").pick(TEMPLE_MIRACLES), {
        chief: chief?.name,
        clergy: scope.religion.clergyTitle,
      }),
      deity: chief?.name ?? null,
    },
    location: site.id,
    region: site.region,
    importance: rng.fork("importance").intIn(16, 22),
    causes: [festival.id],
    storyline: null,
    secret: false,
  });
}

// ---------------------------------------------------------------------------
// Omens
// ---------------------------------------------------------------------------

function polityAtWar(polity: Polity): boolean {
  for (const rel of polity.relations.values()) {
    if (rel.stance === "war") return true; // boolean OR, order-independent
  }
  return false;
}

function currentAnxieties(world: World, scope: PolityScope): OmenAnxiety[] {
  const out: OmenAnxiety[] = [];
  const plagueAbroad = Boolean(world.conditions["plague"]);
  let famine = false;
  let plagueLocal = false;
  for (const sid of scope.settlements) {
    const s = world.settlements.get(sid);
    if (!s) continue;
    if (s.conditions["famine"]) famine = true;
    if (s.conditions["plague"]) plagueLocal = true;
  }
  if (plagueAbroad || plagueLocal) out.push("plague");
  if (famine) out.push("famine");
  if (polityAtWar(scope.polity)) out.push("war");
  if (scope.polity.ruler === null) out.push("succession");
  else {
    const ruler = world.people.get(scope.polity.ruler);
    if (ruler && ruler.children.length === 0 && ageOf(world, ruler) > 45) out.push("succession");
  }
  return out;
}

function maybeOmen(ctx: Ctx, rng: Rng, scope: PolityScope): void {
  const world = ctx.world;
  const mysticism = scope.culture?.attitudes.mysticism ?? 0.5;
  // Expected roughly once per 2-4 years per polity at ordinary mysticism.
  let p = (0.5 + mysticism) / 36;
  if (world.conditions["comet"]) p *= 2.5;
  if (world.conditions["plague"]) p *= 2;
  p *= 0.7 + 0.6 * scope.religion.zeal;
  if (!rng.fork("roll").chance(p)) return;

  const sid = rng.fork("where").pick(scope.settlements);
  const site = world.settlements.get(sid)!;

  const chief = scope.religion.deities[0];
  const signPool = [...OMEN_SIGNS];
  if (chief) {
    for (const key of chief.domains) {
      const flavor = DOMAIN_BY_KEY.get(key);
      if (flavor) signPool.push(...flavor.signs);
    }
  }
  const sign = rng.fork("sign").pick(signPool);

  const anxieties = currentAnxieties(world, scope);
  const anxiety: OmenAnxiety =
    anxieties.length > 0 ? rng.fork("anxiety").pick(anxieties) : "generic";
  const interpretation = fillTokens(rng.fork("reading").pick(OMEN_READINGS[anxiety]), {
    chief: chief?.name,
    clergy: scope.religion.clergyTitle,
  });

  // A witness, when one suits: the Sighted first, then the priestly.
  const participants: Record<string, PersonId> = {};
  const witness = findWitness(world, scope, sid);
  if (witness !== null) participants.witness = witness;

  const grave = anxiety === "war" || anxiety === "plague";
  ctx.record({
    type: "omen",
    date: world.now,
    participants,
    // { sign, interpretation } — canonical omen payload.
    data: { sign, interpretation },
    location: sid,
    region: site.region,
    importance: rng.fork("importance").intIn(6, 10) + (grave ? 2 : 0),
    causes: [],
    storyline: null,
    secret: false,
  });
}

function findWitness(world: World, scope: PolityScope, sid: SettlementId): PersonId | null {
  let priestly: PersonId | null = null;
  let scanned = 0;
  for (const id of scope.residents) {
    if (scanned++ > 600) break;
    const p = world.people.get(id);
    if (!p || p.died !== null || p.location !== sid) continue;
    if (p.phenotype.rareTraits.includes("the-sight")) return p.id;
    if (priestly === null && isPriestly(p)) priestly = p.id;
  }
  return priestly;
}

// ---------------------------------------------------------------------------
// Miracles (outside festivals)
// ---------------------------------------------------------------------------

function templeSettlement(world: World, scope: PolityScope): Settlement | null {
  for (const sid of scope.settlements) {
    const s = world.settlements.get(sid);
    if (!s) continue;
    if (s.kind === "temple-town" || s.conditions["religion.temple"]) return s;
  }
  return null;
}

function maybeMiracle(ctx: Ctx, rng: Rng, scope: PolityScope): void {
  const world = ctx.world;
  const temple = templeSettlement(world, scope);
  let p = (0.5 + scope.religion.zeal) / 240;
  if (temple) p *= 1.6;
  if (!rng.fork("roll").chance(p)) return;

  // Deterministic bounded scan for the Sighted among residents.
  const sighted: Person[] = [];
  let scanned = 0;
  for (const id of scope.residents) {
    if (scanned++ > 600) break;
    const person = world.people.get(id);
    if (!person || person.died !== null || person.location === null) continue;
    if (person.phenotype.rareTraits.includes("the-sight")) sighted.push(person);
  }

  const chief = scope.religion.deities[0];
  const useSighted = sighted.length > 0 && rng.fork("path").chance(0.55);
  let site: Settlement;
  const participants: Record<string, PersonId> = {};
  let description: string;
  if (useSighted) {
    const vessel = rng.fork("vessel").pick(sighted);
    participants.vessel = vessel.id;
    site = world.settlements.get(vessel.location!) ?? festivalSite(world, scope);
    description = rng.fork("tale").pick(SIGHTED_MIRACLES);
  } else {
    site = temple ?? festivalSite(world, scope);
    const pool = devoutPool(world, scope, 8, rng.fork("pool"));
    if (pool.length > 0) participants.witness = rng.fork("witness").pick(pool).id;
    description = fillTokens(rng.fork("tale").pick(TEMPLE_MIRACLES), {
      chief: chief?.name,
      clergy: scope.religion.clergyTitle,
    });
  }

  ctx.record({
    type: "miracle-claimed",
    date: world.now,
    participants,
    // { description, deity } — the tale as told by nightfall.
    data: { description, deity: chief?.name ?? null },
    location: site.id,
    region: site.region,
    importance: rng.fork("importance").intIn(15, 24),
    causes: [],
    storyline: null,
    secret: false,
  });
}

// ---------------------------------------------------------------------------
// Temples
// ---------------------------------------------------------------------------

function maybeRaiseTemples(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  for (const sid of sortedIds(world.settlements)) {
    const s = world.settlements.get(sid)!;
    if (s.kind === "temple-town" || s.conditions["religion.temple"]) continue;
    if (s.abstractPop < 450) continue;
    const polity = world.polities.get(s.polity);
    if (!polity) continue;
    const religion = world.religions.get(polity.religion);
    if (!religion) continue;
    const sRng = rng.fork(sid);
    const p = ((0.5 + religion.zeal) / 720) * (s.abstractPop >= 900 ? 1.5 : 1);
    if (!sRng.fork("roll").chance(p)) continue;

    s.conditions["religion.temple"] = true;
    const chief = religion.deities[0];
    const dedication = fillTokens(sRng.fork("dedication").pick(TEMPLE_DEDICATION_PATTERNS), {
      chief: chief?.name ?? religion.name,
    });
    ctx.record({
      type: "temple-built",
      date: world.now,
      participants: {},
      // { religion, dedication } — whose faith, and in whose honor.
      data: { religion: religion.id, dedication },
      location: sid,
      region: s.region,
      importance: sRng.fork("importance").intIn(13, 18),
      causes: [],
      storyline: null,
      secret: false,
    });
  }
}
