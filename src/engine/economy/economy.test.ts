/**
 * Economy module tests: harvest distribution sanity, famine conditions,
 * plague spread determinism + guaranteed end, fire casualties via the
 * people.kill mock, condition set/clear invariants, trade, prose hygiene,
 * and full determinism (same seed twice -> identical digests).
 */

import { describe, expect, it } from "vitest";
import { monthOf } from "../core/time";
import type { EventRecord, Region, RegionId } from "../core/types";
import { igniteFire } from "./disasters";
import { classifyHarvest, HARVEST_MONTH } from "./harvest";
import { startPlague } from "./plague";
import { COND, econState, regionHarvest, WORLD_COND } from "./state";
import { startBoom } from "./trade";
import { makeEconWorld, type TestHarness, worldDigest } from "./testkit";

function runYears(h: TestHarness, years: number): void {
  for (let i = 0; i < years * 12; i++) h.tick();
}

function eventsOfType(h: TestHarness, type: string): EventRecord[] {
  return [...h.world.events.keys()]
    .sort((a, b) => a - b)
    .map((id) => h.world.events.get(id)!)
    .filter((e) => e.type === type);
}

// ---------------------------------------------------------------------------
// Harvest
// ---------------------------------------------------------------------------

describe("harvest", () => {
  it("classifyHarvest escalates consecutive poor years toward famine", () => {
    const region: Region = {
      id: 1,
      name: "Testmark",
      biome: "plains",
      adjacent: [],
      settlements: [1],
      x: 0,
      y: 0,
    };
    const noise = new Map<RegionId, number>([[1, -2.5]]);
    expect(classifyHarvest(region, noise, 0, 0)).toBe("poor");
    expect(classifyHarvest(region, noise, 0, 2)).toBe("famine");
    const goodNoise = new Map<RegionId, number>([[1, 2.5]]);
    expect(classifyHarvest(region, goodNoise, 0, 0)).toBe("bountiful");
    const midNoise = new Map<RegionId, number>([[1, 0]]);
    expect(classifyHarvest(region, midNoise, 0, 0)).toBe("normal");
  });

  it("harvest distribution over 300 years is sane; marsh riskier than plains", () => {
    const h = makeEconWorld({ seed: "harvest-300" });
    runYears(h, 300);
    const state = econState(h.world);

    for (const region of h.regions) {
      const hist = regionHarvest(state, region.id);
      const total =
        hist.counts.bountiful + hist.counts.normal + hist.counts.poor + hist.counts.famine;
      expect(total).toBeGreaterThanOrEqual(299);
      expect(total).toBeLessThanOrEqual(301);
      // Most years are unremarkable; extremes exist but do not dominate.
      expect(hist.counts.normal / total).toBeGreaterThan(0.45);
      expect(hist.counts.bountiful).toBeGreaterThanOrEqual(1);
      expect(hist.counts.bountiful / total).toBeLessThan(0.3);
      expect(hist.counts.famine / total).toBeLessThan(0.25);
    }
    const marsh = regionHarvest(state, h.regions[2].id); // Fenmarch
    const plains = regionHarvest(state, h.regions[1].id); // Threllwold
    expect(marsh.counts.famine).toBeGreaterThan(plains.counts.famine);
    // Famine happens somewhere in three centuries.
    const famines = eventsOfType(h, "famine");
    expect(famines.length).toBeGreaterThanOrEqual(3);
    for (const f of famines) {
      expect(f.importance).toBe(45);
      expect(monthOf(f.date)).toBe(HARVEST_MONTH);
      expect(typeof f.data.severity).toBe("number");
    }
    // Roads get built between prosperous adjacent regions, each pair once.
    const roads = eventsOfType(h, "road-built");
    expect(roads.length).toBeGreaterThanOrEqual(1);
    expect(new Set(state.roads).size).toBe(state.roads.length);
    expect(roads.length).toBe(state.roads.length);
    // Wealth stays bounded 0..5 for everyone, living or dead.
    for (const p of h.world.people.values()) {
      expect(p.status.wealth).toBeGreaterThanOrEqual(0);
      expect(p.status.wealth).toBeLessThanOrEqual(5);
      expect(Number.isInteger(p.status.wealth)).toBe(true);
    }
  });

  it("famine sets settlement conditions and clears them silently", () => {
    const h = makeEconWorld({ seed: "famine-hunt" });
    let famine: EventRecord | null = null;
    for (let i = 0; i < 250 * 12 && !famine; i++) {
      h.tick();
      famine = eventsOfType(h, "famine")[0] ?? null;
    }
    expect(famine).not.toBeNull();
    const region = h.world.regions.get(famine!.region!)!;
    for (const sid of region.settlements) {
      const s = h.world.settlements.get(sid)!;
      expect(s.conditions[COND.famine]).toBe(true);
      const sev = s.conditions[COND.famineSeverity];
      expect(typeof sev).toBe("number");
      expect(sev as number).toBeGreaterThan(0);
      expect(sev as number).toBeLessThanOrEqual(1);
    }
    // The hunger lifts within its recorded span (or a fresh famine strikes).
    const before = eventsOfType(h, "famine").length;
    let cleared = false;
    for (let i = 0; i < 40 && !cleared; i++) {
      h.tick();
      cleared = region.settlements.every(
        (sid) => !h.world.settlements.get(sid)!.conditions[COND.famine],
      );
    }
    const extraFamines = eventsOfType(h, "famine").length - before;
    expect(cleared || extraFamines >= 2).toBe(true);
    // Recovery is silent: onsets only, never a "famine-ended" entry.
    const types = new Set([...h.world.events.values()].map((e) => e.type));
    expect(types.has("famine-ended")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plague
// ---------------------------------------------------------------------------

describe("plague", () => {
  function forcedPlague(seed: string): TestHarness {
    const h = makeEconWorld({ seed });
    runYears(h, 2);
    const ctx = h.mkCtx();
    startPlague(ctx, econState(h.world), h.byName["Gullhaven"].id);
    return h;
  }

  it("forced outbreak names the disease, marks conditions, and always ends", () => {
    const h = forcedPlague("plague-1");
    const outbreak = eventsOfType(h, "plague-outbreak")[0];
    expect(outbreak).toBeDefined();
    expect(outbreak.importance).toBe(75);
    const name = outbreak.data.name as string;
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(3);
    expect(outbreak.data.region).toBe(h.byName["Gullhaven"].region);
    // World and origin settlement both carry the sickness by name.
    expect(h.world.conditions[WORLD_COND.plague]).toBe(name);
    const origin = h.byName["Gullhaven"];
    expect(origin.conditions[COND.plague]).toBe(name);
    expect(origin.conditions[COND.plagueSeverity] as number).toBeGreaterThan(0);

    // Run until it burns out. Guaranteed end, well under six years.
    let months = 0;
    let peak = 0;
    while (econState(h.world).plague && months < 72) {
      h.tick();
      const sev = origin.conditions[COND.plagueSeverity];
      if (typeof sev === "number") peak = Math.max(peak, sev);
      months++;
    }
    expect(econState(h.world).plague).toBeNull();
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(0.9);

    const ended = eventsOfType(h, "plague-ended");
    expect(ended.length).toBe(1);
    expect(ended[0].causes).toContain(outbreak.id);
    expect(ended[0].data.name).toBe(name);
    expect(ended[0].data.months as number).toBeGreaterThanOrEqual(5);
    expect(ended[0].data.months as number).toBeLessThanOrEqual(60);
    expect(ended[0].data.regionsTouched as number).toBeGreaterThanOrEqual(2); // it spread
    // Aftermath windfalls reference real survivors.
    const windfalls = ended[0].data.windfalls as { person: number; gain: string }[];
    for (const w of windfalls) {
      const p = h.world.people.get(w.person)!;
      expect(p.died).toBeNull();
      expect(w.gain.length).toBeGreaterThan(5);
    }
    // Everything swept clean.
    expect(h.world.conditions[WORLD_COND.plague]).toBeUndefined();
    for (const s of h.world.settlements.values()) {
      expect(s.conditions[COND.plague]).toBeUndefined();
      expect(s.conditions[COND.plagueSeverity]).toBeUndefined();
    }
  });

  it("plague spread is deterministic (same seed -> identical course)", () => {
    const a = forcedPlague("plague-det");
    const b = forcedPlague("plague-det");
    for (let i = 0; i < 72; i++) {
      a.tick();
      b.tick();
    }
    expect(worldDigest(a.world)).toBe(worldDigest(b.world));
  });

  it("outbreaks are generational over 400 years; names never repeat", () => {
    const h = makeEconWorld({ seed: "freq-400" });
    // Track comet condition lifecycle while running.
    const cometActiveAt: number[] = [];
    for (let i = 0; i < 400 * 12; i++) {
      h.tick();
      if (h.world.conditions[WORLD_COND.comet]) cometActiveAt.push(h.world.now);
    }
    const outbreaks = eventsOfType(h, "plague-outbreak");
    expect(outbreaks.length).toBeGreaterThanOrEqual(1);
    expect(outbreaks.length).toBeLessThanOrEqual(14);
    const names = outbreaks.map((e) => e.data.name as string);
    expect(new Set(names).size).toBe(names.length);
    // Every outbreak is followed by exactly one ending (none dangling except
    // possibly the last, if the run stopped mid-plague).
    const ended = eventsOfType(h, "plague-ended");
    expect(ended.length).toBeGreaterThanOrEqual(outbreaks.length - 1);
    // Comets hang in the sky for a season or two, then fade silently.
    const comets = eventsOfType(h, "comet");
    for (const c of comets) {
      expect(c.importance).toBe(40);
      expect(cometActiveAt).toContain(c.date);
      const lingering = cometActiveAt.filter((m) => m >= c.date && m <= c.date + 9);
      expect(lingering.length).toBeLessThanOrEqual(9);
    }
    if (comets.length > 0) {
      // The sky is not permanently haunted.
      expect(cometActiveAt.length).toBeLessThan(comets.length * 10);
    }
  });
});

// ---------------------------------------------------------------------------
// Fire (people.kill mock)
// ---------------------------------------------------------------------------

describe("fire", () => {
  it("kills 1-4 named residents via people.kill, linked to the fire event", () => {
    const h = makeEconWorld({ seed: "fire-basic" });
    const ctx = h.mkCtx();
    const town = h.byName["Threll"];
    const fire = igniteFire(ctx, econState(h.world), town, h.root.fork("fire-x"));
    expect(fire.type).toBe("fire");
    expect(fire.importance).toBe(30);
    expect(fire.data.name).toBe("the great fire of Threll");
    const fallen = fire.data.fallen as number[];
    expect(h.spies.kills.length).toBe(fallen.length);
    expect(h.spies.kills.length).toBeGreaterThanOrEqual(1);
    expect(h.spies.kills.length).toBeLessThanOrEqual(4);
    for (const k of h.spies.kills) {
      expect(k.cause).toBe("the great fire of Threll");
      expect(k.event).toBe(fire.id);
      expect(fallen).toContain(k.id);
    }
  });

  it("sometimes stars a heroic rescue by the brave local", () => {
    let rescues = 0;
    for (let i = 0; i < 25; i++) {
      const h = makeEconWorld({ seed: `fire-h-${i}` });
      const ctx = h.mkCtx();
      const town = h.byName["Threll"];
      const fire = igniteFire(ctx, econState(h.world), town, h.root.fork("fire-try", i));
      const rescue = eventsOfType(h, "heroic-rescue")[0];
      if (!rescue) continue;
      rescues++;
      expect(rescue.importance).toBe(25);
      expect(rescue.causes).toContain(fire.id);
      const rescuer = h.world.people.get(rescue.participants.rescuer)!;
      const saved = h.world.people.get(rescue.participants.saved)!;
      expect(rescuer.givenName.startsWith("Brave-")).toBe(true);
      // The saved live; they are not among the kill calls.
      expect(saved.died).toBeNull();
      expect(h.spies.kills.some((k) => k.id === saved.id)).toBe(false);
    }
    expect(rescues).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Trade
// ---------------------------------------------------------------------------

describe("trade", () => {
  it("boom sets the condition, bumps merchant wealth, expires silently", () => {
    const h = makeEconWorld({ seed: "boom-1" });
    const port = h.byName["Gullhaven"];
    const merchantsBefore = new Map<number, number>();
    for (const p of h.world.people.values()) {
      if (p.location === port.id) merchantsBefore.set(p.id, p.status.wealth);
    }
    const ctx = h.mkCtx();
    startBoom(ctx, econState(h.world), port, h.root.fork("boom-x"));
    const boom = eventsOfType(h, "trade-boom")[0];
    expect(boom).toBeDefined();
    expect(boom.importance).toBe(12);
    expect(port.conditions[COND.boom]).toBe(true);
    expect(boom.data.months as number).toBeGreaterThanOrEqual(12);
    expect(boom.data.months as number).toBeLessThanOrEqual(24);
    expect((boom.data.wares as string).includes(" and ")).toBe(true);
    // Wealth moved up for traders only, never past the bounds.
    for (const [id, before] of merchantsBefore) {
      const p = h.world.people.get(id)!;
      expect(p.status.wealth).toBeGreaterThanOrEqual(before);
      expect(p.status.wealth).toBeLessThanOrEqual(5);
      const trades = ["merchant", "peddler", "innkeeper"];
      if (!trades.includes(p.status.profession)) expect(p.status.wealth).toBe(before);
    }
    // The boom fades without an event.
    for (let i = 0; i < 30; i++) h.tick();
    expect(port.conditions[COND.boom]).toBeUndefined();
    const types = new Set([...h.world.events.values()].map((e) => e.type));
    expect(types.has("boom-ended")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conditions invariants + volume + determinism + prose
// ---------------------------------------------------------------------------

describe("conditions and discipline", () => {
  it("timed condition flags always match their clocks (80-year sweep)", () => {
    const h = makeEconWorld({ seed: "inv-1" });
    const violations: string[] = [];
    for (let i = 0; i < 80 * 12; i++) {
      h.tick();
      const state = econState(h.world);
      const now = h.world.now;
      for (const s of h.world.settlements.values()) {
        const key = String(s.id);
        const flag = (c: string): boolean => Boolean(s.conditions[c]);
        const clock = (rec: Record<string, number>): boolean => (rec[key] ?? 0) > now;
        if (flag(COND.plenty) !== clock(state.plentyUntil))
          violations.push(`${now} ${s.name} plenty`);
        if (flag(COND.lean) !== clock(state.leanUntil)) violations.push(`${now} ${s.name} lean`);
        if (flag(COND.famine) !== clock(state.famineUntil))
          violations.push(`${now} ${s.name} famine`);
        if (flag(COND.famine) !== (s.conditions[COND.famineSeverity] !== undefined))
          violations.push(`${now} ${s.name} famineSeverity`);
        if (flag(COND.boom) !== clock(state.boomUntil)) violations.push(`${now} ${s.name} boom`);
        const infected = state.plague !== null && state.plague.towns[key] !== undefined;
        if (flag(COND.plague) !== infected) violations.push(`${now} ${s.name} plague`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps event volume disciplined over a century", () => {
    const h = makeEconWorld({ seed: "vol-1" });
    runYears(h, 100);
    const econEvents = [...h.world.events.values()].filter((e) => e.type !== "death");
    expect(econEvents.length).toBeGreaterThanOrEqual(20);
    expect(econEvents.length).toBeLessThanOrEqual(260);
    // Only economy event types (plus the stub's deaths) ever appear.
    const allowed = new Set([
      "death",
      "famine",
      "bountiful-harvest",
      "plague-outbreak",
      "plague-ended",
      "fire",
      "heroic-rescue",
      "flood",
      "storm",
      "earthquake",
      "comet",
      "trade-boom",
      "road-built",
    ]);
    for (const e of h.world.events.values()) {
      expect(allowed.has(e.type as string)).toBe(true);
    }
  });

  it("is deterministic: same seed twice gives identical digests", () => {
    const a = makeEconWorld({ seed: "det-1" });
    const b = makeEconWorld({ seed: "det-1" });
    runYears(a, 100);
    runYears(b, 100);
    const da = worldDigest(a.world);
    expect(da).toBe(worldDigest(b.world));
    expect(da).toContain("bountiful-harvest"); // something actually happened
  });

  it("prose hygiene: no em-dashes, en-dashes, or undefineds in event data", () => {
    const h = makeEconWorld({ seed: "freq-400b" });
    runYears(h, 300);
    const blob = JSON.stringify([...h.world.events.values()].map((e) => e.data));
    expect(blob.includes("—")).toBe(false); // em-dash
    expect(blob.includes("–")).toBe(false); // en-dash
    expect(blob.includes("undefined")).toBe(false);
    // Disease and comet names read like names.
    for (const e of h.world.events.values()) {
      if (e.type === "plague-outbreak" || e.type === "comet") {
        const name = e.data.name as string;
        expect(name === name.trim()).toBe(true);
        expect(name.startsWith("the ") || name.includes("'s ")).toBe(true);
      }
    }
  });
});
