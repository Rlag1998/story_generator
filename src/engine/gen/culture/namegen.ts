/**
 * Phonology-driven word assembly for the culture module.
 *
 * Cultures must sound kin to their tongue, so culture names, demonyms and
 * the native flavor words woven into tradition names are built directly
 * from the language's phonology fields (consonants, vowels, syllable
 * patterns, finals, orthography, forbidden clusters).
 *
 * Everything here is pure and deterministic: all randomness flows from the
 * Rng passed in, forked with stable labels.
 */

import type { Rng } from "../../core/rng";
import type { Language, Phonology } from "../../core/types";

/** One assembled unit of a word: a consonant or vowel entry (may be a digraph). */
interface Unit {
  kind: "C" | "V";
  s: string;
}

/** All characters that appear in the phonology's vowel entries. */
function vowelChars(ph: Phonology): Set<string> {
  const set = new Set<string>();
  for (const v of ph.vowels) for (const ch of v) set.add(ch);
  return set;
}

function assembleSyllable(rng: Rng, ph: Phonology): Unit[] {
  const pattern =
    ph.patterns.length > 0 ? rng.weighted(ph.patterns, ph.patternWeights) : "CV";
  const units: Unit[] = [];
  for (const ch of pattern) {
    if (ch === "C" && ph.consonants.length > 0) {
      units.push({ kind: "C", s: rng.pick(ph.consonants) });
    } else if (ch === "V" && ph.vowels.length > 0) {
      units.push({ kind: "V", s: rng.pick(ph.vowels) });
    }
  }
  return units;
}

/**
 * Enforce the language's word-final rules on an assembled unit list:
 * a final consonant must belong to `finals`; if `finals` is empty the
 * language prefers open syllables, so a trailing consonant is dropped
 * (or a vowel appended when dropping would leave a stub).
 */
function fixFinal(units: Unit[], ph: Phonology, rng: Rng): Unit[] {
  if (units.length === 0) return units;
  const last = units[units.length - 1];
  if (last.kind === "V") return units;
  if (ph.finals.length === 0) {
    if (units.length > 2) return units.slice(0, -1);
    if (ph.vowels.length > 0) return [...units, { kind: "V", s: rng.pick(ph.vowels) }];
    return units;
  }
  if (!ph.finals.includes(last.s)) {
    return [...units.slice(0, -1), { kind: "C", s: rng.pick(ph.finals) }];
  }
  return units;
}

/** Collapse accidental doubled letters across unit boundaries ("kk" from k+k). */
function joinUnits(units: Unit[]): string {
  let out = "";
  for (const u of units) {
    if (out.length > 0 && u.s.length > 0 && out[out.length - 1] === u.s[0] && u.s.length === 1) {
      // single-char repeat at the seam: keep one (geminates read poorly in names)
      continue;
    }
    out += u.s;
  }
  return out;
}

export function applyOrthography(word: string, ph: Phonology): string {
  let out = word;
  for (const [from, to] of ph.orthography) {
    if (from.length > 0) out = out.split(from).join(to);
  }
  return out;
}

export function hasForbidden(word: string, ph: Phonology): boolean {
  for (const f of ph.forbidden) {
    if (f.length > 0 && word.includes(f)) return true;
  }
  return false;
}

/**
 * Generate one well-formed word from a phonology, `minSyl`..`maxSyl`
 * syllables long. Retries a handful of labeled substreams to route around
 * forbidden clusters, then falls back to a bare CV.
 */
export function phonoWord(rng: Rng, ph: Phonology, minSyl: number, maxSyl: number): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = rng.fork("try", attempt);
    const n = r.intIn(minSyl, maxSyl);
    let units: Unit[] = [];
    for (let i = 0; i < n; i++) units = units.concat(assembleSyllable(r.fork("syl", i), ph));
    units = fixFinal(units, ph, r.fork("fin"));
    const word = applyOrthography(joinUnits(units), ph);
    if (word.length >= 2 && !hasForbidden(word, ph)) return word;
  }
  const r = rng.fork("fallback");
  const c = ph.consonants.length > 0 ? r.pick(ph.consonants) : "l";
  const v = ph.vowels.length > 0 ? r.pick(ph.vowels) : "a";
  return c + v;
}

export function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word[0].toUpperCase() + word.slice(1);
}

/**
 * A native word for a concept, capitalized for use in proper names.
 * Prefers the language's lexicon so tradition names agree with the tongue;
 * otherwise coins a word from the phonology, deterministically per concept.
 */
/** Coined words that would read as jarringly modern English are rerolled. */
const JARRING_WORDS = new Set([
  "vote", "taxi", "auto", "soda", "cola", "disco", "metro", "kilo", "memo",
  "demo", "promo", "logo", "limo", "typo", "data", "video", "radio", "moto",
  "solo", "polo", "vino", "salsa", "sofa", "menu", "motel", "salon",
]);

export function nativeWord(rng: Rng, lang: Language, concept: string): string {
  const fromLexicon = lang.lexicon[concept];
  if (fromLexicon && fromLexicon.length > 0) return capitalize(fromLexicon);
  // Coined proper nouns want some body: insist on four letters or more.
  for (let i = 0; i < 5; i++) {
    const w = phonoWord(rng.fork("coin", concept, i), lang.phonology, 2, 2);
    if (w.length >= 4 && !JARRING_WORDS.has(w.toLowerCase())) return capitalize(w);
  }
  return capitalize(phonoWord(rng.fork("coin-long", concept), lang.phonology, 2, 3));
}

/**
 * Join a stem and a suffix with small phonotactic repairs:
 * vowel+vowel drops the stem's final vowel, consonant+consonant inserts a
 * linking vowel when the raw seam would be forbidden.
 */
export function joinStemSuffix(rng: Rng, ph: Phonology, stem: string, suffix: string): string {
  if (suffix.length === 0) return stem;
  const vs = vowelChars(ph);
  let s = stem;
  const endsVowel = s.length > 0 && vs.has(s[s.length - 1]);
  const startsVowel = vs.has(suffix[0]);
  if (endsVowel && startsVowel && s.length > 3) {
    s = s.slice(0, -1);
  } else if (!endsVowel && !startsVowel) {
    const raw = s + suffix;
    if (hasForbidden(raw, ph) || s[s.length - 1] === suffix[0]) {
      const v = ph.vowels.length > 0 ? rng.pick(ph.vowels) : "a";
      return s + v + suffix;
    }
  }
  // vowel + vowel with a short stem: bridge rather than butt two vowels
  if (s.length > 0 && vs.has(s[s.length - 1]) && startsVowel) {
    return s.slice(0, -1) + suffix;
  }
  return s + suffix;
}

// ---------------------------------------------------------------------------
// Culture name + demonym, derived from the language
// ---------------------------------------------------------------------------

/** Paired endings: culture name suffix / demonym suffix. */
export interface SuffixPair {
  n: string; // culture name, e.g. stem+"in" -> "Vessarin"
  d: string; // demonym, e.g. stem+"i" -> "Vessari"
}

export const SUFFIX_PAIRS: readonly SuffixPair[] = [
  { n: "in", d: "i" },
  { n: "ar", d: "ari" },
  { n: "eth", d: "ethi" },
  { n: "an", d: "ani" },
  { n: "or", d: "ori" },
  { n: "ia", d: "ian" },
  { n: "ul", d: "uli" },
  { n: "esh", d: "eshi" },
];

/** Strip up to two trailing vowels off the language endonym to get a stem. */
export function stemOf(langName: string, ph: Phonology): string {
  const vs = vowelChars(ph);
  let s = langName.toLowerCase();
  let stripped = 0;
  while (s.length > 3 && stripped < 2 && vs.has(s[s.length - 1])) {
    s = s.slice(0, -1);
    stripped++;
  }
  return s;
}

/** Weight suffix pairs so endings agree with the language's allowed finals. */
function pairWeight(pair: SuffixPair, ph: Phonology): number {
  const vs = vowelChars(ph);
  const last = pair.n[pair.n.length - 1];
  if (vs.has(last)) return 1;
  if (ph.finals.some((f) => f.endsWith(last))) return 1;
  return 0.35;
}

/** Detect which suffix pair (if any) produced an existing culture name. */
export function detectSuffixPair(cultureName: string): SuffixPair | null {
  const lower = cultureName.toLowerCase();
  let best: SuffixPair | null = null;
  for (const pair of SUFFIX_PAIRS) {
    if (lower.endsWith(pair.n) && (best === null || pair.n.length > best.n.length)) {
      best = pair;
    }
  }
  return best;
}

export interface CultureNames {
  name: string;
  demonym: string;
}

/**
 * Derive a culture name and demonym that sound kin to the language.
 * The first attempt stems the language's own endonym (so "Vessari" begets
 * "Vessarin" / "Vessari"); later attempts may coin a fresh native word.
 * `taken` guards against collisions with existing culture names.
 * `preferredPair` lets derived cultures keep their parent's ending family.
 */
export function cultureNames(
  rng: Rng,
  lang: Language,
  taken: ReadonlySet<string>,
  preferredPair?: SuffixPair | null,
): CultureNames {
  const ph = lang.phonology;
  for (let attempt = 0; attempt < 10; attempt++) {
    const r = rng.fork("attempt", attempt);
    const stem =
      attempt === 0 || !r.fork("fresh").chance(0.5)
        ? stemOf(lang.name, ph)
        : phonoWord(r.fork("stem"), ph, 2, 2);
    const pair =
      preferredPair && attempt < 3
        ? preferredPair
        : r.fork("pair").weighted(
            SUFFIX_PAIRS,
            SUFFIX_PAIRS.map((p) => pairWeight(p, ph)),
          );
    const name = capitalize(applyOrthography(joinStemSuffix(r.fork("jn"), ph, stem, pair.n), ph));
    const demonym = capitalize(
      applyOrthography(joinStemSuffix(r.fork("jd"), ph, stem, pair.d), ph),
    );
    if (name.length < 3 || demonym.length < 3) continue;
    if (hasForbidden(name.toLowerCase(), ph)) continue;
    if (taken.has(name)) continue;
    return { name, demonym };
  }
  // Deterministic last resort: the endonym itself, marked as a people.
  const base = capitalize(stemOf(lang.name, ph));
  return { name: base + "ath", demonym: base };
}
