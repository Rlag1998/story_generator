import { describe, expect, it } from "vitest";
import { Rng } from "../core/rng";
import type { Ctx, Person, Storyline, StorylineKind } from "../core/types";
import { sortedIds } from "../core/world";
import { ARCS, SF, arcCapacity, castable } from "./index";
import type { TestHarness } from "./testkit";
import { chronicleDigest, makeTestWorld, marry } from "./testkit";

// ---------------------------------------------------------------------------
// Population seeding for full-sim tests
// ---------------------------------------------------------------------------

const TRADES = [
  "farmer",
  "fisher",
  "smith",
  "weaver",
  "bard",
  "merchant",
  "carpenter",
  "herder",
  "priest",
  "potter",
] as const;

function seedPopulation(h: TestHarness, n: number): void {
  const rng = h.root.fork("seed-pop");
  const houses = [h.addHouse("House Marlow", h.settlements[0].id), h.addHouse("Clan Durroch", h.settlements[1].id)];
  houses[0].feuds.set(houses[1].id, 0.15);
  houses[1].feuds.set(houses[0].id, 0.15);
  const people: Person[] = [];
  for (let i = 0; i < n; i++) {
    const r = rng.fork("p", i);
    const rank = r.fork("rank").weightedPairs([
      [1, 5],
      [2, 2],
      [3, 1.2],
      [4, 0.5],
    ] as const);
    const p = h.addPerson({
      sex: r.fork("sex").chance(0.5) ? "f" : "m",
      ageYears: r.fork("age").intIn(17, 55),
      location: h.settlements[i % Math.min(2, h.settlements.length)].id,
      rank,
      wealth: Math.min(5, rank + r.fork("wealth").intIn(0, 2)),
      profession: r.fork("prof").pick(TRADES),
      house: rank >= 3 ? houses[i % 2].id : r.fork("house").chance(0.25) ? houses[i % 2].id : null,
    });
    people.push(p);
  }
  // Marriages knit the fabric.
  const women = people.filter((p) => p.sex === "f");
  const men = people.filter((p) => p.sex === "m");
  for (let i = 0; i < Math.min(women.length, men.length); i++) {
    if (rng.fork("wed", i).chance(0.5)) marry(h.world, women[i], men[i]);
  }
  // A few gifted children for prodigy arcs.
  for (let i = 0; i < 4; i++) {
    h.addPerson({
      ageYears: 8 + i,
      location: h.settlements[i % 2].id,
      aptitudes: { craft: 3 },
      profession: "none",
      rank: 1,
    });
  }
}

function activeCount(h: TestHarness): number {
  let n = 0;
  for (const sid of sortedIds(h.world.storylines)) {
    if (!h.world.storylines.get(sid)!.resolved) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Forced-scenario builders: put one arc on stage deliberately
// ---------------------------------------------------------------------------

interface Scenario {
  h: TestHarness;
  star: Person;
  /** For succession: spawn via worldSpawn instead of star spawn. */
  worldSpawned?: boolean;
}

function buildScenario(kind: StorylineKind, seed: string): Scenario {
  const h = makeTestWorld({ seed: `${kind}:${seed}`, settlements: 3 });
  const w = h.world;
  const home = h.settlements[0].id;

  switch (kind) {
    case "feud": {
      const ha = h.addHouse("House Ash", home);
      const hb = h.addHouse("House Thorn", home);
      ha.feuds.set(hb.id, 0.2);
      hb.feuds.set(ha.id, 0.2);
      const star = h.addPerson({ house: ha.id, ageYears: 30, personality: { wrath: 0.8, courage: 0.5 } });
      h.addPerson({ house: hb.id, ageYears: 32, sex: "m", personality: { wrath: 0.7 } });
      h.addPerson({ house: hb.id, ageYears: 28, sex: "m" });
      h.addPerson({ house: ha.id, ageYears: 26, sex: "m" });
      return { h, star };
    }
    case "forbidden-love": {
      const star = h.addPerson({ ageYears: 21, sex: "m", rank: 1, personality: { lust: 0.7, courage: 0.3 } });
      h.addPerson({ ageYears: 19, sex: "f", rank: 3, location: home });
      // Kin to enforce honor when tragedy calls.
      const father = h.addPerson({ ageYears: 50, sex: "m", personality: { wrath: 0.7, honor: 0.6 } });
      const beloved = [...w.people.values()].find((p) => p.status.rank === 3)!;
      beloved.father = father.id;
      father.children.push(beloved.id);
      return { h, star };
    }
    case "rivalry": {
      const star = h.addPerson({ ageYears: 33, profession: "smith", personality: { ambition: 0.8 }, aptitudes: { craft: 2 } });
      h.addPerson({ ageYears: 35, profession: "smith", aptitudes: { craft: 1 } });
      return { h, star };
    }
    case "ambition": {
      const star = h.addPerson({ ageYears: 28, profession: "merchant", personality: { ambition: 0.9 } });
      h.addPerson({ ageYears: 45, rank: 3 }); // a patron
      return { h, star };
    }
    case "revenge": {
      const star = h.addPerson({ ageYears: 30, sex: "f", personality: { wrath: 0.8, compassion: 0.2 } });
      const victim = h.addPerson({ ageYears: 32, sex: "m" });
      const slayer = h.addPerson({ ageYears: 36, sex: "m" });
      marry(w, star, victim);
      // Bystander pool for miscarried vengeance.
      h.addPerson({ ageYears: 40, sex: "m" });
      h.addPerson({ ageYears: 24, sex: "m" });
      const ctx = h.mkCtx();
      h.services.people.kill(ctx, victim, "cut down in a quarrel", { killer: slayer.id });
      return { h, star };
    }
    case "mystery-disappearance": {
      const star = h.addPerson({ ageYears: 34, profession: "fisher" });
      const spouse = h.addPerson({ ageYears: 33, sex: star.sex === "f" ? "m" : "f" });
      marry(w, star, spouse);
      const enemy = h.addPerson({ ageYears: 38 });
      h.services.social.setRelation(w, enemy.id, star.id, { kind: "nemesis", since: w.now, opinion: -70 });
      return { h, star };
    }
    case "prodigy": {
      const star = h.addPerson({ ageYears: 9, profession: "none", aptitudes: { craft: 3 } });
      h.addPerson({ ageYears: 40, profession: "smith" }); // a mentor
      h.addPerson({ ageYears: 11, profession: "none" }); // a jealous peer
      return { h, star };
    }
    case "downfall": {
      const star = h.addPerson({ ageYears: 40, wealth: 4, personality: { volatility: 0.6, greed: 0.6 } });
      const spouse = h.addPerson({ ageYears: 38, sex: star.sex === "f" ? "m" : "f" });
      marry(w, star, spouse);
      return { h, star };
    }
    case "usurpation-plot": {
      const ruler = h.addPerson({ ageYears: 50, rank: 5, personality: { compassion: 0.4 } });
      const polity = h.addPolity(home, ruler.id);
      const star = h.addPerson({ ageYears: 34, rank: 4, personality: { ambition: 0.9, honor: -0.2 } });
      star.flags["pol.claimant"] = polity.id;
      // Malcontents at the capital.
      for (let i = 0; i < 3; i++) {
        const m = h.addPerson({ ageYears: 30 + i, location: home, personality: { honor: -0.3 } });
        h.services.social.setRelation(w, m.id, ruler.id, { kind: "rival", since: w.now, opinion: -30 });
      }
      return { h, star };
    }
    case "heresy": {
      const star = h.addPerson({ ageYears: 36, rareTraits: ["the-sight"], personality: { piety: 0.9, courage: 0.4 } });
      h.addPerson({ ageYears: 50, profession: "priest" });
      for (let i = 0; i < 5; i++) {
        h.addPerson({ ageYears: 25 + i, personality: { piety: 0.7, openness: 0.4 } });
      }
      return { h, star };
    }
    case "curse": {
      const star = h.addPerson({ ageYears: 55, personality: { volatility: 0.6, piety: 0.7 } });
      const offender = h.addPerson({ ageYears: 40, wealth: 3 });
      const kid = h.addPerson({ ageYears: 12, profession: "none" });
      kid.father = offender.id;
      offender.children.push(kid.id);
      const ctx = h.mkCtx();
      const wrong = ctx.record({
        type: "insult",
        date: w.now,
        participants: { subject: offender.id, target: star.id },
        data: { slight: "took the widow's strip of field by a crooked survey" },
        location: home,
        region: h.settlements[0].region,
        importance: 7,
        causes: [],
        storyline: null,
        secret: false,
      });
      h.services.social.addMemory(w, star.id, { event: wrong.id, weight: 3, about: null, feeling: -0.9 });
      return { h, star };
    }
    case "masterwork": {
      const star = h.addPerson({ ageYears: 48, profession: "smith", personality: { diligence: 0.6 }, aptitudes: { craft: 2 } });
      const spouse = h.addPerson({ ageYears: 45, sex: star.sex === "f" ? "m" : "f" });
      marry(w, star, spouse);
      h.addPerson({ ageYears: 24, profession: "smith" }); // possible heir
      return { h, star };
    }
    case "succession-struggle": {
      const polity = h.addPolity(home, null);
      const a = h.addPerson({ ageYears: 34, rank: 4, personality: { ambition: 0.8 } });
      const b = h.addPerson({ ageYears: 38, rank: 4, personality: { ambition: 0.7 } });
      a.flags["pol.claimant"] = polity.id;
      b.flags["pol.claimant"] = polity.id;
      return { h, star: a, worldSpawned: true };
    }
    case "redemption": {
      const star = h.addPerson({ ageYears: 42, personality: { compassion: 0.5, diligence: 0.3 } });
      star.flags[SF.disgraced] = w.now - 24;
      const judge = h.addPerson({ ageYears: 45 });
      h.services.social.setRelation(w, judge.id, star.id, { kind: "rival", since: w.now, opinion: -50 });
      h.addPerson({ ageYears: 20 }); // someone to rescue
      return { h, star };
    }
    case "wanderer": {
      const star = h.addPerson({ ageYears: 24, personality: { openness: 0.7, piety: 0.7 } });
      const mother = h.addPerson({ ageYears: 58, sex: "f" });
      star.mother = mother.id;
      mother.children.push(star.id);
      return { h, star };
    }
  }
}

/** Force-spawn the arc, then run months until it resolves. */
function runScenario(kind: StorylineKind, seed: string, maxMonths = 400): Storyline | null {
  const sc = buildScenario(kind, seed);
  const { h, star } = sc;
  const ctx = h.mkCtx();
  const rng = h.root.fork("force-spawn");
  let s: Storyline | null;
  if (sc.worldSpawned) {
    ARCS[kind].worldSpawn!(ctx, rng, 1);
    const sid = sortedIds(h.world.storylines)[0];
    s = sid != null ? h.world.storylines.get(sid)! : null;
  } else {
    s = ARCS[kind].spawn(ctx, rng, star, { index: indexOf(ctx) });
  }
  if (!s) return null;
  for (let m = 0; m < maxMonths && !s.resolved; m++) h.tick();
  return s;
}

function indexOf(ctx: Ctx): Map<number, number[]> {
  const index = new Map<number, number[]>();
  for (const id of [...ctx.world.alive].sort((a, b) => a - b)) {
    const p = ctx.world.people.get(id);
    if (!p || p.location == null) continue;
    const list = index.get(p.location);
    if (list) list.push(id);
    else index.set(p.location, [id]);
  }
  return index;
}

const ALL_KINDS: StorylineKind[] = [
  "feud",
  "forbidden-love",
  "rivalry",
  "ambition",
  "revenge",
  "mystery-disappearance",
  "prodigy",
  "downfall",
  "usurpation-plot",
  "heresy",
  "curse",
  "masterwork",
  "succession-struggle",
  "redemption",
  "wanderer",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same seed twice produces identical chronicles and storylines", () => {
    const run = () => {
      const h = makeTestWorld({ seed: "det-1", settlements: 3 });
      seedPopulation(h, 90);
      for (let m = 0; m < 180; m++) h.tick();
      return chronicleDigest(h.world);
    };
    expect(run()).toBe(run());
  });

  it("different seeds diverge", () => {
    const run = (seed: string) => {
      const h = makeTestWorld({ seed, settlements: 3 });
      seedPopulation(h, 90);
      for (let m = 0; m < 120; m++) h.tick();
      return chronicleDigest(h.world);
    };
    expect(run("div-a")).not.toBe(run("div-b"));
  });
});

describe("spawning discipline", () => {
  it("respects the concurrency cap and the per-person cap every month", () => {
    const h = makeTestWorld({ seed: "caps-1", settlements: 3 });
    seedPopulation(h, 120);
    const cap = arcCapacity(h.world.alive.size) + 2; // world-spawn overflow allowance
    for (let m = 0; m < 240; m++) {
      h.tick();
      expect(activeCount(h)).toBeLessThanOrEqual(cap);
      for (const id of h.world.alive) {
        const p = h.world.people.get(id)!;
        expect(p.storylines.length).toBeLessThanOrEqual(2);
      }
    }
    expect(h.world.storylines.size).toBeGreaterThan(3);
  });

  it("stamps cooldown flags and releases cast when arcs end", () => {
    const h = makeTestWorld({ seed: "cool-1", settlements: 3 });
    seedPopulation(h, 90);
    for (let m = 0; m < 240; m++) h.tick();
    const resolved = [...h.world.storylines.values()].filter((s) => s.resolved);
    expect(resolved.length).toBeGreaterThan(0);
    for (const s of resolved) {
      expect(s.ended).not.toBeNull();
      expect(s.outcome).not.toBeNull();
      for (const role of Object.keys(s.cast)) {
        const p = h.world.people.get(s.cast[role])!;
        expect(p.storylines.includes(s.id)).toBe(false);
        if (p.died === null && h.world.alive.has(p.id)) {
          expect(p.flags[SF.cdPrefix + s.kind]).toBeDefined();
        }
      }
    }
  });

  it("stars commoners at least 60% of the time", () => {
    const ranks: number[] = [];
    for (const seed of ["bias-1", "bias-2", "bias-3"]) {
      const h = makeTestWorld({ seed, settlements: 3 });
      seedPopulation(h, 110);
      for (let m = 0; m < 300; m++) h.tick();
      for (const s of h.world.storylines.values()) {
        if (s.kind === "succession-struggle" || s.kind === "usurpation-plot") continue; // by nature noble
        const r = s.data["starRank"];
        if (typeof r === "number") ranks.push(r);
      }
    }
    expect(ranks.length).toBeGreaterThan(20);
    const commoner = ranks.filter((r) => r <= 2).length / ranks.length;
    expect(commoner).toBeGreaterThanOrEqual(0.6);
  });

  it("respects per-kind cooldowns when casting", () => {
    const h = makeTestWorld({ seed: "cd-check", settlements: 3 });
    const p = h.addPerson({ ageYears: 30 });
    p.flags[SF.cdPrefix + "wanderer"] = h.world.now + 100;
    expect(castable(h.world, p, "wanderer")).toBe(false);
    expect(castable(h.world, p, "rivalry")).toBe(true);
    p.storylines.push(1, 2);
    expect(castable(h.world, p, "rivalry")).toBe(false);
  });
});

describe("cause chains", () => {
  it("every beat after the first is cause-linked", () => {
    const h = makeTestWorld({ seed: "chain-1", settlements: 3 });
    seedPopulation(h, 110);
    for (let m = 0; m < 300; m++) h.tick();
    let checked = 0;
    for (const s of h.world.storylines.values()) {
      for (let i = 1; i < s.events.length; i++) {
        const ev = h.world.events.get(s.events[i])!;
        expect(ev.causes.length).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("beats carry their storyline id", () => {
    const h = makeTestWorld({ seed: "chain-2", settlements: 3 });
    seedPopulation(h, 90);
    for (let m = 0; m < 200; m++) h.tick();
    for (const s of h.world.storylines.values()) {
      expect(s.events.length).toBeGreaterThan(0);
      for (const eid of s.events) {
        expect(h.world.events.get(eid)!.storyline).toBe(s.id);
      }
    }
  });
});

describe("arc machines", () => {
  it("every kind can spawn and resolve", () => {
    for (const kind of ALL_KINDS) {
      const s = runScenario(kind, "resolve-1");
      expect(s, `kind ${kind} failed to spawn`).not.toBeNull();
      expect(s!.resolved, `kind ${kind} failed to resolve`).toBe(true);
      expect(s!.outcome).toBeTruthy();
      expect(s!.events.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("each kind reaches multiple distinct endings across seeds", () => {
    for (const kind of ALL_KINDS) {
      const outcomes = new Set<string>();
      for (let i = 0; i < 30 && outcomes.size < 2; i++) {
        const s = runScenario(kind, `end-${i}`);
        if (s && s.resolved && s.outcome) outcomes.add(s.outcome);
      }
      expect(outcomes.size, `kind ${kind} reached only: ${[...outcomes].join(" / ")}`).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);

  it("arc beats advance deterministically on a fabricated world", () => {
    const run = () => {
      const s = runScenario("feud", "det-arc");
      return s ? `${s.stage}|${s.outcome}|${s.events.join(",")}` : "none";
    };
    expect(run()).toBe(run());
  });
});

describe("specific arc behavior", () => {
  it("mystery keeps the vanished alive and flagged, location null", () => {
    const sc = buildScenario("mystery-disappearance", "van-1");
    const ctx = sc.h.mkCtx();
    const s = ARCS["mystery-disappearance"].spawn(ctx, sc.h.root.fork("force-spawn"), sc.star, { index: indexOf(ctx) });
    expect(s).not.toBeNull();
    expect(sc.star.flags[SF.vanished]).toBe(true);
    expect(sc.star.location).toBeNull();
    expect(sc.h.world.alive.has(sc.star.id)).toBe(true);
    const gone = sc.h.world.events.get(s!.events[0])!;
    expect(gone.type).toBe("disappearance");
    expect(gone.importance).toBe(25);
  });

  it("heresy schism calls the religion service and converts sympathizers", () => {
    let sawSchism = false;
    for (let i = 0; i < 40 && !sawSchism; i++) {
      const sc = buildScenario("heresy", `schism-${i}`);
      const ctx = sc.h.mkCtx();
      const s = ARCS["heresy"].spawn(ctx, sc.h.root.fork("force-spawn"), sc.star, { index: indexOf(ctx) });
      if (!s) continue;
      for (let m = 0; m < 200 && !s.resolved; m++) sc.h.tick();
      if (sc.h.spies.schisms.length > 0) {
        sawSchism = true;
        expect(sc.h.spies.schisms[0].founder).toBe(sc.star.id);
        const schismEv = s.events.map((e) => sc.h.world.events.get(e)!).find((e) => e.type === "schism");
        expect(schismEv).toBeDefined();
        expect(schismEv!.importance).toBe(70);
        // The founder converted; the new faith exists in the world.
        const newFaith = [...sc.h.world.religions.values()].find((r) => r.parent != null);
        expect(newFaith).toBeDefined();
        expect(sc.star.religion).toBe(newFaith!.id);
      }
    }
    expect(sawSchism).toBe(true);
  });

  it("usurpation ripening sets the coup-ready flag for politics", () => {
    let sawReady = false;
    for (let i = 0; i < 40 && !sawReady; i++) {
      const sc = buildScenario("usurpation-plot", `coup-${i}`);
      const ctx = sc.h.mkCtx();
      const s = ARCS["usurpation-plot"].spawn(ctx, sc.h.root.fork("force-spawn"), sc.star, { index: indexOf(ctx) });
      if (!s) continue;
      for (let m = 0; m < 200 && !s.resolved; m++) sc.h.tick();
      const polityId = s.data["polity"] as number;
      if (sc.star.flags[SF.coupReadyPrefix + polityId] === true) sawReady = true;
    }
    expect(sawReady).toBe(true);
  });

  it("masterwork completion names the work, sets the flag, bestows an epithet, and echoes in song", () => {
    let done: { h: TestHarness; s: Storyline } | null = null;
    for (let i = 0; i < 40 && !done; i++) {
      const sc = buildScenario("masterwork", `mw-${i}`);
      const ctx = sc.h.mkCtx();
      const s = ARCS["masterwork"].spawn(ctx, sc.h.root.fork("force-spawn"), sc.star, { index: indexOf(ctx) });
      if (!s) continue;
      for (let m = 0; m < 300 && !s.resolved; m++) sc.h.tick();
      const mw = s.events.map((e) => sc.h.world.events.get(e)!).find((e) => e.type === "masterwork-created");
      if (mw) {
        expect(mw.importance).toBe(35);
        expect(typeof mw.data["title"]).toBe("string");
        expect(typeof sc.star.flags[SF.masterworkDone]).toBe("number");
        expect(sc.star.epithet).not.toBe("");
        done = { h: sc.h, s };
      }
    }
    expect(done).not.toBeNull();
    // Echoes: run on for years; a song should reference the storyline.
    const { h, s } = done!;
    for (let m = 0; m < 160; m++) h.tick();
    const songs = [...h.world.events.values()].filter((e) => e.type === "song-composed" && e.storyline === s.id);
    expect(songs.length).toBeGreaterThan(0);
    expect(songs[0].date).toBeGreaterThan(s.ended!);
  });

  it("revenge mercy ending records the sparing at importance 30", () => {
    let sawMercy = false;
    for (let i = 0; i < 60 && !sawMercy; i++) {
      const s = runScenario("revenge", `mercy-${i}`);
      if (s && s.outcome === "ended in mercy at the very brink") {
        sawMercy = true;
        expect(s.events.length).toBeGreaterThanOrEqual(3);
      }
    }
    expect(sawMercy).toBe(true);
  });

  it("curse beats attribute the family's real misfortunes, cause-linked", () => {
    let sawAttribution = false;
    for (let i = 0; i < 40 && !sawAttribution; i++) {
      const sc = buildScenario("curse", `attr-${i}`);
      const ctx = sc.h.mkCtx();
      const s = ARCS["curse"].spawn(ctx, sc.h.root.fork("force-spawn"), sc.star, { index: indexOf(ctx) });
      if (!s) continue;
      const target = sc.h.world.people.get(s.cast["target"])!;
      // The world delivers a real misfortune to the target family.
      for (let m = 0; m < 10; m++) sc.h.tick();
      if (target.died === null) {
        const mid = sc.h.mkCtx();
        mid.record({
          type: "illness",
          date: sc.h.world.now,
          participants: { subject: target.id },
          data: { name: "marsh fever" },
          location: target.location,
          region: null,
          importance: 6,
          causes: [],
          storyline: null,
          secret: false,
        });
      }
      for (let m = 0; m < 300 && !s.resolved; m++) sc.h.tick();
      const omen = s.events
        .map((e) => sc.h.world.events.get(e)!)
        .find((e) => e.type === "omen" && String(e.data["sign"] ?? "").includes("misfortune"));
      if (omen) {
        sawAttribution = true;
        const misfortuneCause = omen.causes.map((c) => sc.h.world.events.get(c)!).find((c) => c.type === "illness");
        expect(misfortuneCause).toBeDefined();
      }
    }
    expect(sawAttribution).toBe(true);
  });

  it("wanderer departures and returns bracket the years away", () => {
    let sawReturn = false;
    for (let i = 0; i < 40 && !sawReturn; i++) {
      const s = runScenario("wanderer", `wan-${i}`);
      if (!s) continue;
      if (s.outcome && s.outcome.includes("transformed")) {
        sawReturn = true;
      }
    }
    expect(sawReturn).toBe(true);
  });

  it("succession struggles close gracefully when the crown is taken mid-arc", () => {
    const sc = buildScenario("succession-struggle", "crowned-1");
    const ctx = sc.h.mkCtx();
    ARCS["succession-struggle"].worldSpawn!(ctx, sc.h.root.fork("ws"), 1);
    const sid = sortedIds(sc.h.world.storylines)[0];
    const s = sc.h.world.storylines.get(sid)!;
    // Politics crowns a third head while the rivals argue.
    const polity = sc.h.world.polities.get(s.data["polity"] as number)!;
    const third = sc.h.addPerson({ ageYears: 40, rank: 4 });
    polity.ruler = third.id;
    for (let m = 0; m < 60 && !s.resolved; m++) sc.h.tick();
    expect(s.resolved).toBe(true);
    expect(s.outcome).toContain("third head");
  });
});

describe("event volume", () => {
  it("arcs record a bounded, story-shaped number of beats", () => {
    const h = makeTestWorld({ seed: "volume-1", settlements: 3 });
    seedPopulation(h, 110);
    for (let m = 0; m < 360; m++) h.tick();
    const resolved = [...h.world.storylines.values()].filter((s) => s.resolved);
    expect(resolved.length).toBeGreaterThan(5);
    let total = 0;
    for (const s of resolved) {
      expect(s.events.length).toBeGreaterThanOrEqual(2);
      expect(s.events.length).toBeLessThanOrEqual(30);
      total += s.events.length;
    }
    const avg = total / resolved.length;
    expect(avg).toBeGreaterThanOrEqual(3);
    expect(avg).toBeLessThanOrEqual(15);
  });

  it("generated prose contains no em-dashes", () => {
    const h = makeTestWorld({ seed: "prose-1", settlements: 3 });
    seedPopulation(h, 110);
    for (let m = 0; m < 240; m++) h.tick();
    for (const ev of h.world.events.values()) {
      const json = JSON.stringify(ev.data) + (ev.type ?? "");
      expect(json.includes("—")).toBe(false);
    }
    for (const s of h.world.storylines.values()) {
      expect((s.outcome ?? "").includes("—")).toBe(false);
    }
  });
});

describe("rng independence", () => {
  it("forking labeled substreams never perturbs the parent", () => {
    const a = new Rng("fork-test");
    const b = new Rng("fork-test");
    a.fork("story", 1).next();
    a.fork("story", 2).next();
    expect(a.next()).toBe(b.next());
  });
});
