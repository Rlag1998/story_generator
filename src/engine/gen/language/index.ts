/**
 * Language module — the voice of every world.
 *
 * All names in Aeonspire (people, places, gods, months, epithets) flow from
 * here. Each world's languages are built from distinct sound aesthetics so
 * no two worlds sound alike; daughter languages are derived by systematic
 * sound shifts so sibling cultures sound related but distinct.
 *
 * Determinism: every method draws only from the Rng handed to it, except the
 * lexicon (`word()`), which uses a private stream seeded from the language's
 * own stable content so a concept's word never depends on who asked first.
 */

import { fnv1a, Rng } from "../../core/rng";
import type { Language, LanguageService, Phonology, Sex } from "../../core/types";
import {
  AESTHETICS,
  applyOrthography,
  applyShift,
  assembleRaw,
  blendAesthetics,
  buildPhonology,
  buildShiftMap,
  capitalize,
  cleanup,
  clipMorph,
  finishWord,
  makeWord,
  smoothJoin,
  soundTokens,
} from "./phonology";
import { pickEpithet } from "./epithets";

export { pronounceable, soundTokens, AESTHETICS } from "./phonology";
export { EPITHET_THEMES } from "./epithets";

// ---------------------------------------------------------------------------
// Concept pools
// ---------------------------------------------------------------------------

/** Month concepts in calendar order (month 1 = deep winter). */
export const MONTH_CONCEPTS = [
  "wolf-hunger", "thaw", "sowing", "rain", "blossom", "meadow",
  "high-sun", "harvest", "vintage", "mist", "frost", "long-night",
];

const SETTLEMENT_MORPHS = [
  "ford", "haven", "keep", "bridge", "field", "mere", "strand", "spring", "market", "tower",
];
const REGION_MORPHS = [
  "wold", "fell", "moor", "dale", "vale", "reach", "marsh", "shore", "wood", "hollow",
];
const STEM_FLAVOR = [
  "oak", "ash", "rowan", "stone", "grey", "black", "white", "red", "gold",
  "raven", "wolf", "salt", "winter", "king", "old", "high", "cold", "bright", "deep", "thorn",
];
const CRAFT_CONCEPTS = [
  "smith", "weaver", "miller", "fisher", "shepherd", "mason",
  "tanner", "wright", "potter", "dyer", "hunter", "carver",
];
const TOTEM_CONCEPTS = [
  "wolf", "raven", "bear", "hawk", "fox", "boar", "stag", "owl", "serpent", "eagle", "hare", "heron",
];
const REALM_CONCEPTS = ["realm", "crown", "throne"];

const SOFT_ENDING_CONS = ["l", "m", "n", "r", "s", "th", "sh", "v", "w", "y", "dh"];

// ---------------------------------------------------------------------------
// Stable per-language streams (call-order independent)
// ---------------------------------------------------------------------------

function langKey(lang: Language): string {
  return (
    lang.family + "|" + lang.name + "|" +
    lang.phonology.consonants.join(".") + "|" + lang.phonology.vowels.join(".")
  );
}

function stableRng(lang: Language, ...parts: (string | number)[]): Rng {
  const label = "lex/" + parts.join(":");
  return new Rng(fnv1a(langKey(lang) + "" + parts.join(":")), label);
}

/** Deterministic (rng-free) join for patronymics: seeded purely by inputs. */
function dJoin(phon: Phonology, a: string, b: string): string {
  const r = new Rng(fnv1a("djoin" + a + "" + b), "djoin");
  return smoothJoin(r, phon, a, b);
}

/** Strip a leading consonant cluster from an affix so it attaches cleanly. */
function tameAffix(w: string): string {
  const toks = soundTokens(w.toLowerCase());
  if (toks.length >= 2 && !/^[aeiou]/.test(toks[0]) && !/^[aeiou]/.test(toks[1])) {
    return toks.slice(1).join("");
  }
  return w.toLowerCase();
}

// ---------------------------------------------------------------------------
// Lexicon (stable native words per concept)
// ---------------------------------------------------------------------------

function lexeme(lang: Language, concept: string): string {
  const key = concept.trim().toLowerCase();
  const existing = lang.lexicon[key];
  if (existing !== undefined) return existing;
  let w = "";
  for (let salt = 0; salt < 5; salt++) {
    const r = stableRng(lang, "word", key, salt);
    const made = makeWord(r, lang.phonology, {
      syllables: [1, 3],
      sylWeights: [1.4, 2.6, 0.8],
      maxLen: 8,
    }).toLowerCase();
    w = made;
    // Homophone pressure: retry a few times if another concept owns this word.
    let taken = false;
    for (const k of Object.keys(lang.lexicon)) {
      if (lang.lexicon[k] === made) {
        taken = true;
        break;
      }
    }
    if (!taken) break;
  }
  lang.lexicon[key] = w;
  return w;
}

// ---------------------------------------------------------------------------
// Gendered endings & patronymic affixes
// ---------------------------------------------------------------------------

function genEndings(rng: Rng, phon: Phonology): { female: string[]; male: string[] } {
  const soft = phon.consonants.filter((c) => SOFT_ENDING_CONS.includes(c));
  const softSafe = soft.length > 0 ? soft : ["n", "l"];
  const vowels = phon.vowels.filter((v) => v.length === 1);
  const vSafe = vowels.length > 0 ? vowels : ["a"];
  const bright = vSafe.filter((v) => v === "a" || v === "e" || v === "i");
  const vBright = bright.length > 0 ? bright : vSafe;
  const finals = phon.finals.length > 0 ? phon.finals : softSafe;

  const female: string[] = [];
  const fRng = rng.fork("f");
  for (let i = 0; i < 10 && female.length < 6; i++) {
    const kind = fRng.weightedPairs([
      ["V", 2], ["VS", 2], ["SV", 1.6], ["VSV", 1.6], ["SVS", 1.4],
    ] as const);
    let e = "";
    if (kind === "V") e = fRng.pick(vBright);
    else if (kind === "VS") e = fRng.pick(vBright) + fRng.pick(softSafe);
    else if (kind === "SV") e = fRng.pick(softSafe) + fRng.pick(vBright);
    else if (kind === "VSV") e = fRng.pick(vBright) + fRng.pick(softSafe) + fRng.pick(vSafe);
    else {
      // Mirror endings like "rir"/"vev" sound comic: force distinct consonants.
      const s1 = fRng.pick(softSafe);
      const rest = softSafe.filter((c) => c !== s1);
      const s2 = rest.length > 0 ? fRng.pick(rest) : s1 === "n" ? "l" : "n";
      e = s1 + fRng.pick(vBright) + s2;
    }
    if (e.length <= 4 && !female.includes(e)) female.push(e);
  }
  if (female.length === 0) female.push("a", "is");

  const male: string[] = [];
  const mRng = rng.fork("m");
  for (let i = 0; i < 12 && male.length < 6; i++) {
    const kind = mRng.weightedPairs([["C", 1.6], ["VC", 2.6], ["CVC", 2.2]] as const);
    let e = "";
    if (kind === "C") e = mRng.pick(finals);
    else if (kind === "VC") e = mRng.pick(vSafe) + mRng.pick(finals);
    else {
      const onset = mRng.pick(phon.consonants.filter((c) => c !== "ng"));
      const codas = finals.filter((c) => c !== onset);
      e = onset + mRng.pick(vSafe) + (codas.length > 0 ? mRng.pick(codas) : "n");
    }
    if (e.length <= 4 && !male.includes(e) && !female.includes(e)) male.push(e);
  }
  if (male.length === 0) male.push("an", "or");
  return { female, male };
}

function genPatronymics(
  rng: Rng,
  phon: Phonology,
): { f: [string, string]; m: [string, string] } {
  if (rng.chance(0.62)) {
    // Suffix style, like a generated cousin of "-ssen" / "-sdottir".
    const coreM = tameAffix(
      applyOrthography(
        cleanup(assembleRaw(rng.fork("sm"), phon, { syllables: [1, 1], endClosed: true, maxLen: 4 }), phon),
        phon,
      ),
    );
    const coreF = tameAffix(
      applyOrthography(
        cleanup(assembleRaw(rng.fork("sf"), phon, { syllables: [1, 2], sylWeights: [1.6, 1], maxLen: 6 }), phon),
      phon),
    );
    return { f: ["", coreF], m: ["", coreM] };
  }
  // Prefix particle style, like a generated cousin of "ap ".
  const pRng = rng.fork("particle");
  const makeParticle = (r: Rng): string =>
    tameAffix(cleanup(assembleRaw(r, phon, { syllables: [1, 1], endOpen: r.chance(0.5), maxLen: 3 }), phon));
  const pm = makeParticle(pRng.fork("m"));
  const pf = pRng.chance(0.55) ? makeParticle(pRng.fork("f")) : pm;
  return { f: [pf + " ", ""], m: [pm + " ", ""] };
}

// ---------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------

export function createLanguageService(): LanguageService {
  function generateFrom(rng: Rng, phon: Phonology, family: string | undefined): Language {
    const name = makeWord(rng.fork("endonym"), phon, { syllables: [2, 3], maxLen: 9 });
    let fam = family;
    if (!fam) {
      const suffix = rng.fork("famsuffix").pick(["ic", "ine", "ari", "ish", "ian", "eth"]);
      let base = name.toLowerCase();
      if (/[aeiou]$/.test(base) && /^[aeiou]/.test(suffix)) base = base.slice(0, -1);
      fam = capitalize(base + suffix);
    }
    const endings = genEndings(rng.fork("endings"), phon);
    const patro = genPatronymics(rng.fork("patronymic"), phon);
    const lang: Language = {
      id: 0,
      name,
      family: fam,
      parent: null,
      phonology: phon,
      femaleEndings: endings.female,
      maleEndings: endings.male,
      patronymicF: patro.f,
      patronymicM: patro.m,
      lexicon: {},
      monthNames: [],
    };
    // Seed 8-15 place morphemes so the map speaks this tongue consistently.
    const morphRng = rng.fork("morphs");
    const morphCount = morphRng.intIn(8, 15);
    const allMorphs = [...SETTLEMENT_MORPHS, ...REGION_MORPHS];
    for (const concept of morphRng.pickN(allMorphs, morphCount)) lexeme(lang, concept);
    lang.monthNames = genMonthNames(rng.fork("months"), lang);
    return lang;
  }

  function genMonthNames(rng: Rng, lang: Language): string[] {
    const phon = lang.phonology;
    const useMoon = rng.chance(0.55);
    const moon = clipMorph(lexeme(lang, "moon"), 4);
    const names: string[] = [];
    for (let i = 0; i < MONTH_CONCEPTS.length; i++) {
      const base = lexeme(lang, MONTH_CONCEPTS[i]);
      let name = useMoon
        ? capitalize(cleanup(smoothJoin(rng.fork("join", i), phon, clipMorph(base, 6), moon), phon))
        : capitalize(base);
      let salt = 0;
      while ((names.includes(name) || name.length < 3 || name.length > 12) && salt < 6) {
        const r = stableRng(lang, "monthfix", i, salt);
        const fresh = makeWord(r, phon, { syllables: [2, 3], maxLen: 10 });
        name = useMoon && salt < 3
          ? capitalize(cleanup(smoothJoin(r.fork("j"), phon, clipMorph(fresh.toLowerCase(), 6), moon), phon))
          : fresh;
        salt++;
      }
      names.push(name);
    }
    return names;
  }

  function stem(rng: Rng, phon: Phonology): string {
    return assembleRaw(rng, phon, {
      syllables: [1, 2],
      sylWeights: [1.5, 1],
      endOpen: true,
      maxLen: 6,
    });
  }

  function attachEnding(stemRaw: string, ending: string): string {
    let stemPart = stemRaw;
    if (/^[aeiou]/.test(ending)) {
      const toks = soundTokens(stemPart);
      const last = toks[toks.length - 1];
      if (last !== undefined && /^[aeiou]/.test(last)) {
        stemPart = stemPart.slice(0, stemPart.length - last.length);
      }
      // Avoid dull doubled vowels at the seam ("brekno"+"ok" -> "breknok").
      while (stemPart.length > 1 && stemPart[stemPart.length - 1] === ending[0]) {
        stemPart = stemPart.slice(0, -1);
      }
    }
    return stemPart + ending;
  }

  const svc: LanguageService = {
    generate(rng: Rng, hints?: { family?: string }): Language {
      const aRng = rng.fork("aesthetic");
      let aes = aRng.pick(AESTHETICS);
      if (aRng.chance(0.25)) {
        const other = aRng.pick(AESTHETICS.filter((a) => a.key !== aes.key));
        aes = blendAesthetics(aes, other);
      }
      const phon = buildPhonology(rng.fork("phonology"), aes);
      return generateFrom(rng, phon, hints?.family);
    },

    derive(rng: Rng, parent: Language): Language {
      const pp = parent.phonology;
      const shift = buildShiftMap(rng.fork("shift"), pp);
      const sw = (w: string) => applyShift(w, shift);

      // Consonants: systematic shift, dedupe, occasional gain.
      let consonants = [...new Set(pp.consonants.map((c) => shift.get(c) ?? c))];
      const gainRng = rng.fork("gain");
      if (gainRng.chance(0.3)) {
        const pool = ["th", "sh", "v", "z", "m", "w", "kh", "l", "f", "d"].filter(
          (c) => !consonants.includes(c),
        );
        if (pool.length > 0) consonants.push(gainRng.pick(pool));
      }
      if (!consonants.includes("n") && !consonants.includes("m")) consonants.push("n");
      if (!consonants.includes("l") && !consonants.includes("r")) consonants.push("l");

      // Vowels: shifted, with drift in the diphthong stock.
      let vowels = [...new Set(pp.vowels.map(sw))].filter((v) => v.length > 0);
      const vRng = rng.fork("vdrift");
      const diphs = vowels.filter((v) => v.length > 1);
      if (vRng.chance(0.2) && diphs.length > 0 && vowels.length > 4) {
        const drop = vRng.pick(diphs);
        vowels = vowels.filter((v) => v !== drop);
      }
      if (vRng.chance(0.25)) {
        const pool = ["ai", "ei", "ea", "ia", "au", "ou", "io"].filter((d) => !vowels.includes(d));
        if (pool.length > 0) vowels.push(vRng.pick(pool));
      }
      if (vowels.filter((v) => v.length === 1).length === 0) vowels.push("a");

      // Patterns: inherited with weight drift, occasional structural change.
      const patterns = [...pp.patterns];
      const patternWeights = pp.patterns.map((p, i) => {
        const w = pp.patternWeights[i] * rng.fork("pw", p).range(0.72, 1.38);
        return Math.round(w * 100) / 100;
      });
      const structRng = rng.fork("struct");
      if (structRng.chance(0.18) && !patterns.includes("CVC")) {
        patterns.push("CVC");
        patternWeights.push(3);
      } else if (structRng.chance(0.15) && !patterns.includes("CCV")) {
        patterns.push("CCV");
        patternWeights.push(1.4);
      }

      let finals = [...new Set(pp.finals.map((c) => shift.get(c) ?? c))].filter((c) =>
        consonants.includes(c),
      );
      if (finals.length === 0) finals = consonants.filter((c) => SOFT_ENDING_CONS.includes(c)).slice(0, 3);
      if (finals.length === 0) finals = [consonants[0]];

      // Orthography: mostly inherited; sometimes a rule is lost.
      let orthography: [string, string][] = pp.orthography.map((p) => [p[0], p[1]]);
      const oRng = rng.fork("odrift");
      if (oRng.chance(0.3) && orthography.length > 0) {
        const dropIdx = oRng.int(orthography.length);
        orthography = orthography.filter((_, i) => i !== dropIdx);
      }

      const phon: Phonology = {
        consonants,
        vowels,
        patterns,
        patternWeights,
        finals,
        orthography,
        forbidden: [...pp.forbidden],
      };

      const child = generateFrom(rng.fork("child"), phon, parent.family);
      child.parent = parent.id;

      // Endonym must differ from the parent's.
      for (let salt = 0; child.name === parent.name && salt < 4; salt++) {
        child.name = makeWord(rng.fork("rename", salt), phon, { syllables: [2, 3], maxLen: 9 });
      }

      // Inherit the parent's word-stock through the sound shifts, so sibling
      // cultures share recognizably related words for old concepts.
      const inheritedLexicon: Record<string, string> = {};
      for (const key of Object.keys(parent.lexicon).sort()) {
        inheritedLexicon[key] = cleanup(sw(parent.lexicon[key]), phon);
      }
      child.lexicon = inheritedLexicon;

      // Month names descend by shift too (recognizable cousins).
      const seen = new Set<string>();
      child.monthNames = parent.monthNames.map((m, i) => {
        let shifted = capitalize(cleanup(sw(m), phon));
        let salt = 0;
        while ((seen.has(shifted) || shifted.length < 3) && salt < 5) {
          shifted = makeWord(stableRng(child, "monthfix", i, salt), phon, { syllables: [2, 3], maxLen: 10 });
          salt++;
        }
        seen.add(shifted);
        return shifted;
      });

      // Endings and patronymic affixes descend by shift, with light mutation.
      const dedupeKeep = (xs: string[]) => [...new Set(xs.filter((x) => x.length > 0))];
      child.femaleEndings = dedupeKeep(parent.femaleEndings.map(sw));
      child.maleEndings = dedupeKeep(parent.maleEndings.map(sw)).filter(
        (e) => !child.femaleEndings.includes(e),
      );
      if (child.femaleEndings.length === 0) child.femaleEndings = ["a"];
      if (child.maleEndings.length === 0) child.maleEndings = ["an"];
      const mutRng = rng.fork("endmut");
      if (mutRng.chance(0.35)) {
        const fresh = genEndings(mutRng.fork("gen"), phon);
        if (fresh.female.length > 0 && !child.femaleEndings.includes(fresh.female[0])) {
          child.femaleEndings.push(fresh.female[0]);
        }
        if (fresh.male.length > 0 && !child.maleEndings.includes(fresh.male[0])) {
          child.maleEndings.push(fresh.male[0]);
        }
      }
      child.patronymicF = [sw(parent.patronymicF[0]), sw(parent.patronymicF[1])];
      child.patronymicM = [sw(parent.patronymicM[0]), sw(parent.patronymicM[1])];

      return child;
    },

    givenName(rng: Rng, lang: Language, sex: Sex): string {
      const phon = lang.phonology;
      for (let attempt = 0; attempt < 5; attempt++) {
        let raw: string;
        if (rng.chance(0.15)) {
          // Bare-stem names: shaped by sex without a formal ending.
          raw = assembleRaw(rng, phon, {
            syllables: [2, 3],
            sylWeights: [2, 1],
            endOpen: sex === "f" || phon.finals.length === 0,
            endClosed: sex === "m" && phon.finals.length > 0,
            maxLen: 9,
          });
        } else {
          const endings = sex === "f" ? lang.femaleEndings : lang.maleEndings;
          const ending = rng.pick(endings.length > 0 ? endings : ["a"]);
          raw = attachEnding(stem(rng, phon), ending);
        }
        const done = finishWord(raw, phon);
        if (done.length >= 3 && done.length <= 10) return done;
      }
      return capitalize(clipMorph(finishWord(stem(rng, phon) + "n", phon).toLowerCase(), 8));
    },

    familyName(rng: Rng, lang: Language): string {
      const phon = lang.phonology;
      // Each language leans toward certain surname morphologies.
      const rot = fnv1a(langKey(lang)) % 4;
      const baseWeights = [3, 3, 2.5, 2];
      const styles = ["occupational", "toponymic", "totemic", "patro"] as const;
      const weights = styles.map((_, i) => baseWeights[(i + rot) % 4]);
      let style = rng.weighted([...styles], weights);
      if (style === "patro" && lang.patronymicM[1] === "") style = "totemic";

      for (let attempt = 0; attempt < 4; attempt++) {
        let name = "";
        if (style === "occupational") {
          const base = clipMorph(lexeme(lang, rng.pick(CRAFT_CONCEPTS)), 6);
          if (rng.chance(0.65)) {
            const agentR = stableRng(lang, "agent");
            const simpleV = phon.vowels.filter((v) => v.length === 1);
            const agent =
              agentR.pick(simpleV.length > 0 ? simpleV : ["a"]) +
              agentR.pick(phon.consonants.filter((c) => SOFT_ENDING_CONS.includes(c)).concat("n"));
            name = capitalize(cleanup(smoothJoin(rng, phon, base, agent), phon));
          } else {
            name = capitalize(base);
          }
        } else if (style === "toponymic") {
          const stemWord = rng.chance(0.55)
            ? clipMorph(lexeme(lang, rng.pick(STEM_FLAVOR)), 6)
            : makeWord(rng, phon, { syllables: [1, 2], endOpen: true, maxLen: 6 }).toLowerCase();
          const morph = clipMorph(lexeme(lang, rng.pick(SETTLEMENT_MORPHS)), 5);
          name = capitalize(cleanup(smoothJoin(rng, phon, stemWord, morph), phon));
        } else if (style === "totemic") {
          const totem = lexeme(lang, rng.pick(TOTEM_CONCEPTS));
          if (rng.chance(0.45)) {
            const kin = clipMorph(tameAffix(lexeme(lang, "kin")), 4);
            name = capitalize(cleanup(smoothJoin(rng, phon, totem, kin), phon));
          } else {
            name = capitalize(totem);
          }
        } else {
          const father = svc.givenName(rng, lang, "m");
          name = svc.patronymic(lang, father, "m");
        }
        if (name.length >= 4 && name.length <= 12) return name;
      }
      return capitalize(lexeme(lang, rng.pick(TOTEM_CONCEPTS)));
    },

    patronymic(lang: Language, fatherGiven: string, childSex: Sex): string {
      const [pre, suf] = childSex === "f" ? lang.patronymicF : lang.patronymicM;
      if (suf !== "") {
        const joined = dJoin(lang.phonology, fatherGiven.toLowerCase(), suf);
        return capitalize(cleanup(joined, lang.phonology));
      }
      if (pre !== "") return pre + capitalize(fatherGiven);
      return capitalize(fatherGiven);
    },

    placeName(rng: Rng, lang: Language, kind: "settlement" | "region" | "polity"): string {
      const phon = lang.phonology;
      const compound = (morphPool: string[], stemMax: number, cap: number): string => {
        for (let attempt = 0; attempt < 4; attempt++) {
          const stemWord = rng.chance(0.55)
            ? clipMorph(lexeme(lang, rng.pick(STEM_FLAVOR)), stemMax)
            : makeWord(rng, phon, { syllables: [1, 2], endOpen: true, maxLen: stemMax }).toLowerCase();
          const morph = clipMorph(lexeme(lang, rng.pick(morphPool)), 5);
          const name = capitalize(cleanup(smoothJoin(rng, phon, stemWord, morph), phon));
          if (name.length >= 4 && name.length <= cap) return name;
        }
        return makeWord(rng, phon, { syllables: [2, 3], maxLen: cap });
      };

      if (kind === "settlement") return compound(SETTLEMENT_MORPHS, 5, 12);
      if (kind === "region") {
        if (rng.chance(0.3)) return makeWord(rng, phon, { syllables: [2, 3], maxLen: 11 });
        return compound(REGION_MORPHS, 6, 12);
      }
      // Polities carry themselves grandly.
      const roll = rng.next();
      if (roll < 0.4) {
        const stemWord = makeWord(rng, phon, { syllables: [2, 2], endOpen: true, maxLen: 6 }).toLowerCase();
        const realm = clipMorph(lexeme(lang, rng.pick(REALM_CONCEPTS)), 6);
        const name = capitalize(cleanup(smoothJoin(rng, phon, stemWord, realm), phon));
        if (name.length >= 5 && name.length <= 14) return name;
        return makeWord(rng, phon, { syllables: [3, 4], sonorous: true, maxLen: 12 });
      }
      if (roll < 0.75) {
        return makeWord(rng, phon, { syllables: [3, 4], sylWeights: [2, 1], sonorous: true, maxLen: 12 });
      }
      return compound(REGION_MORPHS, 7, 14);
    },

    deityName(rng: Rng, lang: Language): string {
      const phon = lang.phonology;
      let name = makeWord(rng, phon, {
        syllables: [2, 4],
        sylWeights: [1.6, 2.4, 1.1],
        sonorous: true,
        maxLen: 11,
      });
      if (rng.chance(0.35)) {
        const gRng = stableRng(lang, "grand", rng.int(3));
        const grandVowels = phon.vowels.filter((v) => v.length === 1 && v !== "u");
        const grandCodas = phon.consonants.filter((c) =>
          ["th", "l", "r", "n", "s", "m", "dh"].includes(c),
        );
        const suffix =
          gRng.pick(grandVowels.length > 0 ? grandVowels : ["o"]) +
          gRng.pick(grandCodas.length > 0 ? grandCodas : ["n"]);
        const joined = capitalize(cleanup(smoothJoin(rng, phon, name.toLowerCase(), suffix), phon));
        if (joined.length <= 12) name = joined;
      }
      return name;
    },

    epithet(rng: Rng, lang: Language, theme: string): string {
      return pickEpithet(rng, lang, theme);
    },

    word(rng: Rng, lang: Language, concept: string): string {
      return lexeme(lang, concept);
    },
  };

  return svc;
}
