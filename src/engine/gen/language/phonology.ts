/**
 * Sound machinery for generated languages.
 *
 * A language begins as a "sound aesthetic": a bias table over articulation
 * groups (liquids, gutturals, sibilants...) plus vowel color, syllable shape
 * tendencies, and orthography flavor. From an aesthetic we sample a concrete
 * Phonology (the shared type in core/types), and from a Phonology the
 * assembler builds pronounceable, attractive words.
 *
 * Everything here is a pure function of (Rng, inputs) — fully deterministic.
 */

import type { Rng } from "../../core/rng";
import type { Phonology } from "../../core/types";

// ---------------------------------------------------------------------------
// Articulation groups
// ---------------------------------------------------------------------------

const GROUPS: Record<string, string[]> = {
  stopHard: ["p", "t", "k"],
  stopSoft: ["b", "d", "g"],
  fricative: ["f", "v", "s", "z"],
  hush: ["sh", "ch", "j", "zh"],
  breath: ["h", "th", "dh"],
  guttural: ["kh", "gh", "r"],
  nasal: ["m", "n", "ng"],
  liquid: ["l", "r"],
  glide: ["w", "y"],
};

/** Multi-letter graphs treated as single consonant sounds. */
export const DIGRAPHS = ["sch", "th", "sh", "ch", "kh", "gh", "dh", "zh", "ng", "ph", "qu", "ck"];

const SONOROUS = new Set(["m", "n", "l", "r", "v", "s", "th", "sh", "dh", "w", "y", "ng", "h"]);
const SOFT_CODAS = new Set(["n", "m", "r", "l", "s"]);
const LIQUIDISH = new Set(["l", "r", "w", "y", "n", "m", "v"]);
const GEMINABLE = new Set(["l", "m", "n", "r", "s", "t", "k", "p", "d"]);
const STOPPY = new Set(["p", "t", "k", "b", "d", "g", "kh", "gh", "f", "z", "sh", "ch", "j", "zh", "th", "dh", "h"]);

/** Letter pairs that read badly no matter the language. */
const GLOBAL_UGLY = [
  "hh", "ww", "yy", "jj", "vv", "qq", "xx", "ii", "uu",
  "kg", "gk", "pb", "bp", "dt", "td", "fv", "vf", "sz", "zs",
  "tp", "pt", "kp", "pk", "bg", "gb", "gd", "wu", "uw", "ji", "ij", "hw",
];

const BAD_ONSET_CLUSTERS = new Set([
  "tl", "dl", "thl", "dhl", "shl", "khl", "ghl", "zl", "zr", "sr",
  "fw", "vw", "khw", "ghw", "chl", "jl", "jr", "jw", "ngl", "ngr", "ngw", "hl", "hr", "hw",
]);

// ---------------------------------------------------------------------------
// Orthography flavor groups
// ---------------------------------------------------------------------------

/**
 * Named bundles of substitution pairs. A language adopts one or two bundles,
 * applied consistently to every word it ever produces.
 */
const ORTHO_GROUPS: Record<string, [string, string][]> = {
  softC: [["ka", "ca"], ["ko", "co"], ["ku", "cu"]], // k -> c before back vowels
  ecks: [["ks", "x"]],
  quill: [["kw", "qu"]],
  philia: [["f", "ph"]],
  aesc: [["ai", "ae"]],
  eyrie: [["ei", "ey"]],
  longU: [["u", "ou"]],
  // dj only between vowels, so codas never pile up ("adja", never "andja").
  djinn: [["aj", "adj"], ["ej", "edj"], ["ij", "idj"], ["oj", "odj"], ["uj", "udj"]],
  clock: [["kk", "ck"]],
  scald: [["sk", "sc"]],
};

/** Fix-ups applied after orthography (substitutions can abut awkwardly). */
const POST_ORTHO_FIX: [string, string][] = [
  ["kc", "cc"],
  ["cck", "ck"],
  ["phh", "ph"],
  ["xs", "x"],
  ["yy", "y"],
  ["djj", "dj"],
];

function orthoGroupAllowed(key: string, consonants: string[], vowels: string[]): boolean {
  switch (key) {
    case "philia":
      return consonants.includes("f");
    case "aesc":
      return vowels.includes("ai");
    case "eyrie":
      return vowels.includes("ei");
    case "longU":
      return vowels.includes("u") && !vowels.some((v) => v.length > 1 && v.includes("u"));
    case "djinn":
      return consonants.includes("j");
    case "clock":
    case "softC":
      return consonants.includes("k");
    case "scald":
      return consonants.includes("s") && consonants.includes("k");
    case "quill":
      return consonants.includes("k") && consonants.includes("w");
    case "ecks":
      return consonants.includes("k") && consonants.includes("s");
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Sound aesthetics
// ---------------------------------------------------------------------------

export interface SoundAesthetic {
  key: string;
  groupWeights: Record<string, number>;
  invMin: number;
  invMax: number;
  vowelCore: string[];
  vowelExtra: string[];
  diphthongPool: string[];
  diphMin: number;
  diphMax: number;
  /** Multiplier on consonant-cluster syllable patterns. */
  clusterWeight: number;
  /** Multiplier on closed (consonant-final) syllable patterns. */
  closedWeight: number;
  /** Multiplier on bare-vowel word openings. */
  vPatternWeight: number;
  finalsPref: string[];
  finalsMin: number;
  finalsMax: number;
  orthoKeys: string[];
  forbiddenExtra: string[];
}

export const AESTHETICS: SoundAesthetic[] = [
  {
    key: "riverine", // liquid, vowel-rich, flowing
    groupWeights: { liquid: 3.2, nasal: 2.4, glide: 2.0, stopSoft: 1.3, stopHard: 1.0, fricative: 1.1, breath: 0.9, hush: 0.35, guttural: 0.15 },
    invMin: 9, invMax: 12,
    vowelCore: ["a", "e", "i", "o", "u"], vowelExtra: [],
    diphthongPool: ["ai", "ei", "ia", "ea", "io", "ua"], diphMin: 2, diphMax: 3,
    clusterWeight: 0.35, closedWeight: 0.55, vPatternWeight: 1.3,
    finalsPref: ["n", "l", "r", "m", "s", "th"], finalsMin: 3, finalsMax: 5,
    orthoKeys: ["aesc", "softC", "eyrie"],
    forbiddenExtra: ["kk", "gg"],
  },
  {
    key: "cragborn", // guttural, cluster-heavy, stony
    groupWeights: { guttural: 3.2, stopSoft: 2.2, stopHard: 2.0, breath: 1.3, nasal: 1.3, fricative: 1.1, liquid: 1.1, hush: 0.5, glide: 0.2 },
    invMin: 10, invMax: 14,
    vowelCore: ["a", "o", "u", "e"], vowelExtra: ["i"],
    diphthongPool: ["au", "ou", "ua"], diphMin: 0, diphMax: 1,
    clusterWeight: 1.4, closedWeight: 1.6, vPatternWeight: 0.5,
    finalsPref: ["k", "g", "kh", "gh", "r", "n", "d", "m", "t"], finalsMin: 4, finalsMax: 6,
    orthoKeys: ["clock", "scald", "quill"],
    forbiddenExtra: [],
  },
  {
    key: "serpentine", // sibilant, hissing, sinuous
    groupWeights: { hush: 2.8, fricative: 2.6, stopHard: 1.5, liquid: 1.3, nasal: 1.1, stopSoft: 0.8, glide: 0.7, breath: 0.6, guttural: 0.3 },
    invMin: 9, invMax: 12,
    vowelCore: ["a", "e", "i"], vowelExtra: ["o", "u"],
    diphthongPool: ["ai", "ei", "ia", "ui"], diphMin: 1, diphMax: 2,
    clusterWeight: 0.6, closedWeight: 0.9, vPatternWeight: 0.7,
    finalsPref: ["s", "sh", "z", "n", "r", "th", "l", "t"], finalsMin: 3, finalsMax: 5,
    orthoKeys: ["djinn", "ecks", "aesc"],
    forbiddenExtra: [],
  },
  {
    key: "drumbeat", // plosive, staccato, clipped
    groupWeights: { stopHard: 3.0, stopSoft: 2.4, nasal: 1.6, liquid: 0.8, guttural: 0.7, fricative: 0.7, glide: 0.4, hush: 0.4, breath: 0.3 },
    invMin: 8, invMax: 11,
    vowelCore: ["a", "e", "i", "o", "u"], vowelExtra: [],
    diphthongPool: ["ai", "au"], diphMin: 0, diphMax: 1,
    clusterWeight: 0.35, closedWeight: 1.4, vPatternWeight: 0.6,
    finalsPref: ["k", "t", "p", "n", "m", "d", "g"], finalsMin: 3, finalsMax: 5,
    orthoKeys: ["clock", "ecks"],
    forbiddenExtra: [],
  },
  {
    key: "veilspoken", // breathy, aspirated, misty
    groupWeights: { breath: 3.0, glide: 1.7, liquid: 1.6, nasal: 1.5, fricative: 1.3, stopHard: 1.0, stopSoft: 0.7, hush: 0.6, guttural: 0.5 },
    invMin: 8, invMax: 12,
    vowelCore: ["a", "e", "i", "o", "u"], vowelExtra: [],
    diphthongPool: ["ea", "ia", "ua", "ai", "ou"], diphMin: 2, diphMax: 3,
    clusterWeight: 0.2, closedWeight: 0.6, vPatternWeight: 1.5,
    finalsPref: ["th", "n", "s", "l", "r", "dh", "m"], finalsMin: 3, finalsMax: 5,
    orthoKeys: ["philia", "longU", "aesc"],
    forbiddenExtra: [],
  },
  {
    key: "bellsong", // nasal, melodic, ringing
    groupWeights: { nasal: 3.0, liquid: 2.2, stopSoft: 1.5, glide: 1.3, fricative: 1.0, stopHard: 0.9, breath: 0.6, hush: 0.5, guttural: 0.15 },
    invMin: 8, invMax: 11,
    vowelCore: ["a", "e", "i", "o", "u"], vowelExtra: [],
    diphthongPool: ["ia", "io", "ea", "ei"], diphMin: 1, diphMax: 2,
    clusterWeight: 0.25, closedWeight: 1.0, vPatternWeight: 0.9,
    finalsPref: ["n", "m", "ng", "l", "r", "s"], finalsMin: 3, finalsMax: 5,
    orthoKeys: ["softC", "eyrie"],
    forbiddenExtra: [],
  },
];

/** Blend two aesthetics into a hybrid (for extra cross-world variety). */
export function blendAesthetics(a: SoundAesthetic, b: SoundAesthetic): SoundAesthetic {
  const gw: Record<string, number> = {};
  for (const k of Object.keys(GROUPS)) {
    gw[k] = ((a.groupWeights[k] ?? 0) + (b.groupWeights[k] ?? 0)) / 2;
  }
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    key: a.key + "-" + b.key,
    groupWeights: gw,
    invMin: Math.round((a.invMin + b.invMin) / 2),
    invMax: Math.round((a.invMax + b.invMax) / 2),
    vowelCore: uniq([...a.vowelCore, ...b.vowelCore]),
    vowelExtra: uniq([...a.vowelExtra, ...b.vowelExtra]),
    diphthongPool: uniq([...a.diphthongPool, ...b.diphthongPool]),
    diphMin: Math.min(a.diphMin, b.diphMin),
    diphMax: Math.max(a.diphMax, b.diphMax),
    clusterWeight: (a.clusterWeight + b.clusterWeight) / 2,
    closedWeight: (a.closedWeight + b.closedWeight) / 2,
    vPatternWeight: (a.vPatternWeight + b.vPatternWeight) / 2,
    finalsPref: uniq([...a.finalsPref, ...b.finalsPref]),
    finalsMin: Math.min(a.finalsMin, b.finalsMin),
    finalsMax: Math.max(a.finalsMax, b.finalsMax),
    orthoKeys: uniq([...a.orthoKeys, ...b.orthoKeys]),
    forbiddenExtra: uniq([...a.forbiddenExtra, ...b.forbiddenExtra]),
  };
}

// ---------------------------------------------------------------------------
// Phonology construction
// ---------------------------------------------------------------------------

export function buildPhonology(rng: Rng, aes: SoundAesthetic): Phonology {
  // Consonant inventory: weighted sample without replacement across groups.
  const weightOf = new Map<string, number>();
  for (const g of Object.keys(GROUPS)) {
    const gw = aes.groupWeights[g] ?? 0;
    for (const c of GROUPS[g]) weightOf.set(c, (weightOf.get(c) ?? 0) + gw);
  }
  const candidates = [...weightOf.keys()];
  const size = rng.fork("invsize").intIn(aes.invMin, aes.invMax);
  const consonants: string[] = [];
  const pool = candidates.slice();
  const poolW = pool.map((c) => weightOf.get(c) ?? 0.01);
  const cRng = rng.fork("consonants");
  while (consonants.length < size && pool.length > 0) {
    const pick = cRng.weighted(pool, poolW);
    const i = pool.indexOf(pick);
    pool.splice(i, 1);
    poolW.splice(i, 1);
    consonants.push(pick);
  }
  // Essentials: a nasal, a stop, and a liquid keep any tongue speakable.
  if (!consonants.includes("n") && !consonants.includes("m")) consonants.push("n");
  if (!consonants.some((c) => c === "t" || c === "k" || c === "d" || c === "b" || c === "p" || c === "g")) consonants.push("t");
  if (!consonants.includes("l") && !consonants.includes("r")) consonants.push(cRng.pick(["l", "r"]));

  // Vowels.
  const vRng = rng.fork("vowels");
  const vowels = [...aes.vowelCore];
  for (const v of aes.vowelExtra) if (vRng.chance(0.5)) vowels.push(v);
  const diphCount = vRng.intIn(aes.diphMin, aes.diphMax);
  for (const d of vRng.pickN(aes.diphthongPool, diphCount)) vowels.push(d);

  // Syllable patterns with weights.
  const pRng = rng.fork("patterns");
  const raw: [string, number][] = [
    ["CV", 10],
    ["CVC", 6.5 * aes.closedWeight * pRng.range(0.8, 1.25)],
    ["V", 1.6 * aes.vPatternWeight * pRng.range(0.7, 1.3)],
    ["VC", 1.1 * aes.vPatternWeight * aes.closedWeight * pRng.range(0.7, 1.3)],
    ["CCV", 5.5 * aes.clusterWeight * pRng.range(0.7, 1.3)],
    ["CCVC", 3.5 * aes.clusterWeight * aes.closedWeight * pRng.range(0.7, 1.3)],
  ];
  if (pRng.chance(0.3)) raw.push(["CVV", 0.9]);
  const patterns: string[] = [];
  const patternWeights: number[] = [];
  for (const [p, w] of raw) {
    if (w > 0.18) {
      patterns.push(p);
      patternWeights.push(Math.round(w * 100) / 100);
    }
  }

  // Word-final consonants.
  const fRng = rng.fork("finals");
  const prefAvail = aes.finalsPref.filter((f) => consonants.includes(f));
  let finals = fRng.pickN(prefAvail, fRng.intIn(aes.finalsMin, aes.finalsMax));
  if (finals.length === 0) finals = consonants.filter((c) => SOFT_CODAS.has(c)).slice(0, 3);
  if (finals.length === 0) finals = ["n"];

  // Orthography flavor.
  const oRng = rng.fork("ortho");
  const orthography: [string, string][] = [];
  let groupsTaken = 0;
  for (const key of aes.orthoKeys) {
    if (groupsTaken >= 2) break;
    if (!orthoGroupAllowed(key, consonants, vowels)) continue;
    if (oRng.chance(0.55)) {
      for (const pair of ORTHO_GROUPS[key]) orthography.push([pair[0], pair[1]]);
      groupsTaken++;
    }
  }

  const forbidden = [...GLOBAL_UGLY, ...aes.forbiddenExtra];

  return { consonants, vowels, patterns, patternWeights, finals, orthography, forbidden };
}

// ---------------------------------------------------------------------------
// Word assembly
// ---------------------------------------------------------------------------

export interface WordSpec {
  /** Inclusive syllable count range. */
  syllables: [number, number];
  /** Optional weights parallel to counts min..max. */
  sylWeights?: number[];
  /** Deity mode: favor resonants, open syllables, long vowels. */
  sonorous?: boolean;
  /** Force vowel ending (stems that will take suffixes). */
  endOpen?: boolean;
  /** Force consonant ending (from finals). */
  endClosed?: boolean;
  maxLen?: number;
}

function legalOnsetClusters(consonants: string[]): string[] {
  const firsts = ["p", "t", "k", "b", "d", "g", "f", "v", "th", "sh", "kh", "gh", "s"];
  const seconds = ["l", "r", "w"];
  const out: string[] = [];
  for (const a of firsts) {
    if (!consonants.includes(a)) continue;
    for (const b of seconds) {
      if (!consonants.includes(b)) continue;
      if (BAD_ONSET_CLUSTERS.has(a + b)) continue;
      out.push(a + b);
    }
  }
  if (consonants.includes("s")) {
    for (const b of ["p", "t", "k", "m", "n", "w"]) {
      if (consonants.includes(b)) out.push("s" + b);
    }
  }
  return [...new Set(out)];
}

function medialCodas(phon: Phonology): string[] {
  const soft = phon.consonants.filter((c) => SOFT_CODAS.has(c));
  const hard = phon.finals.filter((c) => ["k", "t", "d", "g", "kh", "gh", "sh", "th"].includes(c));
  return [...new Set([...soft, ...hard])];
}

function pickCount(rng: Rng, spec: WordSpec): number {
  const [lo, hi] = spec.syllables;
  if (lo >= hi) return lo;
  const counts: number[] = [];
  for (let c = lo; c <= hi; c++) counts.push(c);
  if (spec.sylWeights && spec.sylWeights.length === counts.length) {
    return rng.weighted(counts, spec.sylWeights);
  }
  // Default: middle-heavy.
  const w = counts.map((c, i) => (i === 0 || i === counts.length - 1 ? 1 : 2.2));
  return rng.weighted(counts, w);
}

function pickOnset(rng: Rng, phon: Phonology, prevOnset: string, sonorous: boolean): string {
  const cands = phon.consonants.filter((c) => c !== "ng");
  if (cands.length === 0) return "n";
  const weights = cands.map((c) => {
    let w = 1;
    if (sonorous && SONOROUS.has(c)) w *= 3;
    if (sonorous && (c === "j" || c === "ch" || c === "p")) w *= 0.4;
    if (c === prevOnset) w *= 0.22; // discourage sing-song repeats
    if (c === "h") w *= 0.6;
    return w;
  });
  return rng.weighted(cands, weights);
}

function pickVowel(rng: Rng, phon: Phonology, sonorous: boolean): string {
  const weights = phon.vowels.map((v) => {
    let w = v.length > 1 ? 0.4 : 1; // diphthongs are seasoning, not staple
    if (sonorous && (v === "a" || v === "o" || v.length > 1)) w *= 1.7;
    return w;
  });
  return rng.weighted(phon.vowels, weights);
}

/**
 * Assemble a raw (pre-orthography) lowercase word.
 * Guarantees: no vowel-hiatus pileups, no cluster after a closed syllable,
 * codas restricted to speakable sets, digraph-aware.
 */
export function assembleRaw(rng: Rng, phon: Phonology, spec: WordSpec): string {
  const clusters = legalOnsetClusters(phon.consonants);
  const medials = medialCodas(phon);
  const count = pickCount(rng, spec);
  let out = "";
  let prevCoda = "";
  let prevOnset = "";

  for (let i = 0; i < count; i++) {
    const isFirst = i === 0;
    const isLast = i === count - 1;
    let pattern = rng.weighted(phon.patterns, phon.patternWeights);
    if (spec.sonorous && (pattern === "CVC" || pattern === "CCVC") && rng.chance(0.5)) {
      pattern = pattern === "CVC" ? "CV" : "CCV";
    }
    // Vowel-initial syllables only open a word; mid-word they collide.
    if (!isFirst && (pattern === "V" || pattern === "VC")) {
      pattern = pattern === "V" ? "CV" : "CVC";
    }
    // No cluster onsets right after a closed syllable.
    if (prevCoda !== "" && pattern.startsWith("CC")) pattern = pattern.slice(1);
    // Ending discipline.
    if (isLast && spec.endOpen && pattern.endsWith("C")) pattern = pattern.slice(0, -1);
    if (isLast && spec.endClosed && !pattern.endsWith("C") && phon.finals.length > 0) pattern += "C";

    let syl = "";
    let onset = "";
    let j = 0;
    while (j < pattern.length) {
      const ch = pattern[j];
      if (ch === "C" && j === 0) {
        if (pattern.startsWith("CC")) {
          onset = clusters.length > 0 ? rng.pick(clusters) : pickOnset(rng, phon, prevOnset, !!spec.sonorous);
          j += 2;
        } else {
          onset = pickOnset(rng, phon, prevOnset, !!spec.sonorous);
          // After a hard coda only liquid-ish onsets flow; "h" flows after none.
          if (
            prevCoda !== "" &&
            (onset === "h" || (STOPPY.has(prevCoda) && !LIQUIDISH.has(onset)))
          ) {
            const flowing = phon.consonants.filter((c) => LIQUIDISH.has(c));
            if (flowing.length > 0) onset = rng.pick(flowing);
            else onset = ""; // vowel-initial after consonant coda is fine
          }
          // Coda + same onset makes a geminate: pretty for some letters only.
          if (onset !== "" && onset === prevCoda && !GEMINABLE.has(onset)) {
            const alts = phon.consonants.filter((c) => c !== onset && c !== "ng");
            if (alts.length > 0) onset = rng.pick(alts);
          }
          j += 1;
        }
        syl += onset;
      } else if (ch === "C") {
        // Coda position.
        let coda: string;
        if (isLast) {
          coda = phon.finals.length > 0 ? rng.pick(phon.finals) : "";
        } else {
          coda = medials.length > 0 ? rng.pick(medials) : "";
        }
        syl += coda;
        prevCoda = coda;
        j += 1;
      } else {
        // Vowel slot.
        let v = pickVowel(rng, phon, !!spec.sonorous);
        if (pattern === "CVV" && syl.length > onset.length) {
          // Second V of a CVV: a simple vowel differing from the one before it.
          const prevLetter = syl[syl.length - 1];
          const simple = phon.vowels.filter((x) => x.length === 1 && x !== prevLetter);
          v = simple.length > 0 ? rng.pick(simple) : "";
        }
        syl += v;
        if (!pattern.endsWith("C") || j < pattern.length - 1) prevCoda = "";
        j += 1;
      }
    }
    if (!pattern.endsWith("C")) prevCoda = "";
    prevOnset = onset;
    out += syl;
  }
  return cleanup(out, phon);
}

// ---------------------------------------------------------------------------
// Cleanup, orthography, finishing
// ---------------------------------------------------------------------------

/** Digraph-aware tokenizer: splits a lowercase word into sound units. */
export function soundTokens(word: string): string[] {
  const toks: string[] = [];
  let i = 0;
  while (i < word.length) {
    const three = word.slice(i, i + 3);
    const two = word.slice(i, i + 2);
    if (DIGRAPHS.includes(three)) {
      toks.push(three);
      i += 3;
    } else if (DIGRAPHS.includes(two)) {
      toks.push(two);
      i += 2;
    } else {
      toks.push(word[i]);
      i += 1;
    }
  }
  return toks;
}

function isVowelish(tok: string): boolean {
  return /^[aeiou]/.test(tok);
}

/** Collapse triples, vowel pileups, and forbidden sequences. */
export function cleanup(word: string, phon: Phonology): string {
  let w = word.toLowerCase();
  for (let pass = 0; pass < 3; pass++) {
    w = w.replace(/(.)\1\1+/g, "$1$1");
    w = w.replace(/[aeiou]{3,}/g, (m) => m.slice(0, 2));
    for (const bad of phon.forbidden) {
      while (w.includes(bad)) w = w.replace(bad, bad[0]);
    }
  }
  // Safety net: never allow three consonant sounds in a row.
  const toks = soundTokens(w);
  const vowelInsert = phon.vowels.find((v) => v.length === 1) ?? "a";
  let run = 0;
  const rebuilt: string[] = [];
  for (const t of toks) {
    if (isVowelish(t) || t === "'" || t === " " || t === "-") run = 0;
    else run++;
    if (run >= 3) {
      rebuilt.push(vowelInsert);
      run = 1;
    }
    rebuilt.push(t);
  }
  w = rebuilt.join("");
  // No lonely trailing h/w/j after a consonant (but keep digraphs like -th).
  w = w.replace(/([bfjlmnqrvx])h$/g, "$1");
  w = w.replace(/([bcdfgjklmnpqrstvxz])[wj]$/g, "$1");
  return w;
}

/** Apply the language's orthography substitutions plus fix-ups. */
export function applyOrthography(word: string, phon: Phonology): string {
  let w = word;
  for (const [from, to] of phon.orthography) w = w.split(from).join(to);
  for (const [from, to] of POST_ORTHO_FIX) w = w.split(from).join(to);
  w = w.replace(/(.)\1\1+/g, "$1$1");
  return w;
}

export function capitalize(w: string): string {
  if (w.length === 0) return w;
  return w[0].toUpperCase() + w.slice(1);
}

/** Full pipeline: cleanup -> orthography -> capitalize. */
export function finishWord(raw: string, phon: Phonology): string {
  return capitalize(applyOrthography(cleanup(raw, phon), phon));
}

/**
 * Assemble a finished word, retrying on length overruns and degenerate output.
 */
export function makeWord(rng: Rng, phon: Phonology, spec: WordSpec): string {
  const maxLen = spec.maxLen ?? 12;
  for (let attempt = 0; attempt < 6; attempt++) {
    const shrunk: WordSpec =
      attempt < 3
        ? spec
        : { ...spec, syllables: [spec.syllables[0], Math.max(spec.syllables[0], spec.syllables[1] - 1)] };
    const raw = assembleRaw(rng, phon, shrunk);
    const done = finishWord(raw, phon);
    if (done.length >= 2 && done.length <= maxLen) return done;
  }
  // Deterministic fallback: a plain CVCV shape can never fail.
  const c1 = pickOnset(rng, phon, "", false);
  const c2 = pickOnset(rng, phon, c1, false);
  const v1 = pickVowel(rng, phon, false);
  const v2 = phon.vowels.find((v) => v.length === 1) ?? "a";
  return finishWord(c1 + v1 + c2 + v2, phon);
}

// ---------------------------------------------------------------------------
// Compounding (place names, month names, surnames)
// ---------------------------------------------------------------------------

function codaTokenOf(w: string): string {
  const toks = soundTokens(w);
  return toks.length > 0 ? toks[toks.length - 1] : "";
}

function onsetTokenOf(w: string): string {
  const toks = soundTokens(w);
  return toks.length > 0 ? toks[0] : "";
}

/**
 * Join two finished (or raw) lowercase parts with boundary smoothing so
 * compounds stay pronounceable: drop hiatus vowels, break illegal clusters.
 */
export function smoothJoin(rng: Rng, phon: Phonology, a: string, b: string): string {
  let left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  const lEnd = codaTokenOf(left);
  const rStart = onsetTokenOf(right);
  const lVowel = isVowelish(lEnd);
  const rVowel = isVowelish(rStart);
  if (lVowel && rVowel) {
    // Hiatus: drop the left part's final vowel.
    left = left.slice(0, left.length - lEnd.length);
  } else if (!lVowel && !rVowel) {
    if (lEnd === rStart) {
      if (!GEMINABLE.has(lEnd)) left = left.slice(0, left.length - lEnd.length);
    } else if (!(SOFT_CODAS.has(lEnd) || LIQUIDISH.has(rStart))) {
      // Unspeakable seam: bridge with a short vowel.
      const v = phon.vowels.filter((x) => x.length === 1);
      left = left + (v.length > 0 ? rng.pick(v) : "a");
    }
  }
  let joined = left + right;
  joined = joined.replace(/(.)\1\1+/g, "$1$1");
  joined = joined.replace(/[aeiou]{3,}/g, (m) => m.slice(0, 2));
  return joined;
}

/**
 * Clip a morpheme to a target letter length at a sensible sound boundary
 * (never mid-digraph, never leaving a stranded breathy letter).
 */
export function clipMorph(word: string, maxLen: number): string {
  const w = word.toLowerCase();
  const toks = soundTokens(w);
  let kept = toks;
  if (w.length > maxLen) {
    kept = [];
    let len = 0;
    for (const t of toks) {
      if (len + t.length > maxLen) break;
      kept.push(t);
      len += t.length;
    }
    if (kept.length === 0) kept = [toks[0]];
  }
  const isV = (t: string) => /^[aeiou]/.test(t);
  // Never end on a consonant pile or a stranded breathy letter.
  while (kept.length >= 2 && !isV(kept[kept.length - 1]) && !isV(kept[kept.length - 2])) kept.pop();
  const last = kept[kept.length - 1];
  if (kept.length >= 2 && (last === "h" || last === "w" || last === "j")) kept.pop();
  let out = kept.join("");
  if (out.length < 2) out = w.slice(0, 2);
  return out;
}

// ---------------------------------------------------------------------------
// Sound shifts (for derive())
// ---------------------------------------------------------------------------

/** Historical-linguistics-flavored consonant correspondences. */
export const SHIFT_CANDIDATES: [string, string][] = [
  ["p", "b"], ["b", "p"], ["b", "v"], ["t", "d"], ["d", "t"], ["d", "dh"],
  ["k", "g"], ["g", "k"], ["g", "gh"], ["f", "p"], ["f", "h"], ["v", "b"],
  ["v", "w"], ["w", "v"], ["s", "sh"], ["s", "z"], ["sh", "s"], ["z", "s"],
  ["th", "d"], ["th", "t"], ["dh", "d"], ["kh", "h"], ["kh", "k"],
  ["gh", "g"], ["ch", "sh"], ["j", "y"], ["y", "j"], ["ng", "n"],
  ["l", "r"], ["r", "l"], ["m", "n"],
];

const VOWEL_SHIFTS: [string, string][] = [
  ["u", "o"], ["o", "u"], ["e", "i"], ["i", "e"], ["o", "a"], ["a", "e"],
];

/**
 * Choose a systematic shift map for a daughter language: 2-4 consonant
 * shifts drawn from correspondences present in the parent, plus sometimes
 * one vowel shift.
 */
export function buildShiftMap(rng: Rng, parent: Phonology): Map<string, string> {
  const map = new Map<string, string>();
  const applicable = SHIFT_CANDIDATES.filter(([from]) => parent.consonants.includes(from));
  const wanted = rng.intIn(2, 4);
  const picks = rng.pickN(applicable, Math.min(applicable.length, wanted + 2));
  for (const [from, to] of picks) {
    if (map.size >= wanted) break;
    if (!map.has(from)) map.set(from, to);
  }
  if (rng.chance(0.55)) {
    const vApplicable = VOWEL_SHIFTS.filter(([from]) => parent.vowels.includes(from));
    if (vApplicable.length > 0) {
      const [from, to] = rng.pick(vApplicable);
      map.set(from, to);
    }
  }
  return map;
}

/**
 * Apply a shift map to a word in a single pass (no cascading), digraph-aware,
 * preserving capitalization of the first letter and any spaces/punctuation.
 */
export function applyShift(word: string, map: Map<string, string>): string {
  const wasCapital = word.length > 0 && word[0] !== word[0].toLowerCase();
  const toks = soundTokens(word.toLowerCase());
  let out = "";
  for (const t of toks) out += map.get(t) ?? t;
  out = out.replace(/(.)\1\1+/g, "$1$1");
  return wasCapital ? capitalize(out) : out;
}

// ---------------------------------------------------------------------------
// Validation (exported for tests)
// ---------------------------------------------------------------------------

/**
 * True if a word reads as pronounceable: no triple letters, and never three
 * consonant sounds in a row (digraphs count as one sound). Spaces, hyphens
 * and apostrophes reset the count (patronymic particles, compound names).
 */
export function pronounceable(word: string): boolean {
  const lower = word.toLowerCase();
  if (/(.)\1\1/.test(lower)) return false;
  for (const part of lower.split(/[\s\-']+/)) {
    if (part.length === 0) continue;
    let run = 0;
    for (const t of soundTokens(part)) {
      if (/^[aeiou]/.test(t)) {
        run = 0;
      } else {
        run++;
        if (run >= 3) return false;
      }
    }
  }
  return true;
}
