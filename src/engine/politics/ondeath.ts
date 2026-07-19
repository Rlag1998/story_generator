/**
 * Death and the transfer of power. Rulers leave closed reigns, coronations,
 * regencies, or crises; house heads leave seats, wealth and titles resolved
 * by their culture's inheritance custom. Commoner deaths return at once.
 */

import type {
  Ctx,
  DescentRule,
  EventId,
  House,
  InheritanceCustom,
  Person,
  PersonId,
  Polity,
  World,
} from "../core/types";
import type { Rng } from "../core/rng";
import {
  PF,
  childrenByAge,
  clamp,
  cultureOf,
  deathEventOf,
  isAdult,
  livingHouseMembers,
  livingPerson,
  lordTitle,
  polState,
  politiesSorted,
  regionOfSettlement,
} from "./helpers";
import { chooseHeir, crisisClaimants } from "./succession";
import { crownRuler } from "./crown";
import { divinationFlavor } from "./prose";

export function onDeath(ctx: Ctx, deceased: Person): void {
  // Fast path: the unlanded and untitled pass without state to settle.
  if (deceased.house == null && deceased.status.rank < 3) return;

  const world = ctx.world;
  const deathEvent = deathEventOf(world, deceased);

  // Rulers first: every polity the deceased held (personal unions included).
  for (const polity of politiesSorted(world)) {
    if (polity.ruler === deceased.id) {
      resolveRulerSuccession(ctx, polity, deceased, deathEvent);
    }
  }

  // House headship.
  if (deceased.house != null) {
    const house = world.houses.get(deceased.house);
    if (house && house.head === deceased.id) {
      resolveHouseHeadship(ctx, house, deceased, deathEvent);
    }
  }

  // Vacate court offices and regencies quietly; tick refills them.
  for (const polity of politiesSorted(world)) {
    for (const role of [...polity.court.keys()].sort()) {
      if (polity.court.get(role) === deceased.id) polity.court.delete(role);
    }
  }
}

// ---------------------------------------------------------------------------
// Ruler succession
// ---------------------------------------------------------------------------

function resolveRulerSuccession(
  ctx: Ctx,
  polity: Polity,
  deceased: Person,
  deathEvent: EventId | null,
): void {
  const world = ctx.world;
  const rng = ctx.rng.fork("succession", polity.id, deceased.id);
  const causes = deathEvent !== null ? [deathEvent] : [];

  const religion = world.religions.get(polity.religion) ?? null;
  const lot = (pool: Person[]) => rng.fork("lot").pick(pool);
  const choice = chooseHeir(world, polity, lot);

  // A weak claim before hungry rivals curdles into crisis.
  const contested =
    choice.heir !== null &&
    choice.tier === "house" &&
    choice.rivals.length >= 1 &&
    rng.fork("contested").chance(0.45);

  if (choice.heir === null || contested) {
    openCrisis(ctx, rng.fork("crisis"), polity, deceased, causes, choice.heir);
    return;
  }

  const heir = choice.heir;
  const data: Record<string, unknown> = {};
  if (polity.succession === "divine-lot") {
    data.rite = divinationFlavor(rng.fork("divine"), religion);
    data.chosenByLot = true;
  }
  if (choice.tier === "house") data.claimThrough = "house blood";

  crownRuler(ctx, rng.fork("crown"), polity, heir, { causes, data });

  // Rivals near the seat keep their hunger (the story module feeds on this).
  for (const rid of choice.rivals) {
    const rival = livingPerson(world, rid);
    if (rival && isAdult(world, rival) && rival.personality.ambition >= 0.6) {
      rival.flags[PF.claimant] = polity.id;
    }
  }
}

function openCrisis(
  ctx: Ctx,
  rng: Rng,
  polity: Polity,
  deceased: Person,
  causes: EventId[],
  weakHeir: Person | null,
): void {
  const world = ctx.world;
  const state = polState(world);
  polity.ruler = null;

  const claimants = crisisClaimants(world, polity);
  if (weakHeir && !claimants.includes(weakHeir.id)) claimants.unshift(weakHeir.id);
  const flagged = claimants.slice(0, 3);
  const participants: Record<string, PersonId> = {};
  flagged.forEach((id, i) => {
    participants[`claimant${i + 1}`] = id;
    const p = world.people.get(id);
    if (p) p.flags[PF.claimant] = polity.id;
  });

  const ev = ctx.record({
    type: "succession-crisis",
    date: world.now,
    participants,
    data: {
      polity: polity.id,
      // Why the seat stands empty, for the narrative module to voice.
      reason:
        flagged.length === 0
          ? "the line is dead and no claimant dares the empty seat"
          : "rival claims split the court and no head bows to another",
      lateRuler: deceased.id,
      claimants: flagged,
    },
    location: polity.capital,
    region: regionOfSettlement(world, polity.capital),
    importance: 55,
    causes,
    storyline: null,
    secret: false,
  });

  state.crises[String(polity.id)] = {
    polity: polity.id,
    since: world.now,
    event: ev.id,
    resolveAfter: world.now + rng.fork("delay").intIn(8, 26),
  };
}

// ---------------------------------------------------------------------------
// House headship
// ---------------------------------------------------------------------------

function resolveHouseHeadship(
  ctx: Ctx,
  house: House,
  deceased: Person,
  deathEvent: EventId | null,
): void {
  const world = ctx.world;
  const culture = world.cultures.get(house.culture) ?? cultureOf(world, deceased);
  const custom = culture?.inheritance ?? "primogeniture";
  const members = livingHouseMembers(world, house.id).filter(
    (p) => p.id !== deceased.id && p.flags[PF.marriedIn] !== true,
  );
  const heir = chooseHouseHeir(world, deceased, members, custom, culture?.descent ?? "cognatic");
  house.head = heir?.id ?? null;
  if (!heir) return; // extinction is mourned by the yearly pass

  if (heir.status.rank < 4) heir.status.rank = 4;
  // The seat and the strongbox pass; gavelkind scatters a share to siblings.
  const inherited =
    custom === "gavelkind"
      ? Math.max(heir.status.wealth, deceased.status.wealth - 1)
      : Math.max(heir.status.wealth, deceased.status.wealth);
  heir.status.wealth = clamp(inherited, 0, 5);

  let title: string | null = null;
  if (house.seat != null) {
    const seatName = world.settlements.get(house.seat)?.name;
    if (seatName) {
      title = `${lordTitle(culture, heir.sex)} of ${seatName}`;
      if (!heir.status.titles.includes(title)) heir.status.titles.push(title);
    }
  }

  // One modest chronicle line for a noble succession; commoner-adjacent
  // houses (cadet lines fallen low) pass in silence.
  if (deceased.status.rank >= 4 || house.prestige >= 15) {
    ctx.record({
      type: "title-granted",
      date: world.now,
      participants: { subject: heir.id },
      data: {
        title: title ?? `head of ${house.name}`,
        house: house.id,
        houseName: house.name,
        custom,
        // Inheritance flavor for the narrative module.
        passage:
          custom === "gavelkind"
            ? "the lands were parted among the blood, the hall to the eldest"
            : custom === "ultimogeniture"
              ? "by the old custom the hearth passes to the youngest"
              : custom === "seniority"
                ? "the eldest of the blood takes the high chair"
                : custom === "elective"
                  ? "the kin met and chose by voice"
                  : "seat and signet pass by right of birth",
      },
      location: house.seat,
      region: regionOfSettlement(world, house.seat),
      importance: 10,
      causes: deathEvent !== null ? [deathEvent] : [],
      storyline: null,
      secret: false,
    });
  }
}

/** New head per the culture's inheritance custom. Deterministic. */
export function chooseHouseHeir(
  world: World,
  deceased: Person,
  members: Person[],
  custom: InheritanceCustom,
  descent: DescentRule,
): Person | null {
  if (members.length === 0) return null;
  const memberIds = new Set(members.map((m) => m.id));

  const sexOrder = (p: Person): number => {
    if (descent === "patrilineal") return p.sex === "m" ? 0 : 1;
    if (descent === "matrilineal") return p.sex === "f" ? 0 : 1;
    return 0;
  };

  const children = childrenByAge(world, deceased).filter((c) => memberIds.has(c.id));

  switch (custom) {
    case "primogeniture":
    case "gavelkind": {
      // Eldest child, favored sex first; then eldest adult member.
      const ordered = [...children].sort(
        (a, b) => sexOrder(a) - sexOrder(b) || a.born - b.born || a.id - b.id,
      );
      if (ordered.length > 0) return ordered[0];
      break;
    }
    case "ultimogeniture": {
      const ordered = [...children].sort(
        (a, b) => sexOrder(a) - sexOrder(b) || b.born - a.born || b.id - a.id,
      );
      if (ordered.length > 0) return ordered[0];
      break;
    }
    case "seniority": {
      const eldest = [...members].sort((a, b) => a.born - b.born || a.id - b.id);
      return eldest[0] ?? null;
    }
    case "elective": {
      const scored = members
        .map((p) => ({
          p,
          score:
            (isAdult(world, p) ? 40 : 0) +
            p.status.rank * 8 +
            Math.min(25, p.notability / 10) +
            (p.phenotype.aptitudes["oratory"] ?? 0) * 4 +
            p.personality.ambition * 8,
        }))
        .sort((a, b) => b.score - a.score || a.p.id - b.p.id);
      return scored[0]?.p ?? null;
    }
  }

  // Fallback for the child-based customs: adults by age, then anyone.
  const adults = members
    .filter((p) => isAdult(world, p))
    .sort((a, b) => sexOrder(a) - sexOrder(b) || a.born - b.born || a.id - b.id);
  if (adults.length > 0) return adults[0];
  const any = [...members].sort((a, b) => a.born - b.born || a.id - b.id);
  return any[0] ?? null;
}
