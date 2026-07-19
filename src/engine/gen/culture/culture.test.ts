/**
 * Culture generation tests: coherence, tradition library integrity,
 * derivation drift, and determinism.
 *
 * These tests import internal files directly (not index.ts) so they run
 * even while the sibling gen/language module is still being built.
 */

import { describe, expect, it } from "vitest";
import { Rng } from "../../core/rng";
import type { Culture, CultureValue } from "../../core/types";
import { deriveCulture, generateCulture } from "./generate";
import { EXTRA_HOOKS, TRADITION_HOOKS, TRADITION_TEMPLATES } from "./traditions";
import { addCulture, addLanguage, makeTestLanguage, makeTestWorld } from "./testkit";

const ALL_VALUES: CultureValue[] = [
  "honor", "hospitality", "learning", "piety", "craftsmanship", "kinship",
  "conquest", "seafaring", "trade", "austerity", "artistry", "vengeance",
  "stoicism", "revelry",
];

/**
 * NOTE: Rng.fork derives child streams from the label path alone, so test
 * roots must carry the seed in their label (as the engine does with
 * `world:${seed}`) for different seeds to yield different cultures.
 */
function testRng(seed: string): Rng {
  return new Rng(seed, `test:${seed}`);
}

function freshCulture(seed: string): Culture {
  const world = makeTestWorld();
  const lang = addLanguage(world, makeTestLanguage());
  return generateCulture(testRng(seed), world, lang);
}

describe("tradition template library", () => {
  it("has at least 30 templates with unique keys", () => {
    expect(TRADITION_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    const keys = new Set(TRADITION_TEMPLATES.map((t) => t.key));
    expect(keys.size).toBe(TRADITION_TEMPLATES.length);
  });

  it("uses only stable hook tags", () => {
    const allowed = new Set<string>([...TRADITION_HOOKS, ...EXTRA_HOOKS]);
    for (const tpl of TRADITION_TEMPLATES) {
      expect(tpl.hooks.length).toBeGreaterThan(0);
      for (const hook of tpl.hooks) {
        expect(allowed.has(hook), `unknown hook "${hook}" on ${tpl.key}`).toBe(true);
      }
    }
  });

  it("covers every required ritual sphere", () => {
    const categories = new Set(TRADITION_TEMPLATES.map((t) => t.category));
    for (const cat of [
      "funeral", "coming-of-age", "naming", "marriage", "feast", "hospitality",
      "duel", "mourning", "taboo", "oath", "birth", "twins", "the-sight",
    ]) {
      expect(categories.has(cat as never), `no templates for ${cat}`).toBe(true);
    }
  });
});

describe("generateCulture", () => {
  it("produces a coherent culture within all contract bounds", () => {
    for (let s = 0; s < 12; s++) {
      const c = freshCulture(`bounds-${s}`);
      expect(c.values.length).toBeGreaterThanOrEqual(3);
      expect(c.values.length).toBeLessThanOrEqual(4);
      for (const v of c.values) expect(ALL_VALUES).toContain(v);
      expect(new Set(c.values).size).toBe(c.values.length);
      for (const key of ["violence", "mysticism", "patriarchy", "openness"] as const) {
        expect(c.attitudes[key]).toBeGreaterThanOrEqual(0);
        expect(c.attitudes[key]).toBeLessThanOrEqual(1);
      }
      expect(c.adulthoodAge).toBeGreaterThanOrEqual(14);
      expect(c.adulthoodAge).toBeLessThanOrEqual(18);
      expect(c.marriageAgeF).toBeGreaterThanOrEqual(c.adulthoodAge);
      expect(c.marriageAgeM).toBeGreaterThanOrEqual(c.adulthoodAge);
      expect(c.ancestorNaming).toBeGreaterThanOrEqual(0.05);
      expect(c.ancestorNaming).toBeLessThanOrEqual(0.7);
      expect(c.colors[0]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.colors[1]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.colors[0]).not.toBe(c.colors[1]);
      expect(c.parent).toBeNull();
    }
  });

  it("derives name and demonym kin to the language", () => {
    const c = freshCulture("naming-kin");
    // Test language endonym is "Vessari"; the first coining attempt stems it.
    expect(c.name.toLowerCase().startsWith("vess")).toBe(true);
    expect(c.demonym.toLowerCase().startsWith("vess")).toBe(true);
    expect(c.name[0]).toBe(c.name[0].toUpperCase());
    expect(c.demonym[0]).toBe(c.demonym[0].toUpperCase());
  });

  it("selects 4-7 traditions always covering funeral, coming-of-age and wedding", () => {
    for (let s = 0; s < 12; s++) {
      const c = freshCulture(`trads-${s}`);
      expect(c.traditions.length).toBeGreaterThanOrEqual(4);
      expect(c.traditions.length).toBeLessThanOrEqual(7);
      const keys = new Set(c.traditions.map((t) => t.key));
      expect(keys.size).toBe(c.traditions.length);
      const hooks = new Set(c.traditions.flatMap((t) => t.hooks));
      expect(hooks.has("funeral")).toBe(true);
      expect(hooks.has("coming-of-age")).toBe(true);
      expect(hooks.has("wedding")).toBe(true);
    }
  });

  it("writes tradition prose with native flavor and without em-dashes", () => {
    const c = freshCulture("prose");
    for (const t of c.traditions) {
      expect(t.name.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(80);
      expect(t.name).not.toMatch(/[—–]/);
      expect(t.description).not.toMatch(/[—–]/);
      // The name carries at least one capitalized native word beyond position 0.
      expect(t.name.slice(1)).toMatch(/[A-Z]/);
    }
  });

  it("varies meaningfully across seeds", () => {
    const orders = new Set<string>();
    const descents = new Set<string>();
    const keys = new Set<string>();
    const counts = new Set<number>();
    for (let s = 0; s < 24; s++) {
      const c = freshCulture(`vary-${s}`);
      orders.add(c.nameOrder);
      descents.add(c.descent);
      counts.add(c.traditions.length);
      for (const t of c.traditions) keys.add(t.key);
    }
    expect(orders.size).toBeGreaterThanOrEqual(2);
    expect(descents.size).toBeGreaterThanOrEqual(2);
    expect(keys.size).toBeGreaterThanOrEqual(10);
    expect(counts.size).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic: same seed twice yields identical cultures", () => {
    const run = () => {
      const world = makeTestWorld();
      const lang = addLanguage(world, makeTestLanguage());
      return generateCulture(testRng("determinism"), world, lang);
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});

describe("deriveCulture", () => {
  function parentAndChild(seed: string): { parent: Culture; child: Culture } {
    const world = makeTestWorld();
    const lang = addLanguage(world, makeTestLanguage());
    const parent = addCulture(world, generateCulture(testRng(`${seed}-p`), world, lang));
    const lang2 = addLanguage(world, makeTestLanguage({ name: "Vessik" }));
    const child = deriveCulture(testRng(`${seed}-c`), world, parent, lang2);
    return { parent, child };
  }

  it("shares most customs with its parent while drifting some", () => {
    let sharedCustoms = 0;
    let sharedTraditions = 0;
    for (let s = 0; s < 10; s++) {
      const { parent, child } = parentAndChild(`drift-${s}`);
      expect(child.parent).toBe(parent.id);
      expect(child.language).not.toBe(parent.language);
      expect(child.name).not.toBe(parent.name);
      expect(child.colors[0]).toBe(parent.colors[0]);
      expect(child.values.length).toBeGreaterThanOrEqual(3);
      expect(child.values.length).toBeLessThanOrEqual(4);
      expect(child.traditions.length).toBeGreaterThanOrEqual(4);
      expect(child.traditions.length).toBeLessThanOrEqual(7);
      const hooks = new Set(child.traditions.flatMap((t) => t.hooks));
      expect(hooks.has("funeral")).toBe(true);
      expect(hooks.has("coming-of-age")).toBe(true);
      expect(hooks.has("wedding")).toBe(true);
      const customs: Array<[string, string]> = [
        [child.marriage, parent.marriage],
        [child.descent, parent.descent],
        [child.inheritance, parent.inheritance],
        [child.nameOrder, parent.nameOrder],
      ];
      sharedCustoms += customs.filter(([a, b]) => a === b).length;
      const parentKeys = new Set(parent.traditions.map((t) => t.key));
      sharedTraditions += child.traditions.filter((t) => parentKeys.has(t.key)).length;
      expect(Math.abs(child.adulthoodAge - parent.adulthoodAge)).toBeLessThanOrEqual(1);
    }
    // Across ten derivations the family resemblance must dominate.
    expect(sharedCustoms).toBeGreaterThanOrEqual(25); // of 40 customs
    expect(sharedTraditions).toBeGreaterThanOrEqual(15);
  });

  it("is deterministic", () => {
    const run = () => {
      const world = makeTestWorld();
      const lang = addLanguage(world, makeTestLanguage());
      const parent = addCulture(world, generateCulture(testRng("det-p"), world, lang));
      const lang2 = addLanguage(world, makeTestLanguage({ name: "Vessik" }));
      return deriveCulture(testRng("det-c"), world, parent, lang2);
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
