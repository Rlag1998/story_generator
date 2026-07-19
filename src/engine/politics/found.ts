/**
 * Worldgen founding: carve each culture's regions into realms, raise ruling
 * and noble houses with real pedigrees (rulers arrive with grown heirs whose
 * parent links are wired, so the succession walker works from year one),
 * seat courts, and knit founding marriages. Founders record no events; all
 * of this is the world's unwritten past.
 */

import type { Rng } from "../core/rng";
import type {
  Culture,
  CultureId,
  House,
  HouseId,
  Language,
  Person,
  PersonId,
  Polity,
  PolityId,
  RegionId,
  Religion,
  Services,
  SettlementId,
  Sex,
  SuccessionLaw,
  World,
} from "../core/types";
import { nextId, sortedIds } from "../core/world";
import { PF, isClanCulture, lordTitle, setStance } from "./helpers";
import { courtRoles, makeMotto, rulerTitlePair } from "./prose";

// ---------------------------------------------------------------------------
// Region ownership: reconstruct the engine's geographic culture bands.
// Regions are assigned to cultures in creation order, the same interleaving
// the engine used to name them and seed their settlements.
// ---------------------------------------------------------------------------

export function regionsByCulture(world: World): Map<CultureId, RegionId[]> {
  const regionIds = sortedIds(world.regions);
  const cultureIds = sortedIds(world.cultures);
  const out = new Map<CultureId, RegionId[]>();
  for (const cid of cultureIds) out.set(cid, []);
  if (cultureIds.length === 0) return out;
  for (let i = 0; i < regionIds.length; i++) {
    const idx = Math.min(
      cultureIds.length - 1,
      Math.floor((i * cultureIds.length) / regionIds.length),
    );
    out.get(cultureIds[idx])!.push(regionIds[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Founding
// ---------------------------------------------------------------------------

export function found(rng: Rng, world: World, services: Services): void {
  const byCulture = regionsByCulture(world);
  const polities: Polity[] = [];

  for (const cultureId of sortedIds(world.cultures)) {
    const culture = world.cultures.get(cultureId)!;
    const religion = religionOfCulture(world, cultureId);
    const lang = world.languages.get(culture.language) ?? null;
    const regions = byCulture.get(cultureId) ?? [];
    if (regions.length === 0 || !lang) continue;

    const cRng = rng.fork("culture", cultureId);
    for (const group of partitionRegions(cRng.fork("partition"), regions)) {
      const polity = foundPolity(cRng.fork("polity", group[0]), world, services, {
        culture,
        religion,
        lang,
        regions: group,
      });
      polities.push(polity);
    }
  }

  // Opening stances: peace everywhere, save where conquering neighbors eye
  // each other across a border from the first day.
  for (let i = 0; i < polities.length; i++) {
    for (let j = i + 1; j < polities.length; j++) {
      const a = polities[i];
      const b = polities[j];
      setStance(a, b, "peace", world.now);
      const ca = world.cultures.get(a.culture);
      const cb = world.cultures.get(b.culture);
      const warlike =
        (ca?.values.includes("conquest") ?? false) || (cb?.values.includes("conquest") ?? false);
      if (a.culture !== b.culture && warlike && rng.fork("stance", a.id, b.id).chance(0.3)) {
        setStance(a, b, "rivalry", world.now);
      }
    }
  }
}

function religionOfCulture(world: World, cultureId: CultureId): Religion | null {
  for (const rid of sortedIds(world.religions)) {
    const r = world.religions.get(rid)!;
    if (r.origin === cultureId) return r;
  }
  const first = sortedIds(world.religions)[0];
  return first != null ? (world.religions.get(first) ?? null) : null;
}

/** 1-2 contiguous-ish groups per culture; big holdings sometimes split. */
function partitionRegions(rng: Rng, regions: RegionId[]): RegionId[][] {
  if (regions.length >= 3 && rng.chance(0.55)) {
    const cut = rng.intIn(1, regions.length - 1);
    return [regions.slice(0, cut), regions.slice(cut)];
  }
  if (regions.length === 2 && rng.chance(0.3)) {
    return [[regions[0]], [regions[1]]];
  }
  return [regions];
}

interface FoundOpts {
  culture: Culture;
  religion: Religion | null;
  lang: Language;
  regions: RegionId[];
}

function foundPolity(rng: Rng, world: World, services: Services, opts: FoundOpts): Polity {
  const { culture, religion, lang, regions } = opts;
  const id = nextId(world, "polity") as PolityId;

  const kind = chooseKind(rng.fork("kind"), world, culture, religion, regions);
  const [titleM, titleF] = rulerTitlePair(rng.fork("titles"), kind, culture, religion);
  const succession = chooseSuccessionLaw(rng.fork("law"), kind, culture);
  const capital = chooseCapital(world, regions);
  const name = services.language.placeName(rng.fork("name"), lang, "polity");

  const polity: Polity = {
    id,
    name,
    kind,
    capital,
    regions: [...regions],
    ruler: null,
    rulerTitleM: titleM,
    rulerTitleF: titleF,
    rulingHouse: null,
    succession,
    founded: world.now,
    reigns: [],
    relations: new Map(),
    court: new Map(),
    prestige: 25 + regions.length * 12 + (kind === "kingdom" ? 8 : 0) + rng.fork("prestige").int(10),
    culture: culture.id,
    religion: religion?.id ?? sortedIds(world.religions)[0] ?? 1,
  };
  world.polities.set(id, polity);

  // Every settlement inside the borders swears to the new realm.
  const seats: SettlementId[] = [];
  for (const rid of regions) {
    const region = world.regions.get(rid);
    if (!region) continue;
    for (const sid of region.settlements) {
      const s = world.settlements.get(sid);
      if (s) {
        s.polity = id;
        seats.push(sid);
      }
    }
  }
  // Noble seats: grandest first, capital reserved for the crown.
  seats.sort((a, b) => {
    const sa = world.settlements.get(a)!;
    const sb = world.settlements.get(b)!;
    return sb.abstractPop - sa.abstractPop || a - b;
  });
  const nobleSeats = seats.filter((s) => s !== capital);

  // The ruling house.
  const ruling = foundHouse(rng.fork("ruling-house"), world, services, {
    polity,
    culture,
    religion,
    lang,
    seat: capital,
    ruling: true,
  });
  polity.rulingHouse = ruling.house.id;
  polity.ruler = ruling.head.id;
  ruling.head.status.profession = "ruler";
  ruling.head.status.titles.push(
    `${ruling.head.sex === "f" ? titleF : titleM} of ${polity.name}`,
  );
  polity.reigns.push({ ruler: ruling.head.id, from: world.now, to: null });

  // Two to four noble houses, seated in the best remaining halls.
  const nNoble = rng.fork("noble-count").intIn(2, 4);
  const households = [ruling];
  for (let n = 0; n < nNoble; n++) {
    const seat = nobleSeats.length > 0 ? nobleSeats[n % nobleSeats.length] : capital;
    households.push(
      foundHouse(rng.fork("noble-house", n), world, services, {
        polity,
        culture,
        religion,
        lang,
        seat,
        ruling: false,
      }),
    );
  }

  seatCourt(rng.fork("court"), world, services, polity, culture, households);
  knitFoundingMarriages(rng.fork("knit"), world, households);
  return polity;
}

type MinorKind = "principality" | "chiefdom" | "city-league" | "theocracy";

function chooseKind(
  rng: Rng,
  world: World,
  culture: Culture,
  religion: Religion | null,
  regions: RegionId[],
): Polity["kind"] {
  if (regions.length >= 2) return "kingdom";
  const weights: [MinorKind, number][] = [];
  let theocracy = (religion?.zeal ?? 0.3) >= 0.55 ? 2.2 : 0.25;
  if (culture.values.includes("piety")) theocracy *= 1.6;
  let league = 0.3;
  if (culture.values.includes("trade")) league += 1.6;
  if (culture.values.includes("seafaring")) league += 1.0;
  const capital = world.settlements.get(chooseCapital(world, regions));
  if (capital && (capital.kind === "port" || capital.kind === "city")) league += 0.8;
  let chiefdom = 0.4;
  if (culture.values.includes("kinship")) chiefdom += 1.0;
  if (culture.values.includes("conquest")) chiefdom += 1.2;
  if (culture.values.includes("vengeance")) chiefdom += 0.6;
  let principality = 0.9;
  if (culture.values.includes("learning") || culture.values.includes("artistry")) {
    principality += 0.8;
  }
  weights.push(["theocracy", theocracy]);
  weights.push(["city-league", league]);
  weights.push(["chiefdom", chiefdom]);
  weights.push(["principality", principality]);
  return rng.weightedPairs(weights);
}

export function chooseSuccessionLaw(rng: Rng, kind: Polity["kind"], culture: Culture): SuccessionLaw {
  if (kind === "city-league") return "elective-council";
  if (kind === "theocracy") return "divine-lot";
  if (culture.inheritance === "elective") return "elective-council";
  if (culture.inheritance === "seniority" && rng.chance(0.75)) return "seniority";
  if (culture.descent === "matrilineal") return "female-primogeniture";
  const patriarchy = culture.attitudes.patriarchy;
  if (patriarchy >= 0.65) return "male-primogeniture";
  if (patriarchy <= 0.35) return "absolute-primogeniture";
  if (rng.chance(0.12)) return "seniority";
  return rng.chance(patriarchy) ? "male-primogeniture" : "absolute-primogeniture";
}

function chooseCapital(world: World, regions: RegionId[]): SettlementId {
  let best: SettlementId | null = null;
  let bestScore = -1;
  for (const rid of regions) {
    const region = world.regions.get(rid);
    if (!region) continue;
    for (const sid of region.settlements) {
      const s = world.settlements.get(sid);
      if (!s) continue;
      const kindBonus =
        s.kind === "city" ? 400 : s.kind === "town" || s.kind === "stronghold" ? 200 : s.kind === "port" ? 150 : 0;
      const score = s.abstractPop + kindBonus;
      if (score > bestScore || (score === bestScore && (best === null || sid < best))) {
        bestScore = score;
        best = sid;
      }
    }
  }
  if (best === null) throw new Error("politics.found: polity with no settlements");
  return best;
}

// ---------------------------------------------------------------------------
// Houses and their founding families
// ---------------------------------------------------------------------------

interface Household {
  house: House;
  head: Person;
  consort: Person | null;
  /** Adult blood kin (children of the head, siblings) available for court. */
  kin: Person[];
}

interface HouseOpts {
  polity: Polity;
  culture: Culture;
  religion: Religion | null;
  lang: Language;
  seat: SettlementId;
  ruling: boolean;
}

function foundHouse(rng: Rng, world: World, services: Services, opts: HouseOpts): Household {
  const { polity, culture, religion, lang, seat, ruling } = opts;
  const houseId = nextId(world, "house") as HouseId;
  const familyName = services.language.familyName(rng.fork("name"), lang);
  const styled = `${isClanCulture(culture) ? "Clan" : "House"} ${familyName}`;

  const headRank = ruling ? 5 : 4;
  const headSex = chooseHeadSex(rng.fork("head-sex"), polity, culture, religion);
  const headAge = rng.fork("head-age").intIn(ruling ? 32 : 28, 55);
  const mk = (r: Rng, o: { sex?: Sex; ageYears: number; rank: number }) =>
    services.people.createFounder(r, world, services, {
      culture: culture.id,
      religion: polity.religion,
      location: seat,
      house: houseId,
      sex: o.sex,
      ageYears: o.ageYears,
      rank: o.rank,
    });

  const head = mk(rng.fork("head"), { sex: headSex, ageYears: headAge, rank: headRank });
  head.house = houseId; // createFounder took it in opts; assert it regardless

  // A consort, wed in the unrecorded past. They carry no blood claim.
  let consort: Person | null = null;
  if (rng.fork("wed").chance(0.9)) {
    consort = mk(rng.fork("consort"), {
      sex: headSex === "f" ? "m" : "f",
      ageYears: Math.max(18, headAge - rng.fork("consort-age").intIn(-2, 10)),
      rank: ruling ? rng.fork("consort-rank").intIn(4, 5) : 4,
    });
    consort.house = houseId;
    consort.flags[PF.marriedIn] = true;
    consort.marriages.push({ spouse: head.id, date: world.now, active: true });
    head.marriages.push({ spouse: consort.id, date: world.now, active: true });
  }

  // Adult kin: grown children first (with wired pedigree, so the succession
  // walker has real blood to follow), then a sibling or two of the head.
  const kin: Person[] = [];
  const kinCount = rng.fork("kin-count").intIn(1, ruling ? 4 : 3);
  const mother = head.sex === "f" ? head : consort;
  const father = head.sex === "m" ? head : consort;
  let childrenMade = 0;
  for (let k = 0; k < kinCount; k++) {
    const kRng = rng.fork("kin", k);
    const youngestParentAge = Math.min(headAge, consort ? ageOfYears(world, consort) : headAge);
    const maxChildAge = youngestParentAge - 18;
    const canBeChild = consort !== null && maxChildAge >= 16;
    if (canBeChild && childrenMade < 3 && kRng.fork("is-child").chance(0.7)) {
      const childAge = kRng.fork("age").intIn(16, Math.min(30, maxChildAge));
      const child = mk(kRng.fork("p"), { ageYears: childAge, rank: 4 });
      child.house = houseId;
      child.mother = mother?.id ?? null;
      child.father = father?.id ?? null;
      if (mother) mother.children.push(child.id);
      if (father) father.children.push(child.id);
      childrenMade++;
      kin.push(child);
    } else {
      const sib = mk(kRng.fork("p"), {
        ageYears: kRng.fork("age").intIn(20, 48),
        rank: 4,
      });
      sib.house = houseId;
      kin.push(sib);
    }
  }

  const house: House = {
    id: houseId,
    name: styled,
    motto: makeMotto(rng.fork("motto"), culture, religion),
    founder: head.id,
    founded: world.now,
    head: head.id,
    seat,
    culture: culture.id,
    parent: null,
    prestige: (ruling ? 30 : 12) + rng.fork("prestige").int(10),
    bannerSeed: `${world.params.seed}:${styled}#${houseId}`,
    feuds: new Map(),
  };
  world.houses.set(houseId, house);

  if (!ruling) {
    const seatName = world.settlements.get(seat)?.name ?? polity.name;
    head.status.titles.push(`${lordTitle(culture, head.sex)} of ${seatName}`);
  }
  return { house, head, consort, kin };
}

function ageOfYears(world: World, p: Person): number {
  return Math.max(0, Math.floor((world.now - p.born) / 12));
}

function chooseHeadSex(
  rng: Rng,
  polity: Polity,
  culture: Culture,
  religion: Religion | null,
): Sex {
  if (polity.kind === "theocracy" && religion && religion.clergyGender !== "any") {
    return religion.clergyGender;
  }
  if (culture.descent === "matrilineal") return rng.chance(0.75) ? "f" : "m";
  const femaleChance = clampNum(0.5 - 0.42 * (culture.attitudes.patriarchy - 0.5) * 2, 0.06, 0.75);
  return rng.chance(femaleChance) ? "f" : "m";
}

function clampNum(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// ---------------------------------------------------------------------------
// The court
// ---------------------------------------------------------------------------

function seatCourt(
  rng: Rng,
  world: World,
  services: Services,
  polity: Polity,
  culture: Culture,
  households: Household[],
): void {
  const roles = courtRoles(rng.fork("roles"), polity.kind);
  // Kin of every house may serve, in stable id order; the crown's own last
  // (their place is the succession, not the pantry keys).
  const bench: Person[] = [];
  for (const hh of households.slice(1)) bench.push(...hh.kin);
  bench.push(...households[0].kin);

  for (const role of roles) {
    const rRng = rng.fork("role", role);
    let chosen: Person | null = null;
    if (bench.length > 0 && rRng.fork("from-bench").chance(role === "marshal" ? 0.75 : 0.5)) {
      const scored = bench
        .filter((p) => ![...polity.court.values()].includes(p.id))
        .map((p) => ({ p, w: benchWeight(p, role) }));
      if (scored.length > 0) {
        chosen = rRng.fork("pick").weighted(
          scored.map((s) => s.p),
          scored.map((s) => s.w),
        );
      }
    }
    if (!chosen) {
      // A capable outsider takes the office, conjured from the town below.
      const rank = role === "court poet" || role === "skald" ? 2 : 3;
      chosen = services.people.createFounder(rRng.fork("make"), world, services, {
        culture: culture.id,
        religion: polity.religion,
        location: polity.capital,
        house: null,
        ageYears: rRng.fork("age").intIn(24, 50),
        rank,
      });
      chosen.status.profession =
        role === "steward" ? "steward" : role === "court poet" || role === "skald" ? "bard" : "courtier";
    }
    polity.court.set(role, chosen.id);
    chosen.status.titles.push(courtTitle(role, polity.name));
  }
}

function benchWeight(p: Person, role: string): number {
  let w = 1;
  const apt = p.phenotype.aptitudes;
  if (role === "marshal") w += (apt["war"] ?? 0) * 3 + Math.max(0, p.personality.courage) * 2;
  if (role === "steward" || role === "master of coin") w += (apt["trade"] ?? 0) * 2 + p.personality.diligence;
  if (role === "court poet" || role === "skald") w += (apt["music"] ?? 0) * 3 + (apt["oratory"] ?? 0);
  if (role === "lorekeeper" || role === "master of letters") w += (apt["lore"] ?? 0) * 3;
  if (role === "court physician") w += (apt["healing"] ?? 0) * 3;
  return Math.max(0.1, w);
}

export function courtTitle(role: string, polityName: string): string {
  const cap = role
    .split(" ")
    .map((w) => (w === "of" || w === "the" ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
  return `${cap} of ${polityName}`;
}

// ---------------------------------------------------------------------------
// Founding marriages across houses (pre-history: no events)
// ---------------------------------------------------------------------------

function knitFoundingMarriages(rng: Rng, world: World, households: Household[]): void {
  const unwed: Person[] = [];
  for (const hh of households) {
    for (const p of hh.kin) {
      if (p.marriages.length === 0 && ageOfYears(world, p) >= 18) unwed.push(p);
    }
  }
  unwed.sort((a, b) => a.id - b.id);
  const taken = new Set<PersonId>();
  for (const p of unwed) {
    if (taken.has(p.id)) continue;
    if (!rng.fork("wed", p.id).chance(0.4)) continue;
    const partners = unwed.filter(
      (q) => !taken.has(q.id) && q.id !== p.id && q.sex !== p.sex && q.house !== p.house,
    );
    if (partners.length === 0) continue;
    const q = rng.fork("pick", p.id).pick(partners);
    p.marriages.push({ spouse: q.id, date: world.now, active: true });
    q.marriages.push({ spouse: p.id, date: world.now, active: true });
    taken.add(p.id);
    taken.add(q.id);
  }
}
