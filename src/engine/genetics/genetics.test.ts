/**
 * Genetics tests: catalog integrity, Mendelian inheritance, recessive red
 * hair, rare-trait clustering, resemblance, twin heritability, pedigree
 * inbreeding, culture profiles, and determinism.
 */

import { describe, expect, it } from "vitest";
import { Rng } from "../core/rng";
import { RARE_TRAITS } from "../core/appearance";
import type { Genome, Person, PersonId, Phenotype, World } from "../core/types";
import { createEmptyWorld } from "../core/world";
import {
  createGeneticsService,
  LOCI,
  LOCUS_INDEX,
  RARE_KEYS,
  RARE_LOCI_INDICES,
  cultureProfile,
  express,
  founderGenome,
  reproduce,
} from "./index";

const G = createGeneticsService();

function rng(seed: string): Rng {
  return new Rng(seed, `test:${seed}`);
}

function setPair(g: Genome, key: string, a: number, b: number): void {
  const i = LOCUS_INDEX[key];
  g[2 * i] = a;
  g[2 * i + 1] = b;
}

function zeroRare(g: Genome): void {
  for (const idx of RARE_LOCI_INDICES) {
    g[2 * idx] = 0;
    g[2 * idx + 1] = 0;
  }
}

// ---------------------------------------------------------------------------

describe("locus catalog", () => {
  it("has a plausible number of loci with unique keys", () => {
    expect(LOCI.length).toBeGreaterThanOrEqual(60);
    expect(LOCI.length).toBeLessThanOrEqual(72);
    const keys = new Set(LOCI.map((l) => l.key));
    expect(keys.size).toBe(LOCI.length);
  });

  it("genome length is 2 * loci and founder genomes match", () => {
    expect(G.genomeLength()).toBe(LOCI.length);
    const g = founderGenome(rng("g"), 0);
    expect(g.length).toBe(2 * LOCI.length);
  });

  it("has one rare-trait locus per RARE_TRAITS key", () => {
    expect(RARE_KEYS.length).toBe(RARE_TRAITS.length);
    for (const t of RARE_TRAITS) {
      expect(LOCUS_INDEX[`rare_${t.key}`]).toBeGreaterThanOrEqual(0);
    }
    expect(RARE_LOCI_INDICES.length).toBe(RARE_TRAITS.length);
  });

  it("base weights are non-negative and sized to the allele pool", () => {
    for (const l of LOCI) {
      expect(l.base.length).toBe(l.n);
      for (const w of l.base) expect(w).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("expression completeness", () => {
  it("populates every phenotype field for many random genomes", () => {
    for (let i = 0; i < 50; i++) {
      const g = founderGenome(rng(`f${i}`), i % 4);
      const ph = express(g, i % 2 === 0 ? "m" : "f", rng(`e${i}`));
      expect(ph.skinTone).toBeGreaterThanOrEqual(0);
      expect(ph.skinTone).toBeLessThanOrEqual(1);
      expect(ph.hairColor).toBeGreaterThanOrEqual(0);
      expect(ph.hairColor).toBeLessThanOrEqual(9);
      expect(ph.eyeColor).toBeGreaterThanOrEqual(0);
      expect(ph.eyeColor).toBeLessThanOrEqual(8);
      expect(ph.hairTexture).toBeGreaterThanOrEqual(0);
      expect(ph.hairTexture).toBeLessThanOrEqual(3);
      expect(ph.heightScore).toBeGreaterThanOrEqual(-3);
      expect(ph.heightScore).toBeLessThanOrEqual(3);
      expect(Array.isArray(ph.rareTraits)).toBe(true);
      expect(ph.twinningMod).toBeGreaterThanOrEqual(1);
      expect(typeof ph.freckles).toBe("boolean");
    }
  });
});

describe("Mendelian inheritance", () => {
  it("child alleles descend from parents (barring rare mutation)", () => {
    const mother = founderGenome(rng("mom"), 0);
    const father = founderGenome(rng("dad"), 1);
    let totalViolations = 0;
    const trials = 200;
    for (let t = 0; t < trials; t++) {
      const child = reproduce(rng(`c${t}`), mother, father);
      let v = 0;
      for (let i = 0; i < LOCI.length; i++) {
        const mAllele = child[2 * i];
        const pAllele = child[2 * i + 1];
        const fromMother = mAllele === mother[2 * i] || mAllele === mother[2 * i + 1];
        const fromFather = pAllele === father[2 * i] || pAllele === father[2 * i + 1];
        if (!fromMother || !fromFather) v++;
      }
      totalViolations += v;
    }
    // Mutation is ~0.3-0.4 events per genome, most not even visible mismatches.
    expect(totalViolations / trials).toBeLessThan(1.0);
  });

  it("mutation does occur across a population (non-zero de novo)", () => {
    const mother = founderGenome(rng("m2"), 0);
    const father = founderGenome(rng("d2"), 0);
    let anyMismatch = 0;
    for (let t = 0; t < 400; t++) {
      const child = reproduce(rng(`x${t}`), mother, father);
      for (let i = 0; i < LOCI.length; i++) {
        const a = child[2 * i];
        if (a !== mother[2 * i] && a !== mother[2 * i + 1]) {
          anyMismatch++;
          break;
        }
      }
    }
    expect(anyMismatch).toBeGreaterThan(0);
  });
});

describe("recessive red hair", () => {
  it("emerges from carrier x carrier at roughly 25%", () => {
    // Two carriers: heterozygous red, eumelanin fixed at E=4 so homozygotes
    // read flame-red and everything else stays out of the red family.
    const makeCarrier = (seed: string): Genome => {
      const g = founderGenome(rng(seed), 0);
      zeroRare(g);
      setPair(g, "hairEumelanin", 2, 2); // E = 4
      setPair(g, "hairRed", 0, 1); // carrier
      return g;
    };
    const mom = makeCarrier("rm");
    const dad = makeCarrier("rd");
    let redFamily = 0;
    const n = 3000;
    for (let t = 0; t < n; t++) {
      const child = reproduce(rng(`rc${t}`), mom, dad);
      const ph = express(child, "f", rng(`re${t}`));
      if (ph.hairColor === 5) redFamily++; // flame-red index
    }
    const frac = redFamily / n;
    expect(frac).toBeGreaterThan(0.2);
    expect(frac).toBeLessThan(0.3);
  });

  it("does not appear from carrier x non-carrier", () => {
    const carrier = founderGenome(rng("c1"), 0);
    zeroRare(carrier);
    setPair(carrier, "hairEumelanin", 2, 2);
    setPair(carrier, "hairRed", 0, 1);
    const clean = founderGenome(rng("c2"), 0);
    zeroRare(clean);
    setPair(clean, "hairEumelanin", 2, 2);
    setPair(clean, "hairRed", 0, 0);
    let red = 0;
    const n = 2000;
    for (let t = 0; t < n; t++) {
      const child = reproduce(rng(`nc${t}`), carrier, clean);
      const ph = express(child, "f", rng(`ne${t}`));
      if (ph.hairColor === 5 || ph.hairColor === 4) red++;
    }
    expect(red / n).toBeLessThan(0.02); // only rare mutation could produce any
  });
});

describe("rare-trait clustering (homozygosity)", () => {
  it("a recessive rarity surfaces from two carriers but hides with one", () => {
    const key = "giants-blood"; // recessive regime
    const carrierA = founderGenome(rng("ga"), 0);
    zeroRare(carrierA);
    setPair(carrierA, `rare_${key}`, 0, 1);
    const carrierB = founderGenome(rng("gb"), 0);
    zeroRare(carrierB);
    setPair(carrierB, `rare_${key}`, 0, 1);
    const nonCarrier = founderGenome(rng("gn"), 0);
    zeroRare(nonCarrier);

    const rate = (a: Genome, b: Genome, tag: string): number => {
      let hit = 0;
      const n = 2000;
      for (let t = 0; t < n; t++) {
        const child = reproduce(rng(`${tag}${t}`), a, b);
        const ph = express(child, "m", rng(`${tag}e${t}`));
        if (ph.rareTraits.includes(key)) hit++;
      }
      return hit / n;
    };

    const both = rate(carrierA, carrierB, "cc");
    const one = rate(carrierA, nonCarrier, "cn");
    // Carrier x carrier: ~25% homozygous * 0.9 penetrance.
    expect(both).toBeGreaterThan(0.12);
    // Carrier x non-carrier: essentially nothing (only de novo mutation).
    expect(one).toBeLessThan(0.03);
    expect(both).toBeGreaterThan(one * 4);
  });
});

describe("resemblance", () => {
  it("parent-child beats strangers by a wide margin over 200 trials", () => {
    const svc = G;
    let childSum = 0;
    let strangerSum = 0;
    const trials = 200;
    for (let t = 0; t < trials; t++) {
      const mom = founderGenome(rng(`pm${t}`), t % 3);
      const dad = founderGenome(rng(`pd${t}`), t % 3);
      const momPh = express(mom, "f", rng(`pmx${t}`));
      const child = reproduce(rng(`pc${t}`), mom, dad);
      const childPh = express(child, t % 2 ? "m" : "f", rng(`pcx${t}`));
      // A stranger from a similar background (same culture offset).
      const stranger = founderGenome(rng(`ps${t}`), t % 3);
      const strangerPh = express(stranger, t % 2 ? "m" : "f", rng(`psx${t}`));
      childSum += svc.resemblance(momPh, childPh);
      strangerSum += svc.resemblance(momPh, strangerPh);
    }
    const childMean = childSum / trials;
    const strangerMean = strangerSum / trials;
    expect(childMean).toBeGreaterThan(strangerMean + 0.1);
  });
});

describe("twin lineage heritability", () => {
  it("twin-prone mothers pass an elevated twinning modifier", () => {
    const high = founderGenome(rng("th"), 0);
    setPair(high, "twinning", 2, 2);
    const low = founderGenome(rng("tl"), 0);
    setPair(low, "twinning", 0, 0);
    const father = founderGenome(rng("tf"), 0);
    setPair(father, "twinning", 0, 0);

    const childMod = (mother: Genome, tag: string): number => {
      let sum = 0;
      const n = 300;
      for (let t = 0; t < n; t++) {
        const child = reproduce(rng(`${tag}${t}`), mother, father);
        const ph = express(child, "f", rng(`${tag}e${t}`));
        sum += ph.twinningMod;
      }
      return sum / n;
    };
    const highMean = childMod(high, "hm");
    const lowMean = childMod(low, "lm");
    expect(highMean).toBeGreaterThan(2.0);
    expect(highMean).toBeGreaterThan(lowMean + 1.0);
  });

  it("higher twinningMod yields more multiple births", () => {
    const highPh = { twinningMod: 4.4 } as Phenotype;
    const lowPh = { twinningMod: 1.0 } as Phenotype;
    const count = (ph: Phenotype, seed: string): number => {
      const r = rng(seed);
      let multiples = 0;
      for (let t = 0; t < 20000; t++) {
        if (G.litterSize(r, ph) > 1) multiples++;
      }
      return multiples;
    };
    const highMult = count(highPh, "lsh");
    const lowMult = count(lowPh, "lsl");
    expect(highMult).toBeGreaterThan(lowMult * 2.5);
  });
});

describe("pedigree inbreeding", () => {
  function makeWorld(): World {
    return createEmptyWorld({
      seed: "ped",
      startPop: 0,
      popCap: 100,
      regions: 1,
      cultures: 1,
      startYear: 1,
    });
  }
  let idc = 0;
  function addP(world: World, mother: PersonId | null, father: PersonId | null): Person {
    const id = ++idc as PersonId;
    const p = {
      id,
      givenName: "x",
      surname: "",
      epithet: "",
      nickname: "",
      sex: "f",
      culture: 1,
      religion: 1,
      house: null,
      born: 0,
      died: null,
      deathCause: null,
      location: null,
      mother,
      father,
      legalFather: null,
      children: [],
      marriages: [],
      betrothed: null,
      pregnancy: null,
      genome: new Int16Array(0),
      phenotype: {} as Phenotype,
      personality: {} as never,
      status: { profession: "none", wealth: 1, rank: 1, titles: [], literate: false },
      illnesses: [],
      injuries: [],
      storylines: [],
      notability: 0,
      litterMates: [],
      flags: {},
    } as unknown as Person;
    world.people.set(id, p);
    return p;
  }

  it("computes standard coefficients", () => {
    const world = makeWorld();
    idc = 0;
    const g1 = addP(world, null, null);
    const g2 = addP(world, null, null);
    // full siblings
    const p1 = addP(world, g1.id, g2.id);
    const p2 = addP(world, g1.id, g2.id);
    // unrelated spouses
    const x1 = addP(world, null, null);
    const x2 = addP(world, null, null);
    // first cousins
    const c1 = addP(world, p1.id, x1.id);
    const c2 = addP(world, p2.id, x2.id);

    expect(G.inbreeding(world, p1.id, p2.id)).toBeCloseTo(0.25, 5); // sibling union
    expect(G.inbreeding(world, c1.id, c2.id)).toBeCloseTo(0.0625, 5); // first cousins
    expect(G.inbreeding(world, p1.id, c1.id)).toBeCloseTo(0.25, 5); // parent-child
    expect(G.inbreeding(world, g1.id, c1.id)).toBeCloseTo(0.125, 5); // grandparent
    expect(G.inbreeding(world, x1.id, c1.id)).toBeCloseTo(0.25, 5); // x1 is c1's father
    expect(G.inbreeding(world, g1.id, x1.id)).toBe(0); // unrelated founders
    expect(G.inbreeding(world, x1.id, x2.id)).toBe(0); // unrelated founders
  });
});

describe("culture profiles", () => {
  it("are deterministic per offset", () => {
    const a = cultureProfile(3);
    const b = cultureProfile(3);
    expect(a).toEqual(b);
  });

  it("differ across offsets and shift founder appearance", () => {
    // Find the palest- and darkest-skewed profiles among a range.
    let lo = 0;
    let hi = 0;
    for (let o = 0; o < 16; o++) {
      if (cultureProfile(o).index.skin < cultureProfile(lo).index.skin) lo = o;
      if (cultureProfile(o).index.skin > cultureProfile(hi).index.skin) hi = o;
    }
    expect(cultureProfile(lo).index.skin).not.toBeCloseTo(cultureProfile(hi).index.skin, 2);

    const meanSkin = (offset: number, seed: string): number => {
      let s = 0;
      const n = 200;
      for (let i = 0; i < n; i++) {
        const g = founderGenome(rng(`${seed}${i}`), offset);
        s += express(g, "f", rng(`${seed}e${i}`)).skinTone;
      }
      return s / n;
    };
    const darkMean = meanSkin(hi, "dk");
    const paleMean = meanSkin(lo, "pl");
    expect(darkMean).toBeGreaterThan(paleMean + 0.08);
  });
});

describe("determinism", () => {
  it("founderGenome is identical for identical seeds", () => {
    const g1 = founderGenome(rng("same"), 2);
    const g2 = founderGenome(rng("same"), 2);
    expect(Array.from(g1)).toEqual(Array.from(g2));
  });

  it("reproduce is identical for identical seeds", () => {
    const mom = founderGenome(rng("dm"), 0);
    const dad = founderGenome(rng("dd"), 0);
    const c1 = reproduce(rng("dc"), mom, dad);
    const c2 = reproduce(rng("dc"), mom, dad);
    expect(Array.from(c1)).toEqual(Array.from(c2));
  });

  it("express and basePersonality are identical for identical seeds", () => {
    const g = founderGenome(rng("dg"), 1);
    const p1 = express(g, "m", rng("de"));
    const p2 = express(g, "m", rng("de"));
    expect(p1).toEqual(p2);
    const per1 = G.basePersonality(p1, rng("dp"));
    const per2 = G.basePersonality(p2, rng("dp"));
    expect(per1).toEqual(per2);
  });
});

describe("basePersonality", () => {
  it("stays within declared ranges and leaves traits empty", () => {
    for (let i = 0; i < 40; i++) {
      const g = founderGenome(rng(`bp${i}`), i % 3);
      const ph = express(g, i % 2 ? "m" : "f", rng(`bpe${i}`));
      const p = G.basePersonality(ph, rng(`bpp${i}`));
      for (const axis of ["openness", "diligence", "sociability", "agreeableness", "volatility", "courage", "honor"] as const) {
        expect(p[axis]).toBeGreaterThanOrEqual(-1);
        expect(p[axis]).toBeLessThanOrEqual(1);
      }
      for (const drive of ["ambition", "piety", "lust", "greed", "wrath", "compassion"] as const) {
        expect(p[drive]).toBeGreaterThanOrEqual(0);
        expect(p[drive]).toBeLessThanOrEqual(1);
      }
      expect(p.traits).toEqual([]);
    }
  });
});
