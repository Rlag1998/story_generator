import { describe, expect, it } from "vitest";
import { Rng } from "../../core/rng";
import { monthOf } from "../../core/time";
import { nextId } from "../../core/world";
import type {
  CultureValue,
  EventRecord,
  Language,
  Religion,
  ReligionId,
  ReligionShape,
} from "../../core/types";
import { createReligionService, forgeWord, schismWithReport } from "./index";
import {
  chronicleFingerprint,
  makeCulture,
  makeLanguage,
  makePerson,
  makeRegion,
  makeSettlement,
  makeTickFixture,
  makeWorld,
  runMonths,
  type CultureOpts,
} from "./testkit";

const VALID_TEMPERS = new Set(["kind", "stern", "capricious", "distant", "hungry"]);
const TOKENS = ["{chief}", "{adversary}", "{clergy}", "{holy}", "{d}"];

const VALUE_SETS: CultureValue[][] = [
  ["kinship", "hospitality", "honor"],
  ["piety", "austerity", "learning"],
  ["seafaring", "trade", "revelry"],
  ["conquest", "vengeance", "honor"],
  ["learning", "artistry", "stoicism"],
  ["kinship", "craftsmanship", "piety"],
];

function genFixture(seed: string, opts: CultureOpts = {}) {
  const world = makeWorld(seed);
  const lang = makeLanguage(world);
  const culture = makeCulture(world, lang, opts);
  const rng = new Rng(seed, `gen:${seed}`);
  return { world, lang, culture, rng };
}

function allStrings(r: Religion): string[] {
  return [
    r.name,
    r.adherentName,
    r.clergyTitle,
    r.funeralRite,
    r.afterlife,
    ...r.tenets,
    ...r.virtues,
    ...r.sins,
    ...r.holyDays.flatMap((h) => [h.name, h.theme]),
    ...r.deities.flatMap((d) => [d.name, d.epithet, ...d.domains]),
  ];
}

describe("religion generation", () => {
  it("produces coherent faiths across many seeds and cultures", () => {
    const service = createReligionService();
    const shapesSeen = new Map<ReligionShape, number>();
    const names = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const { world, culture, rng } = genFixture(`gen-${i}`, {
        values: VALUE_SETS[i % VALUE_SETS.length],
        mysticism: 0.15 + (i % 8) * 0.1,
        patriarchy: (i % 10) / 10,
      });
      const r = service.generate(rng, world, culture);
      shapesSeen.set(r.shape, (shapesSeen.get(r.shape) ?? 0) + 1);
      names.add(r.name);

      // Prose hygiene: no em-dashes, no unfilled tokens, nothing empty.
      for (const s of allStrings(r)) {
        expect(s.length).toBeGreaterThan(0);
        expect(s.includes("—")).toBe(false);
        for (const tok of TOKENS) expect(s.includes(tok)).toBe(false);
      }

      expect(r.name.startsWith("The ")).toBe(true);
      expect(r.virtues.length).toBeGreaterThanOrEqual(4);
      expect(r.virtues.length).toBeLessThanOrEqual(7);
      expect(r.sins.length).toBeGreaterThanOrEqual(4);
      expect(r.sins.length).toBeLessThanOrEqual(7);
      expect(new Set(r.virtues).size).toBe(r.virtues.length);
      expect(new Set(r.sins).size).toBe(r.sins.length);
      expect(r.tenets.length).toBeGreaterThanOrEqual(3);
      expect(r.tenets.length).toBeLessThanOrEqual(6);
      expect(r.zeal).toBeGreaterThan(0);
      expect(r.zeal).toBeLessThan(1);
      expect(r.origin).toBe(culture.id);
      expect(r.parent).toBeNull();
      expect(r.founder).toBeNull();

      // Calendar: 3-5 feasts, distinct months, all within the year.
      expect(r.holyDays.length).toBeGreaterThanOrEqual(3);
      expect(r.holyDays.length).toBeLessThanOrEqual(5);
      expect(new Set(r.holyDays.map((h) => h.month)).size).toBe(r.holyDays.length);
      expect(new Set(r.holyDays.map((h) => h.name)).size).toBe(r.holyDays.length);
      for (const h of r.holyDays) {
        expect(h.month).toBeGreaterThanOrEqual(1);
        expect(h.month).toBeLessThanOrEqual(12);
      }

      // Deities: counts per shape, and each fully formed.
      const n = r.deities.length;
      switch (r.shape) {
        case "pantheon":
          expect(n).toBeGreaterThanOrEqual(4);
          expect(n).toBeLessThanOrEqual(9);
          break;
        case "dualist":
          expect(n).toBe(2);
          break;
        case "monist":
          expect(n).toBe(1);
          break;
        case "ancestor":
          expect(n).toBeGreaterThanOrEqual(2);
          expect(n).toBeLessThanOrEqual(4);
          break;
        case "animist":
          expect(n).toBeGreaterThanOrEqual(3);
          expect(n).toBeLessThanOrEqual(6);
          break;
        case "mystery":
          expect(n).toBeGreaterThanOrEqual(1);
          expect(n).toBeLessThanOrEqual(2);
          break;
      }
      const deityNames = new Set(r.deities.map((d) => d.name));
      expect(deityNames.size).toBe(n);
      for (const d of r.deities) {
        expect(d.name[0]).toBe(d.name[0].toUpperCase());
        expect(d.domains.length).toBeGreaterThanOrEqual(1);
        expect(d.domains.length).toBeLessThanOrEqual(3);
        expect(VALID_TEMPERS.has(d.temper)).toBe(true);
      }
    }
    // Culture variety should surface most of the shape catalog.
    expect(shapesSeen.size).toBeGreaterThanOrEqual(4);
    expect(names.size).toBeGreaterThanOrEqual(12);
  });

  it("keeps clergy coherent with hard patriarchy", () => {
    const service = createReligionService();
    for (let i = 0; i < 40; i++) {
      const { world, culture, rng } = genFixture(`pat-${i}`, {
        values: VALUE_SETS[i % VALUE_SETS.length],
        patriarchy: 0.9,
        mysticism: 0.4 + (i % 5) * 0.1,
      });
      const r = service.generate(rng, world, culture);
      expect(r.clergyGender === "f").toBe(false);
    }
  });

  it("is deterministic: same seed, same faith", () => {
    const service = createReligionService();
    const a = genFixture("det-1", { values: ["piety", "kinship", "seafaring"], mysticism: 0.6 });
    const b = genFixture("det-1", { values: ["piety", "kinship", "seafaring"], mysticism: 0.6 });
    const ra = service.generate(a.rng, a.world, a.culture);
    const rb = service.generate(b.rng, b.world, b.culture);
    expect(JSON.stringify(ra)).toBe(JSON.stringify(rb));
  });
});

describe("word forge", () => {
  const langBase = (world: ReturnType<typeof makeWorld>): Language => makeLanguage(world);

  it("applies orthography replacements", () => {
    const world = makeWorld("w-orth");
    const lang = langBase(world);
    lang.phonology = {
      consonants: ["k"],
      vowels: ["a"],
      patterns: ["CV"],
      patternWeights: [1],
      finals: [],
      orthography: [["ka", "cha"]],
      forbidden: [],
    };
    const rng = new Rng("orth", "orth");
    for (let i = 0; i < 30; i++) {
      const w = forgeWord(rng.fork(i), lang, 1, 3);
      expect(/^(cha)+$/.test(w)).toBe(true);
    }
  });

  it("drops word-final consonants in open-syllable tongues", () => {
    const world = makeWorld("w-open");
    const lang = langBase(world);
    lang.phonology = {
      consonants: ["k", "t"],
      vowels: ["a", "o"],
      patterns: ["CVC"],
      patternWeights: [1],
      finals: [],
      orthography: [],
      forbidden: [],
    };
    const rng = new Rng("open", "open");
    for (let i = 0; i < 30; i++) {
      const w = forgeWord(rng.fork(i), lang, 1, 3);
      expect(/[ao]$/.test(w)).toBe(true);
    }
  });

  it("avoids forbidden sequences", () => {
    const world = makeWorld("w-forb");
    const lang = langBase(world);
    lang.phonology = {
      consonants: ["k", "t"],
      vowels: ["a"],
      patterns: ["CV"],
      patternWeights: [1],
      finals: [],
      orthography: [],
      forbidden: ["ka"],
    };
    const rng = new Rng("forb", "forb");
    for (let i = 0; i < 50; i++) {
      const w = forgeWord(rng.fork(i), lang, 1, 3);
      expect(w.includes("ka")).toBe(false);
    }
  });
});

describe("schism", () => {
  function schismFixture(seed: string) {
    const world = makeWorld(seed);
    const lang = makeLanguage(world);
    const culture = makeCulture(world, lang, {
      values: ["conquest", "revelry", "honor"],
      mysticism: 0.45,
    });
    const rng = new Rng(seed, `schism:${seed}`);
    const service = createReligionService();
    const parent = service.generate(rng.fork("parent"), world, culture);
    parent.id = nextId(world, "religion") as ReligionId;
    parent.origin = culture.id;
    world.religions.set(parent.id, parent);
    const region = makeRegion(world);
    const town = makeSettlement(world, region, 0, {});
    const founder = makePerson(world, culture, parent.id, town.id, {
      ageYears: 33,
      piety: 0.9,
    });
    const parentSnapshot = JSON.parse(JSON.stringify(parent)) as Religion;
    const report = schismWithReport(rng.fork("schism"), world, parent, founder);
    return { world, parent, parentSnapshot, founder, report };
  }

  it("mutates 1-3 doctrines but keeps the family resemblance", () => {
    for (let i = 0; i < 30; i++) {
      const { world, parent, parentSnapshot, founder, report } = schismFixture(`sch-${i}`);
      const child = report.religion;

      // The parent object itself is never touched.
      expect(JSON.stringify(parent)).toBe(JSON.stringify(parentSnapshot));

      expect(report.mutations.length).toBeGreaterThanOrEqual(1);
      expect(report.mutations.length).toBeLessThanOrEqual(3);
      expect(report.contention.length).toBeGreaterThan(0);

      // Lineage.
      expect(child.parent).toBe(parent.id);
      expect(child.founder).toBe(founder.id);
      expect(child.origin).toBe(founder.culture);
      expect(child.shape).toBe(parent.shape);
      expect(child.id).not.toBe(parent.id);
      expect(world.religions.get(child.id)).toBe(child);
      expect(child.name).not.toBe(parent.name);

      // Family resemblance: gods, morals and feasts drift by at most a step.
      const parentDeities = new Set(parent.deities.map((d) => d.name));
      for (const d of child.deities) expect(parentDeities.has(d.name)).toBe(true);
      expect(child.deities.length).toBeGreaterThanOrEqual(parent.deities.length - 1);
      const sharedVirtues = child.virtues.filter((v) => parent.virtues.includes(v));
      expect(sharedVirtues.length).toBeGreaterThanOrEqual(parent.virtues.length - 1);
      const sharedSins = child.sins.filter((s) => parent.sins.includes(s));
      expect(sharedSins.length).toBeGreaterThanOrEqual(parent.sins.length - 1);
      expect(Math.abs(child.holyDays.length - parent.holyDays.length)).toBeLessThanOrEqual(1);

      expect(child.zeal).toBeGreaterThanOrEqual(0.05);
      expect(child.zeal).toBeLessThanOrEqual(0.98);
      expect(child.tenets.length).toBeGreaterThanOrEqual(2);
      expect(child.tenets.length).toBeLessThanOrEqual(7);
      for (const s of allStrings(child)) {
        expect(s.includes("—")).toBe(false);
        for (const tok of TOKENS) expect(s.includes(tok)).toBe(false);
      }
    }
  });

  it("is deterministic", () => {
    const a = schismFixture("sch-det");
    const b = schismFixture("sch-det");
    expect(JSON.stringify(a.report.religion)).toBe(JSON.stringify(b.report.religion));
    expect(a.report.mutations).toEqual(b.report.mutations);
  });
});

describe("religion tick", () => {
  it("is deterministic over 240 months", () => {
    const service = createReligionService();
    const a = makeTickFixture("tick-det", service);
    const b = makeTickFixture("tick-det", service);
    expect(JSON.stringify(a.religions)).toBe(JSON.stringify(b.religions));
    runMonths(a, 240);
    runMonths(b, 240);
    expect(chronicleFingerprint(a.world)).toBe(chronicleFingerprint(b.world));
  });

  it("holds exactly one festival per polity on each holy-day month", () => {
    const service = createReligionService();
    const fix = makeTickFixture("tick-fest", service);
    runMonths(fix, 24); // every calendar month passes exactly twice
    const festivals = [...fix.world.events.values()].filter((e) => e.type === "festival");
    for (let i = 0; i < fix.polities.length; i++) {
      const pid = fix.polities[i];
      const holyMonths = new Set(fix.religions[i].holyDays.map((h) => h.month));
      const mine = festivals.filter((e) => e.data.polity === pid);
      expect(mine.length).toBe(2 * fix.religions[i].holyDays.length);
      for (const ev of mine) {
        expect(holyMonths.has(monthOf(ev.date))).toBe(true);
        expect(ev.importance).toBeGreaterThanOrEqual(4);
        expect(ev.importance).toBeLessThanOrEqual(8);
        expect(Object.keys(ev.participants).length).toBeGreaterThanOrEqual(2);
        expect(Object.keys(ev.participants).length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("keeps event volume low and bounded over a decade", () => {
    const service = createReligionService();
    const fix = makeTickFixture("tick-vol", service);
    runMonths(fix, 120);
    const events = [...fix.world.events.values()];
    const byType = new Map<string, EventRecord[]>();
    for (const e of events) {
      const list = byType.get(e.type as string) ?? [];
      list.push(e);
      byType.set(e.type as string, list);
    }
    const count = (t: string) => byType.get(t)?.length ?? 0;

    const expectedFestivals =
      10 * (fix.religions[0].holyDays.length + fix.religions[1].holyDays.length);
    expect(count("festival")).toBe(expectedFestivals);

    // Rarities stay rare.
    expect(count("omen")).toBeLessThanOrEqual(30);
    expect(count("miracle-claimed")).toBeLessThanOrEqual(12);
    expect(count("temple-built")).toBeLessThanOrEqual(6);
    const hooks = count("quarrel") + count("romance-began");
    expect(hooks).toBeLessThanOrEqual(Math.ceil(expectedFestivals * 0.4) + 5);

    // Hooks are always caused by a festival.
    for (const t of ["quarrel", "romance-began"]) {
      for (const ev of byType.get(t) ?? []) {
        expect(ev.causes.length).toBe(1);
        expect(fix.world.events.get(ev.causes[0])?.type).toBe("festival");
      }
    }

    // Importance stays in band.
    for (const ev of byType.get("omen") ?? []) {
      expect(ev.importance).toBeGreaterThanOrEqual(6);
      expect(ev.importance).toBeLessThanOrEqual(12);
    }
    for (const ev of byType.get("miracle-claimed") ?? []) {
      expect(ev.importance).toBeGreaterThanOrEqual(15);
      expect(ev.importance).toBeLessThanOrEqual(24);
    }
    for (const ev of byType.get("temple-built") ?? []) {
      expect(ev.importance).toBeGreaterThanOrEqual(13);
      expect(ev.importance).toBeLessThanOrEqual(18);
    }

    // Omens carry the canonical payload.
    for (const ev of byType.get("omen") ?? []) {
      expect(typeof ev.data.sign).toBe("string");
      expect(typeof ev.data.interpretation).toBe("string");
      expect((ev.data.sign as string).length).toBeGreaterThan(0);
      expect((ev.data.interpretation as string).length).toBeGreaterThan(0);
    }

    // No person's chronicle is spammed: participation stays plausible.
    const participation = new Map<number, number>();
    for (const ev of events) {
      for (const key of Object.keys(ev.participants)) {
        const id = ev.participants[key];
        participation.set(id, (participation.get(id) ?? 0) + 1);
      }
    }
    let heavy = 0;
    for (const [, n] of participation) {
      expect(n).toBeLessThanOrEqual(40);
      if (n > 15) heavy++;
    }
    expect(heavy).toBeLessThanOrEqual(8);

    // No unfilled tokens or em-dashes anywhere in the chronicle.
    const fp = chronicleFingerprint(fix.world);
    expect(fp.includes("—")).toBe(false);
    for (const tok of TOKENS) expect(fp.includes(tok)).toBe(false);
  });

  it("produces more omens where mysticism runs high", () => {
    const service = createReligionService();
    const countOmens = (mysticism: number): number => {
      let total = 0;
      for (let s = 0; s < 6; s++) {
        const fix = makeTickFixture(`omen-${mysticism}-${s}`, service, [
          { values: ["kinship", "hospitality", "honor"], mysticism },
        ]);
        runMonths(fix, 240);
        total += [...fix.world.events.values()].filter((e) => e.type === "omen").length;
      }
      return total;
    };
    const low = countOmens(0.05);
    const high = countOmens(0.95);
    expect(high).toBeGreaterThan(low);
  });
});
