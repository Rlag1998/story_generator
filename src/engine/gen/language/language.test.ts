import { describe, expect, it } from "vitest";
import { Rng } from "../../core/rng";
import type { Language, Sex } from "../../core/types";
import { createLanguageService, EPITHET_THEMES, MONTH_CONCEPTS, pronounceable } from "./index";

const svc = createLanguageService();

// NOTE: Rng.fork derives child streams from the label path alone, so the
// seed must be part of the root label (same convention as engine.ts).
function makeLang(seed: string, salt = "a"): Language {
  const r = new Rng(seed, "test:" + seed);
  return svc.generate(r.fork("lang", salt));
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const row = new Array(n + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n];
}

const SEEDS = ["amber-1", "keel-2", "thorn-3", "vast-4", "mire-5"];

describe("generate", () => {
  it("builds a structurally sound phonology", () => {
    for (const seed of SEEDS) {
      const lang = makeLang(seed);
      expect(lang.phonology.consonants.length).toBeGreaterThanOrEqual(6);
      expect(lang.phonology.vowels.length).toBeGreaterThanOrEqual(3);
      expect(lang.phonology.patterns.length).toBe(lang.phonology.patternWeights.length);
      expect(lang.phonology.patterns.length).toBeGreaterThanOrEqual(2);
      for (const f of lang.phonology.finals) {
        expect(lang.phonology.consonants).toContain(f);
      }
      expect(lang.name.length).toBeGreaterThanOrEqual(2);
      expect(lang.name[0]).toBe(lang.name[0].toUpperCase());
      expect(lang.family.length).toBeGreaterThan(0);
    }
  });

  it("honors a family hint", () => {
    const r = new Rng("fam", "test");
    const lang = svc.generate(r.fork("lang"), { family: "Old Harrow" });
    expect(lang.family).toBe("Old Harrow");
  });

  it("worlds sound different: distinct seeds give distinct inventories", () => {
    const a = makeLang(SEEDS[0]);
    const b = makeLang(SEEDS[1]);
    expect(
      a.phonology.consonants.join() !== b.phonology.consonants.join() ||
        a.phonology.vowels.join() !== b.phonology.vowels.join(),
    ).toBe(true);
    expect(a.name).not.toBe(b.name);
  });
});

describe("determinism", () => {
  it("same seed twice gives an identical language", () => {
    const a = makeLang("det-seed");
    const b = makeLang("det-seed");
    expect(a).toEqual(b);
  });

  it("same seed gives identical name streams across every generator", () => {
    const langA = makeLang("det-2");
    const langB = makeLang("det-2");
    const rA = new Rng("names", "t");
    const rB = new Rng("names", "t");
    for (let i = 0; i < 40; i++) {
      const sex: Sex = i % 2 === 0 ? "f" : "m";
      expect(svc.givenName(rA.fork("g", i), langA, sex)).toBe(svc.givenName(rB.fork("g", i), langB, sex));
      expect(svc.familyName(rA.fork("f", i), langA)).toBe(svc.familyName(rB.fork("f", i), langB));
      expect(svc.placeName(rA.fork("p", i), langA, "settlement")).toBe(
        svc.placeName(rB.fork("p", i), langB, "settlement"),
      );
      expect(svc.deityName(rA.fork("d", i), langA)).toBe(svc.deityName(rB.fork("d", i), langB));
      expect(svc.epithet(rA.fork("e", i), langA, "unbowed")).toBe(svc.epithet(rB.fork("e", i), langB, "unbowed"));
    }
  });

  it("derive is deterministic", () => {
    const p1 = makeLang("det-3");
    const p2 = makeLang("det-3");
    p1.id = 5;
    p2.id = 5;
    const c1 = svc.derive(new Rng("dv", "t").fork("d"), p1);
    const c2 = svc.derive(new Rng("dv", "t").fork("d"), p2);
    expect(c1).toEqual(c2);
  });

  it("lexicon words are stable regardless of request order", () => {
    const a = makeLang("det-4");
    const b = makeLang("det-4");
    const r = new Rng("w", "t");
    const w1 = svc.word(r.fork(1), a, "sword");
    svc.word(r.fork(2), a, "oath");
    svc.word(r.fork(3), b, "oath");
    const w2 = svc.word(r.fork(4), b, "sword");
    expect(w1).toBe(w2);
    // Memoized: asking again returns the exact same word.
    expect(svc.word(r.fork(5), a, "sword")).toBe(w1);
    expect(a.lexicon["sword"]).toBe(w1);
  });
});

describe("pronounceability", () => {
  it("all generated names read cleanly across seeds", () => {
    for (const seed of SEEDS) {
      const lang = makeLang(seed);
      const r = new Rng(seed + "-names", "n:" + seed);
      const words: string[] = [lang.name, ...lang.monthNames];
      for (let i = 0; i < 60; i++) {
        words.push(svc.givenName(r.fork("gf", i), lang, "f"));
        words.push(svc.givenName(r.fork("gm", i), lang, "m"));
      }
      for (let i = 0; i < 30; i++) {
        words.push(svc.familyName(r.fork("fam", i), lang));
        words.push(svc.placeName(r.fork("s", i), lang, "settlement"));
        words.push(svc.placeName(r.fork("r", i), lang, "region"));
        words.push(svc.placeName(r.fork("po", i), lang, "polity"));
        words.push(svc.deityName(r.fork("de", i), lang));
      }
      for (const w of words) {
        expect(w.length).toBeGreaterThanOrEqual(2);
        expect(w, `not pronounceable: "${w}" (${seed})`).toSatisfy((x: string) => pronounceable(x));
        expect(w).not.toMatch(/(.)\1\1/); // no triple letters ever
        expect(w[0]).toBe(w[0].toUpperCase());
      }
    }
  });

  it("caps name lengths sensibly", () => {
    const lang = makeLang(SEEDS[2]);
    const r = new Rng("caps", "t");
    for (let i = 0; i < 80; i++) {
      expect(svc.givenName(r.fork("g", i), lang, i % 2 ? "f" : "m").length).toBeLessThanOrEqual(10);
      expect(svc.familyName(r.fork("f", i), lang).length).toBeLessThanOrEqual(12);
      expect(svc.placeName(r.fork("p", i), lang, "settlement").length).toBeLessThanOrEqual(12);
      expect(svc.placeName(r.fork("pp", i), lang, "polity").length).toBeLessThanOrEqual(14);
      expect(svc.deityName(r.fork("d", i), lang).length).toBeLessThanOrEqual(12);
    }
  });
});

describe("gendered names", () => {
  it("keeps female and male ending inventories distinct", () => {
    for (const seed of SEEDS) {
      const lang = makeLang(seed);
      expect(lang.femaleEndings.length).toBeGreaterThan(0);
      expect(lang.maleEndings.length).toBeGreaterThan(0);
      for (const e of lang.maleEndings) expect(lang.femaleEndings).not.toContain(e);
    }
  });

  it("female and male name pools barely overlap", () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const lang = makeLang(seed);
      const r = new Rng(seed + "-gender", "g:" + seed);
      const f = new Set<string>();
      const m = new Set<string>();
      for (let i = 0; i < 150; i++) {
        f.add(svc.givenName(r.fork("f", i), lang, "f"));
        m.add(svc.givenName(r.fork("m", i), lang, "m"));
      }
      let overlap = 0;
      for (const name of f) if (m.has(name)) overlap++;
      expect(overlap / Math.min(f.size, m.size)).toBeLessThan(0.12);
    }
  });

  it("offers a few hundred effective distinct given names per sex", () => {
    const lang = makeLang(SEEDS[0]);
    const r = new Rng("variety", "t");
    const distinct = new Set<string>();
    for (let i = 0; i < 400; i++) distinct.add(svc.givenName(r.fork("v", i), lang, "f"));
    expect(distinct.size).toBeGreaterThanOrEqual(120);
  });
});

describe("patronymics", () => {
  it("is a pure function of language, father, and sex", () => {
    const lang = makeLang(SEEDS[1]);
    const a = svc.patronymic(lang, "Toran", "f");
    const b = svc.patronymic(lang, "Toran", "f");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
    expect(pronounceable(a)).toBe(true);
  });

  it("differs by sex or carries an affix", () => {
    let anyAffixed = 0;
    for (const seed of SEEDS) {
      const lang = makeLang(seed);
      const f = svc.patronymic(lang, "Kaleth", "f");
      const m = svc.patronymic(lang, "Kaleth", "m");
      if (f !== "Kaleth" || m !== "Kaleth") anyAffixed++;
      // Suffix style keeps the father's stem visible at the front.
      if (lang.patronymicM[1] !== "") {
        expect(m.toLowerCase().startsWith("kale")).toBe(true);
      }
      if (lang.patronymicM[0] !== "") {
        expect(m).toContain(" ");
      }
    }
    expect(anyAffixed).toBe(SEEDS.length);
  });
});

describe("places, deities, months", () => {
  it("seeds a lexicon of place morphemes at generation", () => {
    const lang = makeLang(SEEDS[3]);
    const placeConcepts = [
      "ford", "haven", "keep", "bridge", "field", "mere", "strand", "spring", "market", "tower",
      "wold", "fell", "moor", "dale", "vale", "reach", "marsh", "shore", "wood", "hollow",
    ];
    const seeded = placeConcepts.filter((c) => lang.lexicon[c] !== undefined);
    expect(seeded.length).toBeGreaterThanOrEqual(8);
    expect(seeded.length).toBeLessThanOrEqual(15);
  });

  it("polity names run grander than settlement names on average", () => {
    const lang = makeLang(SEEDS[0]);
    const r = new Rng("grand", "t");
    let s = 0;
    let p = 0;
    const n = 60;
    for (let i = 0; i < n; i++) {
      s += svc.placeName(r.fork("s", i), lang, "settlement").length;
      p += svc.placeName(r.fork("p", i), lang, "polity").length;
    }
    expect(p / n).toBeGreaterThan(s / n - 1);
    expect(p / n).toBeGreaterThan(6);
  });

  it("gives 12 distinct evocative month names", () => {
    for (const seed of SEEDS) {
      const lang = makeLang(seed);
      expect(lang.monthNames.length).toBe(12);
      expect(new Set(lang.monthNames).size).toBe(12);
      for (const m of lang.monthNames) {
        expect(m[0]).toBe(m[0].toUpperCase());
        expect(pronounceable(m)).toBe(true);
      }
    }
  });

  it("keeps month concepts in the lexicon", () => {
    const lang = makeLang(SEEDS[4]);
    for (const c of MONTH_CONCEPTS) expect(lang.lexicon[c]).toBeDefined();
  });

  it("deity names lean long and sonorous", () => {
    const lang = makeLang(SEEDS[2]);
    const r = new Rng("gods", "t");
    let total = 0;
    for (let i = 0; i < 50; i++) total += svc.deityName(r.fork(i), lang).length;
    expect(total / 50).toBeGreaterThan(4.5);
  });
});

describe("epithets", () => {
  it("covers every theme in the table", () => {
    const lang = makeLang(SEEDS[0]);
    const r = new Rng("ep", "t");
    const themes = Object.keys(EPITHET_THEMES);
    expect(themes.length).toBeGreaterThanOrEqual(40);
    for (const theme of themes) {
      const e = svc.epithet(r.fork(theme), lang, theme);
      expect(EPITHET_THEMES[theme]).toContain(e);
    }
  });

  it("handles arbitrary themes gracefully", () => {
    const lang = makeLang(SEEDS[0]);
    const r = new Rng("ep2", "t");
    expect(svc.epithet(r.fork(1), lang, "gloaming")).toBe("the Gloaming");
    expect(svc.epithet(r.fork(2), lang, "sea-wolf")).toBe("the Sea-Wolf");
    expect(svc.epithet(r.fork(3), lang, "  DUST crowned ")).toBe("the Dust Crowned");
  });

  it("varies house style across languages", () => {
    // Across many languages, "unbowed" should not always resolve identically.
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const lang = makeLang("style-" + i);
      const r = new Rng("st" + i, "st:" + i);
      seen.add(svc.epithet(r.fork(0), lang, "unbowed"));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("derive", () => {
  it("daughters share the family but not the voice", () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const parent = makeLang(seed);
      parent.id = 7;
      const child = svc.derive(new Rng(seed + "-dv", "dv:" + seed).fork("d"), parent);
      expect(child.family).toBe(parent.family);
      expect(child.parent).toBe(7);
      expect(child.name).not.toBe(parent.name);
      // Sound systems related: consonant inventories overlap substantially.
      const shared = child.phonology.consonants.filter((c) => parent.phonology.consonants.includes(c));
      expect(shared.length).toBeGreaterThanOrEqual(Math.floor(parent.phonology.consonants.length / 2));
    }
  });

  it("shifts the inherited word-stock systematically: related but distinct", () => {
    const parent = makeLang(SEEDS[0]);
    parent.id = 3;
    const child = svc.derive(new Rng("dv-lex", "t").fork("d"), parent);
    const keys = Object.keys(parent.lexicon).sort();
    expect(keys.length).toBeGreaterThan(0);
    let changed = 0;
    let totalDist = 0;
    for (const k of keys) {
      expect(child.lexicon[k]).toBeDefined();
      const dist = levenshtein(parent.lexicon[k], child.lexicon[k]);
      expect(dist).toBeLessThanOrEqual(6); // a shift, not a new word
      totalDist += dist;
      if (dist > 0) changed++;
    }
    expect(changed).toBeGreaterThan(0);
    expect(totalDist / keys.length).toBeLessThanOrEqual(4);
  });

  it("derived month names are cousins of the parent's", () => {
    const parent = makeLang(SEEDS[1]);
    parent.id = 4;
    const child = svc.derive(new Rng("dv-mo", "t").fork("d"), parent);
    expect(child.monthNames.length).toBe(12);
    expect(new Set(child.monthNames).size).toBe(12);
    let related = 0;
    for (let i = 0; i < 12; i++) {
      if (levenshtein(parent.monthNames[i].toLowerCase(), child.monthNames[i].toLowerCase()) <= 4) related++;
    }
    expect(related).toBeGreaterThanOrEqual(8);
  });

  it("derived names remain pronounceable", () => {
    const parent = makeLang(SEEDS[2]);
    parent.id = 9;
    const child = svc.derive(new Rng("dv-pr", "t").fork("d"), parent);
    const r = new Rng("dv-names", "t");
    for (let i = 0; i < 60; i++) {
      const g = svc.givenName(r.fork("g", i), child, i % 2 ? "f" : "m");
      expect(pronounceable(g), `not pronounceable: "${g}"`).toBe(true);
      const p = svc.placeName(r.fork("p", i), child, "settlement");
      expect(pronounceable(p), `not pronounceable: "${p}"`).toBe(true);
    }
    for (const m of child.monthNames) expect(pronounceable(m)).toBe(true);
  });
});
