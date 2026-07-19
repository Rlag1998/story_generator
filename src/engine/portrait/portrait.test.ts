import { describe, expect, it } from "vitest";
import { Rng } from "../core/rng";
import type { Phenotype } from "../core/types";
import { createPortraitService } from "./index";
import { portraitSVG } from "./portrait";
import { childPhenotype, randomPhenotype } from "./sample";
import { MOON_PALE_EYE, MOON_PALE_HAIR } from "./color";
import { attrNear, headPathOf, svgProblem } from "./testutil";

const svc = createPortraitService();

function ph(seed: string, rare: string[] = []): Phenotype {
  return randomPhenotype(new Rng(seed, "test:" + seed), { rare });
}

describe("portraitSVG basics", () => {
  it("produces well-formed standalone SVG across many phenotypes and ages", () => {
    const rng = new Rng("fuzz", "fuzz");
    for (let i = 0; i < 30; i++) {
      const p = randomPhenotype(rng.fork("p", i));
      for (const age of [0, 5, 13, 24, 47, 68, 91]) {
        const svg = svc.portraitSVG(p, i % 2 === 0 ? "m" : "f", age);
        const problem = svgProblem(svg);
        expect(problem, `phenotype ${i} age ${age}: ${problem}`).toBeNull();
        expect(svg).toContain('viewBox="0 0 100 100"');
      }
    }
  });

  it("honors the size parameter and defaults to 160", () => {
    const p = ph("size");
    expect(svc.portraitSVG(p, "f", 30)).toContain('width="160" height="160"');
    expect(svc.portraitSVG(p, "f", 30, 48)).toContain('width="48" height="48"');
  });

  it("is deterministic: identical inputs, identical markup", () => {
    const a = ph("det");
    const b = ph("det"); // separately constructed, equal values
    expect(svc.portraitSVG(a, "m", 41)).toEqual(svc.portraitSVG(a, "m", 41));
    expect(svc.portraitSVG(a, "m", 41)).toEqual(svc.portraitSVG(b, "m", 41));
    expect(svc.portraitSVG(a, "f", 8, 64)).toEqual(svc.portraitSVG(b, "f", 8, 64));
  });

  it("distinct phenotypes render distinct portraits", () => {
    const rng = new Rng("distinct", "distinct");
    const seen = new Set<string>();
    for (let i = 0; i < 24; i++) {
      seen.add(svc.portraitSVG(randomPhenotype(rng.fork(i)), "f", 30));
    }
    expect(seen.size).toBe(24);
  });

  it("sex changes styling for the same genome-level phenotype", () => {
    const p = ph("sexes");
    expect(svc.portraitSVG(p, "m", 30)).not.toEqual(svc.portraitSVG(p, "f", 30));
  });
});

describe("family resemblance", () => {
  it("temperament-only differences keep the same head outline (bone structure)", () => {
    const a = ph("kin");
    const b: Phenotype = { ...a, tempOpenness: -a.tempOpenness || 0.5, tempVolatility: 0.9 };
    const svgA = portraitSVG(a, "m", 30);
    const svgB = portraitSVG(b, "m", 30);
    expect(svgA).not.toEqual(svgB); // hashes differ (styling may change)
    expect(headPathOf(svgA)).toEqual(headPathOf(svgB)); // but the face is the face
  });

  it("children inherit visible structure from parents", () => {
    const rng = new Rng("fam", "fam");
    const mother = randomPhenotype(rng.fork("m"));
    const father = randomPhenotype(rng.fork("f"));
    const kid = childPhenotype(rng.fork("k"), mother, father);
    // Each discrete face gene lands on or between the parents' values.
    for (const key of ["faceShape", "jawShape", "noseShape", "browShape", "mouthShape", "earShape"] as const) {
      const lo = Math.min(mother[key], father[key]);
      const hi = Math.max(mother[key], father[key]);
      expect(kid[key]).toBeGreaterThanOrEqual(lo);
      expect(kid[key]).toBeLessThanOrEqual(hi);
    }
  });
});

describe("age morphing", () => {
  it("children are smaller in frame; adults are not scaled", () => {
    const p = ph("ages");
    const young = portraitSVG(p, "f", 5);
    const grown = portraitSVG(p, "f", 30);
    expect(young).toContain("translate(50 97) scale(0.8");
    expect(grown).not.toContain("translate(50 97) scale(");
  });

  it("elders gain wrinkles and grey hair; the unaging keep an adult face", () => {
    const p = ph("elder");
    const at30 = portraitSVG(p, "m", 30);
    const at82 = portraitSVG(p, "m", 82);
    expect(at30).not.toContain('data-l="wrinkles"');
    expect(at82).toContain('data-l="wrinkles"');
    expect(at82).not.toEqual(at30);

    const un: Phenotype = { ...p, rareTraits: ["unaging"] };
    const un82 = portraitSVG(un, "m", 82);
    expect(un82).not.toContain('data-l="wrinkles"');
  });

  it("infants get fuzz instead of a full hairstyle", () => {
    const p = ph("babe");
    const infant = portraitSVG(p, "f", 0);
    const adult = portraitSVG(p, "f", 25);
    expect(infant).toContain('data-l="hair"');
    expect(infant).not.toEqual(adult);
  });
});

describe("rare trait overrides", () => {
  it("moon-pale forces white hair, pale skin, rose-pale eyes", () => {
    const p = ph("moon", ["moon-pale"]);
    const svg = portraitSVG(p, "f", 25);
    expect(svg).toContain(MOON_PALE_HAIR);
    expect(svg).toContain(MOON_PALE_EYE);
  });

  it("mismatched eyes render two different iris colors", () => {
    const p = ph("mis", ["mismatched-eyes"]);
    const svg = portraitSVG(p, "m", 25);
    const left = attrNear(svg, 'data-iris="l"', "fill");
    const right = attrNear(svg, 'data-iris="r"', "fill");
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(left).not.toEqual(right);

    const plain = portraitSVG({ ...p, rareTraits: [] }, "m", 25);
    expect(attrNear(plain, 'data-iris="l"', "fill")).toEqual(
      attrNear(plain, 'data-iris="r"', "fill"),
    );
  });

  it("night-eyed pupils are far larger than normal", () => {
    const base = ph("night");
    const norm = portraitSVG(base, "f", 25);
    const night = portraitSVG({ ...base, rareTraits: ["night-eyed"] }, "f", 25);
    const rNorm = parseFloat(attrNear(norm, 'data-pupil="l"', "r")!);
    const rNight = parseFloat(attrNear(night, 'data-pupil="l"', "r")!);
    expect(rNight).toBeGreaterThan(rNorm * 1.5);
  });

  it("silver-streak paints a streak into the hair", () => {
    const p = ph("streak", ["silver-streak"]);
    const svg = portraitSVG(p, "f", 25);
    expect(svg).toContain('data-l="streak"');
    expect(portraitSVG({ ...p, rareTraits: [] }, "f", 25)).not.toContain('data-l="streak"');
  });
});

describe("sex and facial hair", () => {
  it("women and children never grow beards", () => {
    const rng = new Rng("beardless", "beardless");
    for (let i = 0; i < 20; i++) {
      const p = randomPhenotype(rng.fork(i));
      expect(portraitSVG(p, "f", 40)).not.toContain('data-l="beard"');
      expect(portraitSVG(p, "f", 40)).not.toContain('data-l="mustache"');
      expect(portraitSVG(p, "m", 10)).not.toContain('data-l="beard"');
    }
  });

  it("a good share of adult men carry facial hair, deterministically", () => {
    const rng = new Rng("bearded", "bearded");
    let bearded = 0;
    for (let i = 0; i < 30; i++) {
      const p = randomPhenotype(rng.fork(i));
      const svg = portraitSVG(p, "m", 38);
      if (svg.includes('data-l="beard"') || svg.includes('data-l="mustache"')) bearded++;
    }
    expect(bearded).toBeGreaterThan(8);
    expect(bearded).toBeLessThan(30);
  });
});
