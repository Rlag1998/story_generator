/**
 * Personal naming: full display names, newborn given names, and surnames,
 * all honoring the culture's name order, descent rule, ancestor-naming
 * customs, and twin beliefs.
 *
 * These functions take the given-name generator as a parameter (bound to
 * the real language service in index.ts) so the pedigree and convention
 * logic stays testable on fabricated worlds.
 */

import type { Rng } from "../../core/rng";
import type {
  Culture,
  Language,
  Person,
  PersonId,
  Sex,
  World,
} from "../../core/types";

/** Generates a given name in a language (bound to the language service). */
export type GivenNameFn = (rng: Rng, lang: Language, sex: Sex) => string;

// ---------------------------------------------------------------------------
// Patronymics
// ---------------------------------------------------------------------------

/**
 * Apply the language's patronymic affixes to a parent's given name.
 * Collapses a doubled letter at the seam ("Nils" + "sson" -> "Nilsson").
 */
export function applyPatronymic(lang: Language, parentGiven: string, childSex: Sex): string {
  const [pre, suf] = childSex === "f" ? lang.patronymicF : lang.patronymicM;
  let stem = parentGiven;
  if (
    suf.length > 0 &&
    stem.length > 1 &&
    stem[stem.length - 1].toLowerCase() === suf[0].toLowerCase()
  ) {
    stem = stem.slice(0, -1);
  }
  return pre + stem + suf;
}

// ---------------------------------------------------------------------------
// Full display names
// ---------------------------------------------------------------------------

const HOUSE_PREFIXES = ["House ", "Clan ", "Hall of ", "Line of ", "the "];

/** "House Maren" -> "Maren" for name composition. */
export function stripHousePrefix(houseName: string): string {
  for (const p of HOUSE_PREFIXES) {
    if (houseName.startsWith(p) && houseName.length > p.length) {
      return houseName.slice(p.length);
    }
  }
  return houseName;
}

/** The family-name part: house name for house members, else stored surname. */
function familyPart(world: World, person: Person): string {
  if (person.house != null) {
    const house = world.houses.get(person.house);
    if (house && house.name.length > 0) return stripHousePrefix(house.name);
  }
  return person.surname;
}

/**
 * Compose a person's display full name per their culture's name order.
 * The epithet is NOT included here (narrative layers it on).
 */
export function composeFullName(world: World, person: Person): string {
  const culture = world.cultures.get(person.culture);
  if (!culture) return person.givenName;
  switch (culture.nameOrder) {
    case "given-only":
      return person.givenName;
    case "given-family": {
      const fam = familyPart(world, person);
      return fam ? `${person.givenName} ${fam}` : person.givenName;
    }
    case "family-given": {
      const fam = familyPart(world, person);
      return fam ? `${fam} ${person.givenName}` : person.givenName;
    }
    case "given-patronymic": {
      const lang = world.languages.get(culture.language);
      const parentId = patronymicParentId(culture, person);
      const parent = parentId != null ? world.people.get(parentId) : undefined;
      if (lang && parent && parent.givenName.length > 0) {
        return `${person.givenName} ${applyPatronymic(lang, parent.givenName, person.sex)}`;
      }
      // No known parent: fall back to house name, stored surname, or given only.
      if (person.house != null) {
        const house = world.houses.get(person.house);
        if (house && house.name.length > 0) {
          return `${person.givenName} ${stripHousePrefix(house.name)}`;
        }
      }
      return person.surname ? `${person.givenName} ${person.surname}` : person.givenName;
    }
  }
}

/** Whose given name feeds the patronymic: legal father, or the mother's line. */
function patronymicParentId(culture: Culture, person: Person): PersonId | null {
  if (culture.descent === "matrilineal") return person.mother;
  return person.legalFather ?? person.father;
}

// ---------------------------------------------------------------------------
// Newborn surnames
// ---------------------------------------------------------------------------

/**
 * Surname for a newborn per culture convention. `father` is the legal
 * father (may be null for the fatherless). Deterministic: inheritance and
 * affix application only, no rng in the contract.
 */
export function chooseBabySurname(
  world: World,
  mother: Person,
  father: Person | null,
  sex: Sex,
  _given: string,
): string {
  const culture = world.cultures.get(mother.culture);
  if (!culture) return "";
  switch (culture.nameOrder) {
    case "given-only":
      return "";
    case "given-patronymic": {
      const lang = world.languages.get(culture.language);
      if (!lang) return "";
      // Matrilineal peoples reckon the line through the mother; the
      // fatherless likewise carry a matronymic rather than no name.
      if (culture.descent === "matrilineal" || !father) {
        return applyPatronymic(lang, mother.givenName, sex);
      }
      return applyPatronymic(lang, father.givenName, sex);
    }
    case "given-family":
    case "family-given": {
      const fromFather = father ? father.surname : "";
      const fromMother = mother.surname;
      if (culture.descent === "matrilineal") return fromMother || fromFather;
      if (culture.descent === "patrilineal") return fromFather || fromMother;
      // Cognatic: the child follows the grander line; ties go to the father.
      if (father && fromFather && fromMother) {
        return mother.status.rank > father.status.rank ? fromMother : fromFather;
      }
      return fromFather || fromMother;
    }
  }
}

// ---------------------------------------------------------------------------
// Newborn given names
// ---------------------------------------------------------------------------

/** Living siblings' names (both parents' broods) that a newborn should avoid. */
function siblingNames(world: World, mother: Person, father: Person | null): Set<string> {
  const taken = new Set<string>();
  const collect = (ids: readonly PersonId[]) => {
    for (const id of ids) {
      const p = world.people.get(id);
      if (p && p.died === null && p.givenName.length > 0) taken.add(p.givenName);
    }
  };
  collect(mother.children);
  if (father) collect(father.children);
  return taken;
}

interface AncestorCandidate {
  name: string;
  weight: number;
}

/**
 * Dead grandparents and great-grandparents of matching sex, walked through
 * `world.people` in a fixed order. The line favored by the descent rule
 * weighs heavier, and grandparents outweigh great-grandparents.
 */
function ancestorNamePool(
  world: World,
  culture: Culture,
  mother: Person,
  father: Person | null,
  sex: Sex,
  taken: ReadonlySet<string>,
): AncestorCandidate[] {
  const out: AncestorCandidate[] = [];
  const seen = new Set<string>();
  const get = (id: PersonId | null | undefined): Person | undefined =>
    id != null ? world.people.get(id) : undefined;
  const legalFatherOf = (p: Person | undefined): Person | undefined =>
    p ? get(p.legalFather ?? p.father) : undefined;
  const motherOf = (p: Person | undefined): Person | undefined => (p ? get(p.mother) : undefined);
  const push = (p: Person | undefined, weight: number) => {
    if (!p || p.sex !== sex || p.died === null) return;
    if (p.givenName.length === 0 || seen.has(p.givenName) || taken.has(p.givenName)) return;
    seen.add(p.givenName);
    out.push({ name: p.givenName, weight });
  };
  const motherLineW = culture.descent === "matrilineal" ? 4 : culture.descent === "cognatic" ? 3 : 2;
  const fatherLineW = culture.descent === "patrilineal" ? 4 : culture.descent === "cognatic" ? 3 : 2;
  // Grandparents.
  const mgm = motherOf(mother);
  const mgf = legalFatherOf(mother);
  const pgm = motherOf(father ?? undefined);
  const pgf = legalFatherOf(father ?? undefined);
  push(mgf, motherLineW);
  push(mgm, motherLineW);
  push(pgf, fatherLineW);
  push(pgm, fatherLineW);
  // Great-grandparents, at half the pull of grandparents.
  for (const gp of [mgf, mgm]) {
    push(legalFatherOf(gp), motherLineW * 0.4);
    push(motherOf(gp), motherLineW * 0.4);
  }
  for (const gp of [pgf, pgm]) {
    push(legalFatherOf(gp), fatherLineW * 0.4);
    push(motherOf(gp), fatherLineW * 0.4);
  }
  return out;
}

type TwinNamingMode = "alliterative" | "rhyming" | "dissimilar";

/** What the culture's twin belief asks of a litter-mate's name, if anything. */
export function twinNamingMode(culture: Culture): TwinNamingMode | null {
  for (const t of culture.traditions) {
    if (!t.hooks.includes("twins")) continue;
    if (t.key === "twins-two-flames") return "alliterative";
    if (t.key === "twins-oracle") return "rhyming";
    if (t.key === "twins-one-soul") return "dissimilar";
  }
  return null;
}

function matchesTwinMode(mode: TwinNamingMode, anchor: string, candidate: string): boolean {
  if (candidate === anchor) return false;
  const a = anchor.toLowerCase();
  const c = candidate.toLowerCase();
  switch (mode) {
    case "alliterative":
      return a[0] === c[0];
    case "rhyming":
      return a.length >= 2 && c.length >= 2 && a.slice(-2) === c.slice(-2);
    case "dissimilar":
      return a[0] !== c[0];
  }
}

/**
 * Choose a newborn's given name:
 * 1. Ancestor naming: with the culture's rate, reuse a dead grandparent's or
 *    great-grandparent's name of matching sex (pedigree walked via world.people).
 * 2. Twin flavor: when litter mates already lie in the cradle and the
 *    culture's twin belief calls for paired names, aim for alliteration or
 *    rhyme with the firstborn twin (or pointed dissimilarity).
 * 3. Otherwise a fresh given name in the culture's tongue, avoiding living
 *    siblings' names.
 */
export function chooseBabyName(
  rng: Rng,
  world: World,
  mother: Person,
  father: Person | null,
  sex: Sex,
  givenNameFn: GivenNameFn,
): string {
  const culture = world.cultures.get(mother.culture);
  const lang = culture ? world.languages.get(culture.language) : undefined;
  if (!culture || !lang) {
    throw new Error(`chooseBabyName: mother ${mother.id} has no culture/language in world`);
  }
  const taken = siblingNames(world, mother, father);

  // 1. Ancestor veneration.
  const aRng = rng.fork("ancestor");
  if (aRng.fork("roll").chance(culture.ancestorNaming)) {
    const pool = ancestorNamePool(world, culture, mother, father, sex, taken);
    if (pool.length > 0) {
      return aRng.fork("pick").weighted(
        pool.map((c) => c.name),
        pool.map((c) => c.weight),
      );
    }
  }

  const gRng = rng.fork("given");

  // 2. Twin-naming flavor: litter mates share this birth month.
  const cohort: Person[] = [];
  for (const id of mother.children) {
    const c = world.people.get(id);
    if (c && c.born === world.now && c.died === null) cohort.push(c);
  }
  if (cohort.length > 0) {
    const mode = twinNamingMode(culture);
    if (mode) {
      const anchor = cohort[0].givenName;
      for (let i = 0; i < 20; i++) {
        const cand = givenNameFn(gRng.fork("twin", i), lang, sex);
        if (taken.has(cand)) continue;
        if (matchesTwinMode(mode, anchor, cand)) return cand;
      }
      // No candidate fit the custom; the midwife shrugs and names on.
    }
  }

  // 3. A fresh name, dodging living siblings.
  for (let i = 0; i < 8; i++) {
    const cand = givenNameFn(gRng.fork("try", i), lang, sex);
    if (!taken.has(cand)) return cand;
  }
  return givenNameFn(gRng.fork("last"), lang, sex);
}
