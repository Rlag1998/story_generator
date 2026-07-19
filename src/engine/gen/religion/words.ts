/**
 * Native word synthesis from a Language's phonology.
 *
 * The religion module coins deity names, faith endonyms and sacred words in
 * the culture's own tongue. It reads the shared `Language` data from
 * core/types directly (syllable patterns, phoneme inventories, orthography,
 * taboo sequences) so that worldgen for religion stands alone even while the
 * language module is built in parallel. Everything is deterministic in the
 * provided Rng.
 */

import type { Rng } from "../../core/rng";
import type { Language, Phonology } from "../../core/types";

/** Used only when a world lacks a usable language (defensive fallback). */
const FALLBACK_PHONOLOGY: Phonology = {
  consonants: ["k", "t", "n", "r", "s", "m", "l", "d", "v", "th", "h"],
  vowels: ["a", "e", "i", "o", "u"],
  patterns: ["CV", "CVC", "V"],
  patternWeights: [3, 2, 1],
  finals: ["n", "r", "s", "l", "th"],
  orthography: [],
  forbidden: [],
};

function usablePhonology(lang: Language | undefined | null): Phonology {
  const p = lang?.phonology;
  if (!p || p.consonants.length === 0 || p.vowels.length === 0 || p.patterns.length === 0) {
    return FALLBACK_PHONOLOGY;
  }
  return p;
}

/**
 * Assemble a word of `minSyl`..`maxSyl` syllables from the tongue's syllable
 * templates ("CV", "CVC", ...), honoring word-final consonant restrictions,
 * orthography replacements, and forbidden sequences (with bounded retries).
 */
export function forgeWord(
  rng: Rng,
  lang: Language | undefined | null,
  minSyl: number,
  maxSyl: number,
): string {
  const p = usablePhonology(lang);
  const syllables = minSyl >= maxSyl ? minSyl : rng.intIn(minSyl, maxSyl);
  let last = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    let w = "";
    for (let s = 0; s < syllables; s++) {
      const pattern =
        p.patternWeights.length === p.patterns.length
          ? rng.weighted(p.patterns, p.patternWeights)
          : rng.pick(p.patterns);
      for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === "V") {
          w += rng.pick(p.vowels);
        } else {
          const wordFinal = s === syllables - 1 && i === pattern.length - 1;
          if (wordFinal) {
            // Word-final consonants come from the finals set; an empty set
            // means the tongue ends every word open, so drop the coda.
            if (p.finals.length > 0) w += rng.pick(p.finals);
          } else {
            w += rng.pick(p.consonants);
          }
        }
      }
    }
    for (const [from, to] of p.orthography) {
      if (from.length > 0) w = w.split(from).join(to);
    }
    last = w;
    if (w.length >= 2 && !p.forbidden.some((f) => f.length > 0 && w.includes(f))) return w;
  }
  // Last resort: scrub taboo sequences by shaving their first letter, so the
  // guarantee holds even for cramped phonologies.
  for (let guard = 0; guard < 24; guard++) {
    const hit = p.forbidden.find((f) => f.length > 0 && last.includes(f));
    if (!hit) break;
    last = last.replace(hit, hit.slice(1));
  }
  if (last.length < 2) last += p.vowels.length > 0 ? p.vowels[0] + p.vowels[0] : "aa";
  return last;
}

/** Capitalize the first letter (names, endonyms). */
export function cap(w: string): string {
  return w.length === 0 ? w : w[0].toUpperCase() + w.slice(1);
}

/**
 * A proper name in the tongue: 2-3 syllables, capitalized. Retries a few
 * times to avoid runt or all-vowel blobs ("Ua", "Moo") that read as jokes.
 */
export function forgeName(rng: Rng, lang: Language | undefined | null): string {
  let w = "";
  for (let i = 0; i < 6; i++) {
    w = forgeWord(rng, lang, 2, 3);
    if (w.length >= 3 && /[^aeiou]/i.test(w)) break;
  }
  return cap(w);
}

/**
 * A flavor word for a concept: the tongue's lexicon if it already has one,
 * else a fresh coinage (the shared Language object is never mutated).
 */
export function sacredWord(rng: Rng, lang: Language | undefined | null, concept: string): string {
  const hit = lang?.lexicon?.[concept];
  if (hit && hit.length > 0) return hit;
  return forgeWord(rng, lang, 1, 3);
}
