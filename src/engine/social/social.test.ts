import { describe, expect, it } from "vitest";
import { makeTestWorld, worldDigest } from "./testkit";
import type { TestHarness } from "./testkit";
import {
  F,
  MAX_MEMORIES,
  SAMPLE_RATE,
  beginAffair,
  discoverAffair,
  fightDuel,
  monthSample,
} from "./index";
import { livingIds } from "../core/world";
import type { EventRecord } from "../core/types";

function eventsOfType(h: TestHarness, type: string): EventRecord[] {
  return [...h.world.events.keys()]
    .sort((a, b) => a - b)
    .map((id) => h.world.events.get(id)!)
    .filter((e) => e.type === type);
}

// ---------------------------------------------------------------------------
// Opinion baselines
// ---------------------------------------------------------------------------

describe("opinion baselines", () => {
  it("gives kin bonuses when nothing personal is stored", () => {
    const h = makeTestWorld({ seed: "kin-op" });
    const social = h.services.social;
    // Cross-culture parent and child, to isolate the kin term.
    const mother = h.addPerson({ sex: "f", ageYears: 46, culture: h.cultures[0].id, religion: h.religions[0].id });
    const child = h.addPerson({ sex: "m", ageYears: 22, mother: mother.id, culture: h.cultures[1].id, religion: h.religions[1].id });
    expect(social.getOpinion(h.world, mother.id, child.id)).toBe(40);
    expect(social.getOpinion(h.world, child.id, mother.id)).toBe(40);

    // Siblings through the same mother, cross-culture again.
    const child2 = h.addPerson({ sex: "f", ageYears: 20, mother: mother.id, culture: h.cultures[1].id, religion: h.religions[1].id });
    // Same culture+religion siblings: 30 kin only (siblings share nothing else here).
    expect(social.getOpinion(h.world, child.id, child2.id)).toBe(30 + 5 + 5);

    // Spouses (unrelated, same culture and faith): 35 + 5 + 5.
    const w = h.addPerson({ sex: "f", ageYears: 25 });
    const m = h.addPerson({ sex: "m", ageYears: 27 });
    h.marry(w, m);
    expect(social.getOpinion(h.world, w.id, m.id)).toBe(45);

    // Strangers of the same culture and faith: small affinity only.
    const s1 = h.addPerson({ ageYears: 30 });
    const s2 = h.addPerson({ ageYears: 31 });
    expect(social.getOpinion(h.world, s1.id, s2.id)).toBe(10);

    // Strangers across culture and faith: nothing.
    const s3 = h.addPerson({ ageYears: 30, culture: h.cultures[1].id, religion: h.religions[1].id });
    expect(social.getOpinion(h.world, s1.id, s3.id)).toBe(0);
  });

  it("applies house feud penalties between members", () => {
    const h = makeTestWorld({ seed: "feud-op" });
    const a = h.addPerson({ house: h.houses[0].id, rank: 3 });
    const b = h.addPerson({ house: h.houses[1].id, rank: 3 });
    h.houses[0].feuds.set(h.houses[1].id, 0.5);
    h.houses[1].feuds.set(h.houses[0].id, 0.5);
    // 10 affinity (same culture+faith) - 29 feud.
    expect(h.services.social.getOpinion(h.world, a.id, b.id)).toBe(10 - 29);
    // Same house members get a small warmth.
    const c = h.addPerson({ house: h.houses[0].id, rank: 3 });
    expect(h.services.social.getOpinion(h.world, a.id, c.id)).toBe(10 + 8);
  });

  it("combines stored relations with half-weight kinship", () => {
    const h = makeTestWorld({ seed: "stored-op" });
    const social = h.services.social;
    const mother = h.addPerson({ sex: "f", ageYears: 50 });
    const son = h.addPerson({ sex: "m", ageYears: 24, mother: mother.id });
    social.setRelation(h.world, mother.id, son.id, { kind: "friend", since: h.world.now, opinion: 20 });
    // 20 stored + 20 (half of parent-child 40).
    expect(social.getOpinion(h.world, mother.id, son.id)).toBe(40);
  });

  it("adjustOpinion creates and clamps stored relations", () => {
    const h = makeTestWorld({ seed: "adjust-op" });
    const social = h.services.social;
    const a = h.addPerson({});
    const b = h.addPerson({ culture: h.cultures[1].id, religion: h.religions[1].id });
    social.adjustOpinion(h.world, a.id, b.id, -55);
    const rel = social.getRelation(h.world, a.id, b.id);
    expect(rel).not.toBeNull();
    expect(rel!.kind).toBe("rival");
    expect(rel!.opinion).toBe(-55);
    // Direction is separate: b holds no relation toward a.
    expect(social.getRelation(h.world, b.id, a.id)).toBeNull();
    social.adjustOpinion(h.world, a.id, b.id, -30);
    expect(social.getRelation(h.world, a.id, b.id)!.kind).toBe("nemesis");
    social.adjustOpinion(h.world, a.id, b.id, -100);
    expect(social.getRelation(h.world, a.id, b.id)!.opinion).toBe(-100);
  });

  it("strong negative memories hold a grudge ceiling", () => {
    const h = makeTestWorld({ seed: "grudge-op" });
    const social = h.services.social;
    const a = h.addPerson({});
    const b = h.addPerson({});
    const ctx = h.mkCtx();
    const ev = ctx.record({
      type: "crime-theft",
      date: h.world.now,
      participants: { subject: b.id, victim: a.id },
      data: {},
      location: a.location,
      region: null,
      importance: 10,
      causes: [],
      storyline: null,
      secret: false,
    });
    social.addMemory(h.world, a.id, { event: ev.id, weight: 4, about: b.id, feeling: -0.9 });
    // Ceiling is -12 - 4*4 = -28; even warm adjustments cannot rise past it.
    social.adjustOpinion(h.world, a.id, b.id, 80);
    expect(social.getOpinion(h.world, a.id, b.id)).toBeLessThanOrEqual(-28);
  });
});

// ---------------------------------------------------------------------------
// Memory bounds
// ---------------------------------------------------------------------------

describe("memories", () => {
  it("bounds memories per person and drops the weakest", () => {
    const h = makeTestWorld({ seed: "mem-bound" });
    const social = h.services.social;
    const p = h.addPerson({});
    for (let i = 0; i < 30; i++) {
      social.addMemory(h.world, p.id, {
        event: i + 1,
        weight: 1 + (i % 10) * 0.5,
        about: null,
        feeling: 0.1,
      });
    }
    const list = h.world.memories.get(p.id)!;
    expect(list.length).toBe(MAX_MEMORIES);
    // Everything that survived should outweigh what was dropped: no
    // weight-1 memories can remain (there were six, and six drops).
    const weakest = Math.min(...list.map((m) => m.weight));
    expect(weakest).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// closeKin
// ---------------------------------------------------------------------------

describe("closeKin", () => {
  it("walks the pedigree to the second degree", () => {
    const h = makeTestWorld({ seed: "kin-walk" });
    const social = h.services.social;
    // Grandparents.
    const grandpa = h.addPerson({ sex: "m", ageYears: 70 });
    const grandma = h.addPerson({ sex: "f", ageYears: 68 });
    // Their children: two siblings.
    const auntA = h.addPerson({ sex: "f", ageYears: 45, mother: grandma.id, father: grandpa.id });
    const uncleB = h.addPerson({ sex: "m", ageYears: 43, mother: grandma.id, father: grandpa.id });
    // Cousins: one child each.
    const cousin1 = h.addPerson({ sex: "m", ageYears: 20, mother: auntA.id });
    const cousin2 = h.addPerson({ sex: "f", ageYears: 19, father: uncleB.id });
    // A stranger and a spouse.
    const stranger = h.addPerson({ ageYears: 30 });
    const spouse = h.addPerson({ sex: "f", ageYears: 21 });
    h.marry(cousin1, spouse);

    // Parent/child, grandparent, sibling, uncle, cousin.
    expect(social.closeKin(h.world, auntA.id, grandma.id)).toBe(true);
    expect(social.closeKin(h.world, cousin1.id, grandpa.id)).toBe(true);
    expect(social.closeKin(h.world, auntA.id, uncleB.id)).toBe(true);
    expect(social.closeKin(h.world, cousin1.id, uncleB.id)).toBe(true);
    expect(social.closeKin(h.world, cousin1.id, cousin2.id)).toBe(true);
    expect(social.closeKin(h.world, cousin1.id, cousin1.id)).toBe(true);
    // Marriage is not blood; strangers are strangers.
    expect(social.closeKin(h.world, cousin1.id, spouse.id)).toBe(false);
    expect(social.closeKin(h.world, cousin1.id, stranger.id)).toBe(false);
  });

  it("counts legal-father lines as kin", () => {
    const h = makeTestWorld({ seed: "kin-legal" });
    const social = h.services.social;
    const father = h.addPerson({ sex: "m", ageYears: 50 });
    const sonByBlood = h.addPerson({ sex: "m", ageYears: 25, father: father.id });
    const sonByLaw = h.addPerson({ sex: "m", ageYears: 22, legalFather: father.id });
    expect(social.closeKin(h.world, sonByLaw.id, father.id)).toBe(true);
    expect(social.closeKin(h.world, sonByBlood.id, sonByLaw.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Affairs: begin, discover, cause chain
// ---------------------------------------------------------------------------

describe("affairs", () => {
  function affairSetup(seed: string) {
    const h = makeTestWorld({ seed });
    const w1 = h.addPerson({ sex: "f", ageYears: 26, givenName: "Wife1", personality: { compassion: 0.1, wrath: 0.8 } });
    const m1 = h.addPerson({ sex: "m", ageYears: 28, givenName: "Husb1", personality: { lust: 0.9, honor: -0.5 } });
    const w2 = h.addPerson({ sex: "f", ageYears: 25, givenName: "Wife2", personality: { lust: 0.9, honor: -0.5 } });
    const m2 = h.addPerson({ sex: "m", ageYears: 30, givenName: "Husb2", personality: { compassion: 0.1, wrath: 0.8 } });
    h.marry(w1, m1);
    h.marry(w2, m2);
    return { h, w1, m1, w2, m2 };
  }

  it("begins secret and reveals with a full cause chain on discovery", () => {
    const { h, w1, m1, w2, m2 } = affairSetup("affair-direct");
    const ctx = h.mkCtx();
    const affairEv = beginAffair(ctx, m1, w2);
    expect(affairEv.secret).toBe(true);
    expect(affairEv.importance).toBe(18);
    expect(m1.flags[F.affairEvPrefix + w2.id]).toBe(affairEv.id);
    expect(w2.flags[F.affairEvPrefix + m1.id]).toBe(affairEv.id);
    const rel = h.services.social.getRelation(h.world, m1.id, w2.id);
    expect(rel?.kind).toBe("lover");

    const discEv = discoverAffair(ctx, m1, w2, affairEv.id);
    // The secret is out.
    expect(h.world.events.get(affairEv.id)!.secret).toBe(false);
    expect(h.world.events.get(affairEv.id)!.revealed).toBe(h.world.now);
    // Cause chain: discovery caused by the affair; backlink filled in.
    expect(discEv.causes).toEqual([affairEv.id]);
    expect(h.world.events.get(affairEv.id)!.consequences).toContain(discEv.id);
    expect(discEv.importance).toBe(22);
    // Both betrayed spouses appear as participants.
    const roles = Object.values(discEv.participants);
    expect(roles).toContain(w1.id);
    expect(roles).toContain(m2.id);
    // Betrayed spouses now despise the unfaithful.
    expect(h.services.social.getOpinion(h.world, w1.id, m1.id)).toBeLessThanOrEqual(-28);
    expect(h.services.social.getOpinion(h.world, m2.id, w2.id)).toBeLessThanOrEqual(-28);
    // Divorce is pending (low compassion, high wrath: no forgiveness).
    expect(w1.flags[F.divorcePending]).toBe(m1.id);
    expect(m2.flags[F.divorcePending]).toBe(w2.id);
    // Affair flags cleared.
    expect(m1.flags[F.affairEvPrefix + w2.id]).toBeUndefined();
  });

  it("bumps house feuds when nobles are betrayed", () => {
    const h = makeTestWorld({ seed: "affair-feud" });
    const w1 = h.addPerson({ sex: "f", ageYears: 26, rank: 4, house: h.houses[0].id, personality: { compassion: 0.1, wrath: 0.8 } });
    const m1 = h.addPerson({ sex: "m", ageYears: 28, rank: 4, house: h.houses[0].id, personality: { lust: 0.9, honor: -0.5 } });
    const w2 = h.addPerson({ sex: "f", ageYears: 25, rank: 4, house: h.houses[1].id, personality: { lust: 0.9, honor: -0.5 } });
    h.marry(w1, m1);
    const ctx = h.mkCtx();
    const affairEv = beginAffair(ctx, m1, w2);
    const discEv = discoverAffair(ctx, m1, w2, affairEv.id);
    // Wife's house feuds with the paramour's house.
    expect(h.houses[0].feuds.get(h.houses[1].id) ?? 0).toBeGreaterThan(0.1);
    const began = eventsOfType(h, "feud-began");
    expect(began.length).toBe(1);
    expect(began[0].causes).toContain(discEv.id);
  });

  it("comes to light through the monthly hazard", () => {
    const { h, m1, w2 } = affairSetup("affair-hazard");
    const ctx = h.mkCtx();
    beginAffair(ctx, m1, w2);
    let discovered: EventRecord[] = [];
    for (let i = 0; i < 400 && discovered.length === 0; i++) {
      h.tick();
      discovered = eventsOfType(h, "affair-discovered");
      // Once the flags are gone without discovery, it fizzled instead.
      if (
        discovered.length === 0 &&
        m1.flags[F.affairEvPrefix + w2.id] === undefined
      ) {
        break;
      }
    }
    // With this seed the affair is found out (verified fixture).
    expect(discovered.length).toBe(1);
    expect(discovered[0].causes.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Duels
// ---------------------------------------------------------------------------

describe("duels", () => {
  it("routes duel deaths through people.kill with the duel as cause", () => {
    // Deterministically scan seeds until a lethal duel occurs.
    let found = false;
    for (let s = 0; s < 60 && !found; s++) {
      const h = makeTestWorld({ seed: `duel-${s}`, violence: 0.9 });
      const a = h.addPerson({
        sex: "m",
        ageYears: 28,
        profession: "soldier",
        aptitudes: { war: 3 },
        personality: { wrath: 0.95, compassion: 0, courage: 0.8 },
      });
      const b = h.addPerson({
        sex: "m",
        ageYears: 27,
        profession: "farmer",
        personality: { courage: -0.4 },
      });
      const ctx = h.mkCtx();
      const ev = fightDuel(ctx, a, b, "the wager unpaid", []);
      expect(["yield", "wound", "death"]).toContain(ev.data.outcome);
      expect(ev.participants.victor).toBeDefined();
      if (ev.data.outcome === "death") {
        found = true;
        expect(h.spies.kills.length).toBe(1);
        const kill = h.spies.kills[0];
        expect(kill.event).toBe(ev.id);
        expect(kill.cause).toBe("slain in a duel");
        expect(kill.id).toBe(ev.participants.slain);
        expect(kill.killer).toBe(ev.participants.victor);
        // The victor carries the mark of it.
        const victor = h.world.people.get(ev.participants.victor)!;
        expect(victor.flags[F.duelVictor]).toBe(1);
        // Death event chains back to the duel.
        const deaths = eventsOfType(h, "death");
        expect(deaths.length).toBe(1);
        expect(deaths[0].causes).toContain(ev.id);
        expect(ev.importance).toBe(30);
      }
    }
    expect(found).toBe(true);
  });

  it("sets the victor flag and importance for non-lethal outcomes", () => {
    let sawWound = false;
    let sawYield = false;
    for (let s = 0; s < 80 && !(sawWound && sawYield); s++) {
      const h = makeTestWorld({ seed: `duel-soft-${s}`, violence: 0.2 });
      const a = h.addPerson({ sex: "m", ageYears: 25, personality: { wrath: 0, compassion: 0.9 } });
      const b = h.addPerson({ sex: "m", ageYears: 26, personality: { wrath: 0, compassion: 0.9 } });
      const ev = fightDuel(h.mkCtx(), a, b, "an old grievance", []);
      if (ev.data.outcome === "wound") {
        sawWound = true;
        expect(ev.importance).toBe(25);
        const loserId = ev.participants.victor === a.id ? b.id : a.id;
        expect(h.world.people.get(loserId)!.injuries.length).toBe(1);
      }
      if (ev.data.outcome === "yield") {
        sawYield = true;
        expect(ev.importance).toBe(20);
      }
      const victor = h.world.people.get(ev.participants.victor)!;
      expect(victor.flags[F.duelVictor]).toBe(1);
    }
    expect(sawWound && sawYield).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rivalry escalation (integration)
// ---------------------------------------------------------------------------

describe("escalation", () => {
  it("walks insult, quarrel, then blood, with cause links", () => {
    const h = makeTestWorld({ seed: "esc-1", violence: 0.9 });
    const a = h.addPerson({
      sex: "m",
      ageYears: 30,
      profession: "smith",
      personality: { wrath: 0.9, volatility: 0.8, agreeableness: -0.6, ambition: 0.9, compassion: 0 },
    });
    const b = h.addPerson({
      sex: "m",
      ageYears: 31,
      profession: "smith",
      personality: { wrath: 0.9, volatility: 0.8, agreeableness: -0.6, ambition: 0.9, compassion: 0 },
    });
    h.services.social.setRelation(h.world, a.id, b.id, { kind: "rival", since: h.world.now, opinion: -40 });
    h.services.social.setRelation(h.world, b.id, a.id, { kind: "rival", since: h.world.now, opinion: -40 });

    for (let i = 0; i < 240; i++) {
      h.tick();
      if (
        eventsOfType(h, "brawl").length + eventsOfType(h, "duel").length > 0 ||
        h.world.alive.size < 2
      ) {
        break;
      }
    }
    const insults = eventsOfType(h, "insult");
    const quarrels = eventsOfType(h, "quarrel");
    const blood = [...eventsOfType(h, "brawl"), ...eventsOfType(h, "duel")];
    expect(insults.length).toBeGreaterThan(0);
    expect(quarrels.length).toBeGreaterThan(0);
    expect(blood.length).toBeGreaterThan(0);
    // The chain holds: quarrel cites an insult, blood cites a quarrel.
    const citedByQuarrel = quarrels.some((q) =>
      q.causes.some((c) => insults.some((i) => i.id === c)),
    );
    const citedByBlood = blood.some((bl) =>
      bl.causes.some((c) => quarrels.some((q) => q.id === c)),
    );
    expect(citedByQuarrel).toBe(true);
    expect(citedByBlood).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Social fabric (integration): friendships and romances form
// ---------------------------------------------------------------------------

describe("social fabric", () => {
  function village(seed: string, n: number): TestHarness {
    const h = makeTestWorld({ seed, settlements: 1 });
    for (let i = 0; i < n; i++) {
      h.addPerson({ ageYears: 18 + (i % 20) });
    }
    return h;
  }

  it("knits friendships and romances over a few years", () => {
    const h = village("fabric-1", 40);
    for (let i = 0; i < 60; i++) h.tick();
    expect(eventsOfType(h, "friendship-formed").length).toBeGreaterThan(0);
    expect(eventsOfType(h, "romance-began").length).toBeGreaterThan(0);
  });

  it("keeps event volume disciplined", () => {
    const h = village("fabric-volume", 60);
    const years = 30;
    for (let i = 0; i < years * 12; i++) h.tick();
    const perPersonYear = h.world.events.size / 60 / years;
    // Roughly 15-40 lifetime events for a commoner; the social share
    // must stay well under one event per person-year on average.
    expect(perPersonYear).toBeLessThan(1.0);
    expect(perPersonYear).toBeGreaterThan(0.02);
  });

  it("swears oaths between long friends", () => {
    const h = makeTestWorld({ seed: "oath-1" });
    const a = h.addPerson({ ageYears: 30, sex: "m", personality: { honor: 0.8, sociability: 0.6 } });
    const b = h.addPerson({ ageYears: 31, sex: "m", personality: { honor: 0.8, sociability: 0.6 } });
    // A friendship of ten years' standing, deep on both sides.
    h.services.social.setRelation(h.world, a.id, b.id, { kind: "friend", since: h.world.now - 120, opinion: 60 });
    h.services.social.setRelation(h.world, b.id, a.id, { kind: "friend", since: h.world.now - 120, opinion: 60 });
    for (let i = 0; i < 240 && eventsOfType(h, "oath-sworn").length === 0; i++) h.tick();
    const oaths = eventsOfType(h, "oath-sworn");
    expect(oaths.length).toBeGreaterThan(0);
    expect(oaths[0].importance).toBe(8);
    expect(h.services.social.getRelation(h.world, a.id, b.id)!.kind).toBe("sworn");
    expect(h.services.social.getRelation(h.world, b.id, a.id)!.kind).toBe("sworn");
  });
});

// ---------------------------------------------------------------------------
// Bounded monthly work
// ---------------------------------------------------------------------------

describe("bounded work", () => {
  it("samples roughly a sixth of living adults each month", () => {
    const h = makeTestWorld({ seed: "bounded-1" });
    for (let i = 0; i < 120; i++) h.addPerson({ ageYears: 20 + (i % 30) });
    // Children never enter the sample.
    for (let i = 0; i < 30; i++) h.addPerson({ ageYears: 5 });
    const ctx = h.mkCtx();
    let total = 0;
    const months = 24;
    for (let m = 0; m < months; m++) {
      h.world.now += 1;
      const sample = monthSample(h.mkCtx(), livingIds(h.world));
      total += sample.length;
      // Never anywhere near the whole population in one month.
      expect(sample.length).toBeLessThan(120 * 0.45);
      for (const id of sample) {
        expect(h.services.people.age(h.world, h.world.people.get(id)!)).toBeGreaterThanOrEqual(16);
      }
    }
    const mean = total / months;
    expect(mean).toBeGreaterThan(120 * SAMPLE_RATE * 0.5);
    expect(mean).toBeLessThan(120 * SAMPLE_RATE * 1.6);
    void ctx;
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("determinism", () => {
  function run(seed: string): string {
    const h = makeTestWorld({ seed, violence: 0.7 });
    for (let i = 0; i < 46; i++) {
      h.addPerson({ ageYears: 16 + (i % 34), house: i % 7 === 0 ? h.houses[i % 2].id : null, rank: i % 7 === 0 ? 3 : 1 });
    }
    // A married pair and a soured marriage to give affairs a road in.
    const w = h.addPerson({ sex: "f", ageYears: 24, personality: { lust: 0.9, honor: -0.4 } });
    const m = h.addPerson({ sex: "m", ageYears: 26 });
    h.marry(w, m);
    h.services.social.adjustOpinion(h.world, w.id, m.id, -40);
    for (let i = 0; i < 240; i++) h.tick();
    return worldDigest(h.world);
  }

  it("same seed, same history, byte for byte", () => {
    const a = run("determinism-seed");
    const b = run("determinism-seed");
    expect(a).toBe(b);
  });

  it("different seeds diverge", () => {
    const a = run("determinism-seed");
    const b = run("determinism-other");
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Yearly settling: memory decay, relation drift, feud cooling
// ---------------------------------------------------------------------------

describe("yearly settling", () => {
  it("fades memories, holds grudges, cools feuds", () => {
    const h = makeTestWorld({ seed: "settle-1", startYear: 80 });
    const a = h.addPerson({});
    const b = h.addPerson({});
    const ctx = h.mkCtx();
    const ev = ctx.record({
      type: "insult",
      date: h.world.now,
      participants: { subject: b.id, target: a.id },
      data: { slight: "a mocking bow in the middle of the market" },
      location: a.location,
      region: null,
      importance: 3,
      causes: [],
      storyline: null,
      secret: false,
    });
    h.services.social.addMemory(h.world, a.id, { event: ev.id, weight: 1, about: b.id, feeling: 0.2 });
    h.services.social.addMemory(h.world, a.id, { event: ev.id, weight: 4, about: b.id, feeling: -0.9 });
    h.houses[0].feuds.set(h.houses[1].id, 0.6);
    h.houses[1].feuds.set(h.houses[0].id, 0.6);

    // Run through several Decembers.
    for (let i = 0; i < 12 * 6; i++) h.tick();

    const mems = h.world.memories.get(a.id)!;
    // The light memory fades toward oblivion faster than the grudge.
    const grudge = mems.find((m) => m.feeling < 0)!;
    expect(grudge.weight).toBeGreaterThan(2.5);
    const light = mems.find((m) => m.feeling > 0);
    if (light) expect(light.weight).toBeLessThan(0.6);
    // The feud has cooled measurably but not vanished.
    const feud = h.houses[0].feuds.get(h.houses[1].id) ?? 0;
    expect(feud).toBeLessThan(0.6);
    expect(feud).toBeGreaterThan(0.2);
  });
});
