/**
 * Prose utilities for the chronicler: capitalization, list joining, number
 * words, pronoun sets, age phrasing, and a final sanitize pass that keeps
 * every rendered string free of em-dashes and assembly artifacts.
 *
 * Everything here is a pure function of its inputs.
 */

import type { Sex } from "../core/types";

/** Capitalize the first letter. */
export function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Lowercase the leading word of a sentence so it can be spliced into a larger
 * clause ("None yet know that the child...") without mangling proper names.
 * Only listed common openers are lowered; anything else is assumed a name.
 */
const CLAUSE_OPENERS = new Set([
  "The", "A", "An", "In", "At", "On", "By", "It", "Its", "There", "When", "Word",
  "News", "None", "No", "Only", "That", "Their", "Then", "His", "Her", "Under",
  "Before", "After", "Against", "Among", "Between", "With", "Within", "Without",
  "Two", "Three", "Four", "Five", "Some", "So", "Not", "Now", "Once", "Over",
  "Upon", "What", "This", "Those", "These", "Death", "Fire", "Old", "Even",
  "From", "For", "Far", "Out", "Off", "One", "Late", "Long", "Last", "Deep",
  "Rumor", "Talk", "They", "She", "He", "Whatever", "Somewhere", "Nothing",
]);

export function lcClause(s: string): string {
  const m = /^([A-Z][a-z]+)\b/.exec(s);
  if (m && CLAUSE_OPENERS.has(m[1])) return s[0].toLowerCase() + s.slice(1);
  return s;
}

/** "X", "X and Y", "X, Y, and Z". Empty entries are dropped. */
export function joinList(items: readonly string[]): string {
  const xs = items.filter((s) => s !== undefined && s !== null && s.length > 0);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return xs.slice(0, -1).join(", ") + ", and " + xs[xs.length - 1];
}

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ONES_ORD = [
  "zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh",
  "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth",
  "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth",
  "nineteenth",
];
const TENS_ORD = ["", "", "twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth"];

/** 0..99 to words ("sixty-three"); larger numbers fall back to digits. */
export function numberWord(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v < 20) return ONES[v];
  if (v < 100) {
    const t = Math.floor(v / 10);
    const o = v % 10;
    return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`;
  }
  return String(v);
}

/** 1..99 to ordinal words ("sixty-first"); larger fall back to "63rd" style. */
export function ordinalWord(n: number): string {
  const v = Math.floor(Math.abs(n));
  if (v < 20) return ONES_ORD[v];
  if (v < 100) {
    const t = Math.floor(v / 10);
    const o = v % 10;
    return o === 0 ? TENS_ORD[t] : `${TENS[t]}-${ONES_ORD[o]}`;
  }
  const suffix = v % 10 === 1 && v % 100 !== 11 ? "st" : v % 10 === 2 && v % 100 !== 12 ? "nd" : v % 10 === 3 && v % 100 !== 13 ? "rd" : "th";
  return `${v}${suffix}`;
}

// ---------------------------------------------------------------------------
// Pronouns & kin words
// ---------------------------------------------------------------------------

export interface Pronouns {
  /** she / he */
  subj: string;
  /** She / He */
  Subj: string;
  /** her / him */
  obj: string;
  /** her / his */
  poss: string;
  /** Her / His */
  Poss: string;
  /** herself / himself */
  self: string;
  /** woman / man */
  noun: string;
  /** girl / boy */
  young: string;
  /** daughter / son */
  child: string;
  /** wife / husband */
  spouse: string;
  /** widow / widower */
  widow: string;
  /** mother / father */
  parent: string;
  /** sister / brother */
  sibling: string;
}

const SHE: Pronouns = {
  subj: "she", Subj: "She", obj: "her", poss: "her", Poss: "Her",
  self: "herself", noun: "woman", young: "girl", child: "daughter",
  spouse: "wife", widow: "widow", parent: "mother", sibling: "sister",
};
const HE: Pronouns = {
  subj: "he", Subj: "He", obj: "him", poss: "his", Poss: "His",
  self: "himself", noun: "man", young: "boy", child: "son",
  spouse: "husband", widow: "widower", parent: "father", sibling: "brother",
};

export function pronouns(sex: Sex): Pronouns {
  return sex === "f" ? SHE : HE;
}

// ---------------------------------------------------------------------------
// Ages
// ---------------------------------------------------------------------------

/** "at nineteen", "barely a year old", "in the cradle". */
export function atAge(years: number): string {
  if (years <= 0) return "in the cradle";
  if (years === 1) return "barely a year old";
  return `at ${numberWord(years)}`;
}

/** "in her sixty-first year"; infants get "in the first months of life". */
export function inNthYear(poss: string, years: number): string {
  if (years <= 0) return "in the first months of life";
  return `in ${poss} ${ordinalWord(Math.max(1, years))} year`;
}

/**
 * Strip a leading article from a name a template will itself precede with
 * "the": plague and illness names sometimes arrive as "the grey cough".
 */
export function deThe(s: string): string {
  return s.replace(/^[Tt]he\s+/, "");
}

// ---------------------------------------------------------------------------
// Final cleanup
// ---------------------------------------------------------------------------

/**
 * Scrub a rendered string: no em/en dashes ever (they become commas), no
 * doubled spaces or stray space-before-punctuation, and a terminal stop.
 * Data strings from other modules pass through renderers verbatim, so this
 * pass is the last line of defense for the house style.
 */
export function sanitize(s: string): string {
  let out = s.replace(/\s*[—–]\s*/g, ", ");
  out = out.replace(/\s+([,.;:!?])/g, "$1");
  out = out.replace(/,{2,}/g, ",");
  out = out.replace(/ {2,}/g, " ");
  out = out.replace(/,\s*([.;:])/g, "$1");
  out = out.replace(/\.{2,}/g, ".");
  out = out.trim();
  return out;
}

/** Sanitize and guarantee the string ends in terminal punctuation. */
export function finishSentence(s: string): string {
  const out = sanitize(s);
  if (out.length === 0) return out;
  return /[.!?"']$/.test(out) ? out : out + ".";
}
