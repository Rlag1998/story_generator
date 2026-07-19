import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import { fnv1a } from "./core/rng";
import { eventsOf } from "./core/world";

/** Hash the entire event log into one number for determinism comparison. */
function chronicleHash(engine: ReturnType<typeof createEngine>): number {
  const parts: string[] = [];
  for (const ev of engine.world.events.values()) {
    parts.push(
      `${ev.id}|${ev.type}|${ev.date}|${JSON.stringify(ev.participants)}|${ev.importance}|${ev.causes.join(",")}`,
    );
  }
  return fnv1a(parts.join("\n"));
}

describe("engine integration", () => {
  it("same seed produces byte-identical history", () => {
    const a = createEngine("determinism-test");
    const b = createEngine("determinism-test");
    a.runYears(30);
    b.runYears(30);
    expect(a.world.now).toBe(b.world.now);
    expect(a.world.events.size).toBe(b.world.events.size);
    expect(chronicleHash(a)).toBe(chronicleHash(b));
    expect(a.world.stats).toEqual(b.world.stats);
  });

  it("different seeds produce different worlds", () => {
    const a = createEngine("world-a");
    const b = createEngine("world-b");
    a.runYears(10);
    b.runYears(10);
    expect(chronicleHash(a)).not.toBe(chronicleHash(b));
    // Languages differ: compare first culture names.
    const nameA = [...a.world.cultures.values()][0]?.name;
    const nameB = [...b.world.cultures.values()][0]?.name;
    expect(nameA).not.toBe(nameB);
  });

  it("population stays alive and bounded over 80 years", () => {
    const e = createEngine("stability-test");
    e.runYears(80);
    expect(e.world.stats.alive).toBeGreaterThan(100);
    expect(e.world.stats.alive).toBeLessThan(e.world.params.popCap * 1.3);
    expect(e.world.stats.totalBorn).toBeGreaterThan(200);
    expect(e.world.stats.totalDied).toBeGreaterThan(100);
  }, 120_000);

  it("lives accumulate meaningful, renderable events", () => {
    const e = createEngine("story-density");
    e.runYears(60);
    const world = e.world;
    // Sample dead adults: they should have chronicles.
    const deadAdults = [...world.people.values()].filter(
      (p) => p.died != null && p.died - p.born > 25 * 12,
    );
    expect(deadAdults.length).toBeGreaterThan(10);
    let totalEvents = 0;
    for (const p of deadAdults.slice(0, 40)) {
      const evs = eventsOf(world, p.id);
      totalEvents += evs.length;
      for (const ev of evs.slice(0, 10)) {
        const prose = e.services.narrative.renderEvent(world, ev);
        expect(prose.length).toBeGreaterThan(10);
        expect(prose).not.toContain("undefined");
        expect(prose).not.toContain("[object");
      }
      const bio = e.services.narrative.renderLife(world, p);
      expect(bio.length).toBeGreaterThan(100);
    }
    const avg = totalEvents / Math.min(40, deadAdults.length);
    expect(avg).toBeGreaterThan(5);
  }, 120_000);

  it("storylines spawn and resolve", () => {
    const e = createEngine("arc-test");
    e.runYears(60);
    expect(e.world.storylines.size).toBeGreaterThan(5);
    const resolved = [...e.world.storylines.values()].filter((s) => s.resolved);
    expect(resolved.length).toBeGreaterThan(0);
  }, 120_000);

  it("succession continues across ruler deaths", () => {
    const e = createEngine("crown-test");
    e.runYears(80);
    for (const pol of e.world.polities.values()) {
      expect(pol.reigns.length).toBeGreaterThan(0);
    }
    // At least one polity should have had a succession (multiple reigns).
    const multi = [...e.world.polities.values()].some((p) => p.reigns.length >= 2);
    expect(multi).toBe(true);
  }, 120_000);
});
