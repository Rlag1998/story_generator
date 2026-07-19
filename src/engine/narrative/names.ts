/**
 * Name composition: short names with epithets, honorifics for rulers,
 * clergy and nobles, house attribution, and cheap kin lookups.
 */

import type { Person, Polity, World } from "../core/types";
import { sortedIds } from "../core/world";
import { pronouns } from "./text";

/**
 * Display name: given + epithet ("Kaerel the Unbowed"), else the nickname
 * form ("Maro called Sparrow"), else given + surname, else given alone.
 */
export function shortName(world: World, p: Person): string {
  const given = p.givenName && p.givenName.length > 0 ? p.givenName : "one unnamed";
  if (p.epithet && p.epithet.length > 0) return `${given} ${p.epithet}`;
  if (p.nickname && p.nickname.length > 0) return `${given} called ${p.nickname}`;
  if (p.surname && p.surname.length > 0) return `${given} ${p.surname}`;
  return given;
}

/** The polity this person currently rules, if any (ascending-id scan). */
export function rulerPolityOf(world: World, p: Person): Polity | null {
  for (const id of sortedIds(world.polities)) {
    const pol = world.polities.get(id)!;
    if (pol.ruler === p.id) return pol;
  }
  return null;
}

/**
 * Honorific for prose: ruler title ("King"), clergy title ("Cindermother"),
 * or Lord/Lady for the landed. Empty string for common folk.
 */
export function honorific(world: World, p: Person): string {
  const pol = rulerPolityOf(world, p);
  if (pol) return p.sex === "f" ? pol.rulerTitleF : pol.rulerTitleM;
  if (p.status.profession === "priest" || p.status.profession === "monastic") {
    const rel = world.religions.get(p.religion);
    if (rel && rel.clergyTitle.length > 0) return rel.clergyTitle;
  }
  if (p.status.rank >= 4) return p.sex === "f" ? "Lady" : "Lord";
  return "";
}

/** "King Kaerel the Unbowed" / "Cindermother Maève" / plain short name. */
export function titledName(world: World, p: Person): string {
  const h = honorific(world, p);
  const n = shortName(world, p);
  return h.length > 0 ? `${h} ${n}` : n;
}

/**
 * Fullest form, used at biography openings and grave notes:
 * titled name plus house ("Kaerel the Unbowed of House Maren").
 */
export function fullName(world: World, p: Person): string {
  const base = titledName(world, p);
  const house = p.house !== null ? world.houses.get(p.house) : undefined;
  if (house && !base.includes(house.name)) return `${base} of ${house.name}`;
  return base;
}

/** House name, or "" when unhoused. */
export function houseNameOf(world: World, p: Person): string {
  if (p.house === null) return "";
  return world.houses.get(p.house)?.name ?? "";
}

/** Current living spouse from the marriage roll, if any. */
export function spouseOf(world: World, p: Person): Person | null {
  for (const m of p.marriages) {
    if (!m.active) continue;
    const s = world.people.get(m.spouse);
    if (s && s.died === null) return s;
  }
  return null;
}

/** Children still living, ascending id. */
export function livingChildren(world: World, p: Person): Person[] {
  const out: Person[] = [];
  for (const cid of [...p.children].sort((a, b) => a - b)) {
    const c = world.people.get(cid);
    if (c && c.died === null) out.push(c);
  }
  return out;
}

/**
 * A person's occupational tag for prose, e.g. "the smith", "a farmer".
 * Empty for children and the professionless.
 */
export function professionTag(p: Person): string {
  const prof = p.status.profession;
  if (prof === "none") return "";
  if (prof === "ruler" || prof === "noble") return "";
  return `the ${prof}`;
}

/** "her father", "his mother", relative kin phrase from p toward kin. */
export function kinPhrase(world: World, p: Person, kin: Person): string {
  const pr = pronouns(p.sex);
  if (kin.id === p.mother) return `${pr.poss} mother`;
  if (kin.id === p.father || kin.id === p.legalFather) return `${pr.poss} father`;
  if (p.children.includes(kin.id)) return `${pr.poss} ${pronouns(kin.sex).child}`;
  for (const m of p.marriages) {
    if (m.spouse === kin.id) return `${pr.poss} ${pronouns(kin.sex).spouse}`;
  }
  if (p.mother !== null && p.mother === kin.mother) return `${pr.poss} ${pronouns(kin.sex).sibling}`;
  if (p.father !== null && p.father === kin.father) return `${pr.poss} ${pronouns(kin.sex).sibling}`;
  return "";
}
