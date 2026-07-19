/**
 * Culture generation and derivation.
 *
 * A culture is a coherent bundle: its values shape its attitudes, its
 * attitudes shape its customs, and its name, demonym and tradition flavor
 * all grow from its language's phonology, so people, tongue and ways sound
 * like one cloth.
 */

import type { Rng } from "../../core/rng";
import type {
  Culture,
  CultureValue,
  DescentRule,
  InheritanceCustom,
  Language,
  MarriageCustom,
  NameOrder,
  World,
} from "../../core/types";
import { sortedIds } from "../../core/world";
import { cultureNames, detectSuffixPair } from "./namegen";
import { driftTraditions, selectTraditions } from "./traditions";
import {
  type Attitudes,
  colorKey,
  computeAttitudes,
  driftAttitudes,
  driftColors,
  driftValues,
  pickColors,
  pickValues,
} from "./values";

// ---------------------------------------------------------------------------
// Custom pickers (all value/attitude-coherent, all deterministic)
// ---------------------------------------------------------------------------

function pickDescent(rng: Rng, values: readonly CultureValue[], att: Attitudes): DescentRule {
  const p = att.patriarchy;
  return rng.weightedPairs([
    ["patrilineal", 1 + 3 * p + (values.includes("conquest") ? 0.8 : 0)],
    ["matrilineal", 0.35 + 1.8 * (1 - p) * (1 - p)],
    ["cognatic", 1.1 + att.openness + (values.includes("trade") ? 0.5 : 0)],
  ] as const);
}

/** Descent settles the question of who really holds the household. */
function reconcilePatriarchy(att: Attitudes, descent: DescentRule): void {
  if (descent === "matrilineal") att.patriarchy = Math.min(att.patriarchy, 0.2);
  else if (descent === "cognatic") att.patriarchy = Math.min(att.patriarchy, 0.6);
  else att.patriarchy = Math.max(att.patriarchy, 0.35);
}

function pickMarriage(rng: Rng, values: readonly CultureValue[], att: Attitudes): MarriageCustom {
  return rng.weightedPairs([
    [
      "monogamy",
      4 + (values.includes("piety") ? 1 : 0) + (values.includes("austerity") ? 1 : 0),
    ],
    [
      "polygyny-elite",
      0.5 + 2 * att.patriarchy + (values.includes("conquest") ? 0.9 : 0),
    ],
    [
      "handfast-renewal",
      0.7 +
        (values.includes("revelry") ? 0.9 : 0) +
        (values.includes("seafaring") ? 0.5 : 0) -
        (values.includes("piety") ? 0.5 : 0),
    ],
  ] as const);
}

function pickInheritance(rng: Rng, values: readonly CultureValue[]): InheritanceCustom {
  return rng.weightedPairs([
    ["primogeniture", 3 + (values.includes("honor") ? 0.8 : 0)],
    ["ultimogeniture", 0.7 + (values.includes("kinship") ? 0.4 : 0)],
    ["gavelkind", 1.4 + (values.includes("kinship") ? 1.1 : 0)],
    ["seniority", 0.9 + (values.includes("stoicism") ? 0.6 : 0)],
    [
      "elective",
      0.7 + (values.includes("learning") ? 0.8 : 0) + (values.includes("trade") ? 0.6 : 0),
    ],
  ] as const);
}

function pickNameOrder(rng: Rng, values: readonly CultureValue[]): NameOrder {
  return rng.weightedPairs([
    ["given-family", 3],
    ["given-patronymic", 2.4 + (values.includes("kinship") ? 1 : 0)],
    [
      "family-given",
      0.9 +
        (values.includes("learning") ? 0.7 : 0) +
        (values.includes("craftsmanship") ? 0.5 : 0),
    ],
    [
      "given-only",
      0.7 + (values.includes("austerity") ? 0.7 : 0) + (values.includes("piety") ? 0.3 : 0),
    ],
  ] as const);
}

interface Ages {
  adulthoodAge: number;
  marriageAgeF: number;
  marriageAgeM: number;
}

/**
 * Adulthood 14-18 with a bell around 16; bookish and pious cultures wait a
 * little longer, warlike ones grow their spears young. Marriage ages are
 * absolute typical ages: women marry at adulthood plus a small offset, men
 * later still, with the gap widening under patriarchy (and occasionally
 * inverting where it is weak).
 */
function pickAges(rng: Rng, values: readonly CultureValue[], att: Attitudes): Ages {
  let adulthood: number = rng.fork("adult").weightedPairs([
    [14, 1],
    [15, 2],
    [16, 3],
    [17, 2],
    [18, 1.2],
  ] as const);
  if ((values.includes("learning") || values.includes("piety")) && rng.fork("late").chance(0.4)) {
    adulthood = Math.min(18, adulthood + 1);
  }
  if (values.includes("conquest") && rng.fork("early").chance(0.35)) {
    adulthood = Math.max(14, adulthood - 1);
  }
  const offsetF = rng.fork("offF").weightedPairs([
    [0, 2],
    [1, 3],
    [2, 3],
    [3, 1.5],
    [4, 0.7],
  ] as const);
  const gap = Math.round(rng.fork("gap").range(-1, 2 + att.patriarchy * 6));
  const marriageAgeF = adulthood + offsetF;
  const marriageAgeM = Math.max(adulthood, marriageAgeF + gap);
  return { adulthoodAge: adulthood, marriageAgeF, marriageAgeM };
}

function pickAncestorNaming(rng: Rng, values: readonly CultureValue[]): number {
  let rate =
    0.15 +
    (values.includes("kinship") ? 0.2 : 0) +
    (values.includes("piety") ? 0.12 : 0) +
    (values.includes("honor") ? 0.05 : 0) +
    rng.fork("noise").gaussian() * 0.07;
  rate = Math.max(0.05, Math.min(0.7, rate));
  return Math.round(rate * 100) / 100;
}

function takenCultureNames(world: World): Set<string> {
  const taken = new Set<string>();
  for (const id of sortedIds(world.cultures)) {
    const c = world.cultures.get(id)!;
    taken.add(c.name);
    taken.add(c.demonym);
  }
  return taken;
}

function takenColorPairs(world: World): Set<string> {
  const taken = new Set<string>();
  for (const id of sortedIds(world.cultures)) {
    taken.add(colorKey(world.cultures.get(id)!.colors));
  }
  return taken;
}

// ---------------------------------------------------------------------------
// Public generation entry points
// ---------------------------------------------------------------------------

export function generateCulture(rng: Rng, world: World, language: Language): Culture {
  const values = pickValues(rng.fork("values"));
  const attitudes = computeAttitudes(rng.fork("attitudes"), values);
  const descent = pickDescent(rng.fork("descent"), values, attitudes);
  reconcilePatriarchy(attitudes, descent);
  const marriage = pickMarriage(rng.fork("marriage"), values, attitudes);
  const inheritance = pickInheritance(rng.fork("inheritance"), values);
  const nameOrder = pickNameOrder(rng.fork("nameOrder"), values);
  const { name, demonym } = cultureNames(rng.fork("name"), language, takenCultureNames(world));
  const ages = pickAges(rng.fork("ages"), values, attitudes);
  const ancestorNaming = pickAncestorNaming(rng.fork("ancestor"), values);
  const colors = pickColors(rng.fork("colors"), values, takenColorPairs(world));
  const traditions = selectTraditions(rng.fork("traditions"), language, values, attitudes, demonym);
  return {
    id: 0, // assigned by the caller (engine worldgen)
    name,
    demonym,
    language: language.id,
    parent: null,
    values,
    marriage,
    descent,
    inheritance,
    nameOrder,
    ancestorNaming,
    traditions,
    adulthoodAge: ages.adulthoodAge,
    marriageAgeF: ages.marriageAgeF,
    marriageAgeM: ages.marriageAgeM,
    colors,
    attitudes,
  };
}

/**
 * A drifted daughter culture: most customs survive the crossing, a few flip,
 * and the name is re-coined in the new tongue, preferring the parent's
 * ending pattern so the family resemblance is audible.
 */
export function deriveCulture(
  rng: Rng,
  world: World,
  parent: Culture,
  language: Language,
): Culture {
  const values = driftValues(rng.fork("values"), parent.values);
  const attitudes = driftAttitudes(rng.fork("attitudes"), parent.attitudes);
  const descent = rng.fork("descentFlip").chance(0.12)
    ? pickDescent(rng.fork("descent"), values, attitudes)
    : parent.descent;
  reconcilePatriarchy(attitudes, descent);
  const marriage = rng.fork("marriageFlip").chance(0.15)
    ? pickMarriage(rng.fork("marriage"), values, attitudes)
    : parent.marriage;
  const inheritance = rng.fork("inheritFlip").chance(0.2)
    ? pickInheritance(rng.fork("inheritance"), values)
    : parent.inheritance;
  const nameOrder = rng.fork("orderFlip").chance(0.1)
    ? pickNameOrder(rng.fork("nameOrder"), values)
    : parent.nameOrder;
  const { name, demonym } = cultureNames(
    rng.fork("name"),
    language,
    takenCultureNames(world),
    detectSuffixPair(parent.name),
  );
  const ageR = rng.fork("ages");
  const adulthoodAge = Math.max(
    14,
    Math.min(18, parent.adulthoodAge + ageR.fork("a").intIn(-1, 1)),
  );
  const marriageAgeF = Math.max(adulthoodAge, parent.marriageAgeF + ageR.fork("f").intIn(-1, 1));
  const marriageAgeM = Math.max(adulthoodAge, parent.marriageAgeM + ageR.fork("m").intIn(-1, 1));
  const ancestorNaming =
    Math.round(
      Math.max(0.05, Math.min(0.7, parent.ancestorNaming + rng.fork("ancestor").range(-0.15, 0.15))) *
        100,
    ) / 100;
  const colors = driftColors(rng.fork("colors"), parent.colors, values);
  const traditions = driftTraditions(
    rng.fork("traditions"),
    language,
    parent.traditions,
    values,
    attitudes,
    demonym,
  );
  return {
    id: 0, // assigned by the caller
    name,
    demonym,
    language: language.id,
    parent: parent.id,
    values,
    marriage,
    descent,
    inheritance,
    nameOrder,
    ancestorNaming,
    traditions,
    adulthoodAge,
    marriageAgeF,
    marriageAgeM,
    colors,
    attitudes,
  };
}
