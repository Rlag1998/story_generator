/**
 * Politics module tests: worldgen founding, succession-law coherence, war
 * campaigns and casualty determinism (with the mocked people.kill), plots,
 * honors, and whole-module determinism.
 */

import { describe, expect, it } from "vitest";
import { Rng } from "../core/rng";
import { sortedIds } from "../core/world";
import { PF, polState } from "./helpers";
import { chooseSuccessionLaw } from "./found";
import { declareWar } from "./war";
import {
  enthrone,
  makeCulture,
  makeDynastyWorld,
  makePoliticalWorld,
  politicsDigest,
  spawn,
} from "./testkit";

describe("found()", () => {
  it("assigns every settlement a polity and wires realms completely", () => {
    const h = makePoliticalWorld({ seed: "found-1", cultures: 2, regionsPerCulture: 3 });
    const world = h.world;
    expect(world.polities.size).toBeGreaterThanOrEqual(2);

    for (const sid of sortedIds(world.settlements)) {
      expect(world.settlements.get(sid)!.polity).not.toBe(0);
      expect(world.polities.has(world.settlements.get(sid)!.polity)).toBe(true);
    }

    for (const pid of sortedIds(world.polities)) {
      const polity = world.polities.get(pid)!;
      // Ruler seated, ranked, titled, reign opened.
      expect(polity.ruler).not.toBeNull();
      const ruler = world.people.get(polity.ruler!)!;
      expect(ruler.status.rank).toBe(5);
      expect(ruler.status.profession).toBe("ruler");
      expect(ruler.status.titles.some((t) => t.includes(polity.name))).toBe(true);
      expect(polity.reigns).toEqual([{ ruler: ruler.id, from: world.now, to: null }]);
      expect(polity.rulerTitleM.length).toBeGreaterThan(0);
      expect(polity.rulerTitleF.length).toBeGreaterThan(0);
      // Ruling house exists, headed by the ruler.
      expect(polity.rulingHouse).not.toBeNull();
      const ruling = world.houses.get(polity.rulingHouse!)!;
      expect(ruling.head).toBe(ruler.id);
      expect(ruling.founder).toBe(ruler.id);
      expect(ruler.house).toBe(ruling.id);
      // Court of two to four seated, living officers, marshal always.
      expect(polity.court.size).toBeGreaterThanOrEqual(2);
      expect(polity.court.size).toBeLessThanOrEqual(4);
      expect(polity.court.has("marshal")).toBe(true);
      for (const role of [...polity.court.keys()].sort()) {
        const officer = world.people.get(polity.court.get(role)!);
        expect(officer).toBeDefined();
        expect(officer!.died).toBeNull();
      }
      // Capital inside the borders.
      const capital = world.settlements.get(polity.capital)!;
      expect(polity.regions).toContain(capital.region);
    }

    // Houses: 3-5 per polity (ruling + 2-4 noble), unique banners, mottoes.
    const banners = new Set<string>();
    let housesTotal = 0;
    for (const hid of sortedIds(world.houses)) {
      const house = world.houses.get(hid)!;
      housesTotal++;
      expect(house.motto.length).toBeGreaterThan(0);
      expect(house.name.length).toBeGreaterThan(0);
      expect(house.seat).not.toBeNull();
      expect(house.bannerSeed).toContain(world.params.seed);
      banners.add(house.bannerSeed);
      // The head belongs to the house they head.
      const head = world.people.get(house.head!)!;
      expect(head.house).toBe(house.id);
    }
    expect(banners.size).toBe(housesTotal);
    expect(housesTotal).toBeGreaterThanOrEqual(world.polities.size * 3);
    expect(housesTotal).toBeLessThanOrEqual(world.polities.size * 5);

    // Opening stances are symmetric and complete.
    const pids = sortedIds(world.polities);
    for (const a of pids) {
      for (const b of pids) {
        if (a === b) continue;
        const pa = world.polities.get(a)!;
        const pb = world.polities.get(b)!;
        expect(pa.relations.get(b)?.stance).toBeDefined();
        expect(pa.relations.get(b)?.stance).toBe(pb.relations.get(a)?.stance);
      }
    }

    // No events written during founding: it is the unrecorded past.
    expect(world.events.size).toBe(0);
  });

  it("founds pedigreed dynasties: rulers with wired adult heirs", () => {
    const h = makePoliticalWorld({ seed: "found-2", cultures: 2 });
    const world = h.world;
    let wiredHeirs = 0;
    for (const pid of sortedIds(world.polities)) {
      const ruler = world.people.get(world.polities.get(pid)!.ruler!)!;
      for (const cid of ruler.children) {
        const child = world.people.get(cid)!;
        expect(child.father === ruler.id || child.mother === ruler.id).toBe(true);
        wiredHeirs++;
      }
    }
    expect(wiredHeirs).toBeGreaterThan(0);
  });

  it("chooses succession laws coherent with culture and kind", () => {
    const rng = new Rng("law-test");
    const patriarchal = makeCulture(1, 1, { patriarchy: 0.9 });
    const egalitarian = makeCulture(2, 1, { patriarchy: 0.1 });
    const matrilineal = makeCulture(3, 1, { descent: "matrilineal", patriarchy: 0.5 });
    const electiveFolk = makeCulture(4, 1, { inheritance: "elective" });
    expect(chooseSuccessionLaw(rng.fork(1), "kingdom", patriarchal)).toBe("male-primogeniture");
    expect(chooseSuccessionLaw(rng.fork(2), "kingdom", egalitarian)).toBe("absolute-primogeniture");
    expect(chooseSuccessionLaw(rng.fork(3), "principality", matrilineal)).toBe("female-primogeniture");
    expect(chooseSuccessionLaw(rng.fork(4), "city-league", patriarchal)).toBe("elective-council");
    expect(chooseSuccessionLaw(rng.fork(5), "theocracy", egalitarian)).toBe("divine-lot");
    expect(chooseSuccessionLaw(rng.fork(6), "kingdom", electiveFolk)).toBe("elective-council");
  });
});

describe("war", () => {
  function runWar(seed: string) {
    const h = makePoliticalWorld({
      seed,
      cultures: 2,
      regionsPerCulture: 2,
      soldiersPerSettlement: 5,
      commonersPerSettlement: 3,
    });
    const pids = sortedIds(h.world.polities);
    const attacker = h.world.polities.get(pids[0])!;
    const defender = h.world.polities.get(pids[pids.length - 1])!;
    declareWar(h.mkCtx(), attacker, defender, "the marches burn");
    let months = 0;
    while (polState(h.world).wars.length > 0 && months < 240) {
      h.tick();
      months++;
    }
    return { h, attacker, defender, months };
  }

  it("fights named battles, kills named people, and makes peace", () => {
    const { h, attacker, defender, months } = runWar("war-1");
    const events = [...h.world.events.values()];

    const battles = events.filter((e) => e.type === "battle" || e.type === "siege");
    expect(battles.length).toBeGreaterThanOrEqual(2);
    for (const b of battles) {
      expect(String(b.data.name)).toMatch(/^(Battle|Siege) of /);
      expect(b.data.attacker).toBe(attacker.id);
      expect(b.data.defender).toBe(defender.id);
      expect(["attacker", "defender", "draw"]).toContain(b.data.outcome);
      expect(Array.isArray(b.data.fallen)).toBe(true);
      expect(b.importance).toBeGreaterThanOrEqual(35);
    }

    // Casualties flowed through people.kill with the battle as cause.
    const battleIds = new Set(battles.map((b) => b.id));
    const fallenKills = h.spies.kills.filter((k) => k.event !== null && battleIds.has(k.event));
    expect(fallenKills.length).toBeGreaterThan(0);
    for (const k of fallenKills) {
      expect(k.cause).toMatch(/^fell in the (Battle|Siege) of /);
    }

    // The war ends, in ink.
    expect(months).toBeLessThan(240);
    const peace = events.find((e) => e.type === "peace-made");
    expect(peace).toBeDefined();
    expect(peace!.importance).toBe(40);
    expect(["conquest", "tribute", "white-peace"]).toContain(peace!.data.outcome);
    // Peace leaves a bitter stance, not a warm one.
    expect(attacker.relations.get(defender.id)!.stance).toBe("rivalry");
    // Conquest moves the map.
    if (peace!.data.outcome === "conquest") {
      const rid = peace!.data.regionTaken as number;
      const victorIsAttacker = attacker.regions.includes(rid);
      const victor = victorIsAttacker ? attacker : defender;
      expect(victor.regions).toContain(rid);
      for (const sid of h.world.regions.get(rid)!.settlements) {
        expect(h.world.settlements.get(sid)!.polity).toBe(victor.id);
      }
    }
  });

  it("war casualties are deterministic (mocked people.kill)", () => {
    const a = runWar("war-det");
    const b = runWar("war-det");
    expect(a.h.spies.kills).toEqual(b.h.spies.kills);
    expect(politicsDigest(a.h.world)).toBe(politicsDigest(b.h.world));
  });
});

describe("plots", () => {
  it("marks ambitious kin in the line as claimants over time", () => {
    const h = makeDynastyWorld({ law: "male-primogeniture", seed: "claimants" });
    const w = h.world;
    const king = spawn(w, { sex: "m", ageYears: 55, house: h.house.id });
    const sons = [0, 1, 2].map((i) =>
      spawn(w, { sex: "m", ageYears: 30 - i * 3, house: h.house.id, father: king.id, ambition: 0.9 }),
    );
    enthrone(h, king);
    for (let i = 0; i < 600; i++) h.tick();
    // The first in line is safe in his expectations; the hungry ones behind
    // him are another matter.
    const flagged = sons.filter((s) => s.flags[PF.claimant] === h.polity.id);
    expect(flagged.length).toBeGreaterThanOrEqual(1);
    expect(sons[0].flags[PF.claimant]).toBeUndefined();
  });

  it("spends story.coup-ready flags: the ruler falls, reigns stay true", () => {
    const h = makeDynastyWorld({ law: "male-primogeniture", seed: "coup" });
    const w = h.world;
    const king = spawn(w, { sex: "m", ageYears: 50, house: h.house.id });
    const heir = spawn(w, { sex: "m", ageYears: 25, house: h.house.id, father: king.id });
    const plotter = spawn(w, { sex: "m", ageYears: 34, house: h.house.id, rank: 4, ambition: 0.95 });
    enthrone(h, king);
    plotter.flags[`${PF.coupReadyPrefix}${h.polity.id}`] = true;

    h.tick();

    // The flag is spent and the old king no longer reigns.
    expect(plotter.flags[`${PF.coupReadyPrefix}${h.polity.id}`]).toBeUndefined();
    expect(h.polity.ruler).not.toBe(king.id);
    const events = [...w.events.values()];
    const deed = events.find((e) => e.type === "assassination" || e.type === "coup");
    expect(deed).toBeDefined();
    if (deed!.type === "assassination") {
      expect(deed!.secret).toBe(true);
      expect(deed!.importance).toBe(60);
      expect(king.died).not.toBeNull();
      expect(h.polity.ruler).toBe(heir.id); // succession ran inside kill()
    } else {
      expect(deed!.secret).toBe(false);
      expect(deed!.importance).toBe(55);
      expect(h.polity.ruler).toBe(plotter.id);
      expect(king.flags[PF.deposed]).toBe(h.polity.id);
    }
    // The reign ledger stays coherent: one open reign, held by the ruler.
    const open = h.polity.reigns.filter((r) => r.to === null);
    expect(open.length).toBe(1);
    expect(open[0].ruler).toBe(h.polity.ruler);
  });
});

describe("honors", () => {
  it("raises flagged war heroes with a title-granted event", () => {
    const h = makeDynastyWorld({ seed: "honors" });
    const w = h.world;
    const king = spawn(w, { sex: "m", ageYears: 45, house: h.house.id });
    enthrone(h, king);
    const hero = spawn(w, { sex: "m", ageYears: 24, rank: 1, location: h.settlement.id });
    hero.status.profession = "soldier";
    hero.flags[PF.warHero] = true;

    let granted = null;
    for (let i = 0; i < 240 && !granted; i++) {
      h.tick();
      granted = [...w.events.values()].find((e) => e.type === "title-granted") ?? null;
    }
    expect(granted).not.toBeNull();
    expect(granted!.participants.subject).toBe(hero.id);
    // Granter is referenced in data, not participants, so routine grants
    // don't flood the ruler's own chronicle.
    expect(granted!.data.granter).toBe(king.id);
    expect(granted!.importance).toBe(15);
    expect(hero.status.rank).toBe(2);
    expect(hero.status.titles.length).toBe(1);
    expect(hero.flags[PF.warHero]).toBeUndefined();
  });
});

describe("the long peace (and its interruptions)", () => {
  it("a fifty-year run stays deterministic and politically alive", () => {
    const run = (seed: string) => {
      const h = makePoliticalWorld({
        seed,
        cultures: 2,
        regionsPerCulture: 2,
        soldiersPerSettlement: 4,
      });
      for (let i = 0; i < 600; i++) h.tick();
      return h;
    };
    const a = run("long-run");
    const b = run("long-run");
    expect(politicsDigest(a.world)).toBe(politicsDigest(b.world));

    // Politics stays quiet most months: low event volume by design.
    const events = [...a.world.events.values()];
    expect(events.length).toBeLessThan(600); // well under one event per month
    // But the decades are not empty of drama.
    const types = new Set(events.map((e) => e.type));
    expect(types.has("war-declared") || types.has("betrothal")).toBe(true);

    // Different seeds diverge.
    const c = run("long-run-other");
    expect(politicsDigest(c.world)).not.toBe(politicsDigest(a.world));
  });
});
