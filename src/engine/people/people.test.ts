import { describe, expect, it } from "vitest";
import { Rng } from "../core/rng";
import type { EventRecord, Person, PersonId } from "../core/types";
import { baseMortalityMonthly } from "./hazard";
import {
  BIRTH_SPACING_MONTHS,
  capDamping,
  computeConceptionChance,
  conceptionAgeFactor,
} from "./fertility";
import { illnessName } from "./health";
import { F } from "./helpers";
import { makeTestWorld, worldDigest } from "./testkit";

function eventsOfType(harness: { world: { events: Map<number, EventRecord> } }, type: string): EventRecord[] {
  return [...harness.world.events.values()].filter((e) => e.type === type);
}

function participantEvents(harness: { world: { events: Map<number, EventRecord> } }, id: PersonId): EventRecord[] {
  return [...harness.world.events.values()].filter((e) =>
    Object.values(e.participants).includes(id),
  );
}

// ---------------------------------------------------------------------------
// Hazard curve
// ---------------------------------------------------------------------------

describe("mortality hazard", () => {
  it("rises monotonically through late life (Gompertz-ish)", () => {
    for (let age = 36; age < 94; age++) {
      expect(baseMortalityMonthly(age + 1)).toBeGreaterThan(baseMortalityMonthly(age));
    }
  });

  it("keeps infants more fragile than children, children safer than elders", () => {
    expect(baseMortalityMonthly(0)).toBeGreaterThan(baseMortalityMonthly(7));
    expect(baseMortalityMonthly(1.5)).toBeGreaterThan(baseMortalityMonthly(7));
    expect(baseMortalityMonthly(70)).toBeGreaterThan(baseMortalityMonthly(30));
  });

  it("lets roughly 70-80% survive to adulthood in good times", () => {
    let survival = 1;
    for (let m = 0; m < 16 * 12; m++) survival *= 1 - baseMortalityMonthly(m / 12);
    expect(survival).toBeGreaterThan(0.68);
    expect(survival).toBeLessThan(0.85);
  });
});

// ---------------------------------------------------------------------------
// Fertility
// ---------------------------------------------------------------------------

describe("conception", () => {
  it("age curve is zero outside the fertile window and peaks in the twenties", () => {
    expect(conceptionAgeFactor(12)).toBe(0);
    expect(conceptionAgeFactor(15)).toBe(0);
    expect(conceptionAgeFactor(48)).toBe(0);
    expect(conceptionAgeFactor(24)).toBe(1);
    expect(conceptionAgeFactor(24)).toBeGreaterThan(conceptionAgeFactor(18));
    expect(conceptionAgeFactor(24)).toBeGreaterThan(conceptionAgeFactor(38));
    expect(conceptionAgeFactor(38)).toBeGreaterThan(conceptionAgeFactor(43));
  });

  it("respects birth spacing and pregnancy", () => {
    const h = makeTestWorld({ seed: "spacing", couples: 1 });
    const [wife, husband] = h.founders;
    const now = h.world.now;
    const base = computeConceptionChance(10, 400, wife, husband, 24, 26, null, now, {
      kind: "spouse",
    });
    expect(base).toBeGreaterThan(0);
    // A recent delivery bars conception...
    const recent = computeConceptionChance(
      10, 400, wife, husband, 24, 26, now - 3, now, { kind: "spouse" },
    );
    expect(recent).toBe(0);
    // ...until the spacing window has passed.
    const later = computeConceptionChance(
      10, 400, wife, husband, 24, 26, now - BIRTH_SPACING_MONTHS, now, { kind: "spouse" },
    );
    expect(later).toBeGreaterThan(0);
    // Pregnant women do not conceive again.
    wife.pregnancy = { father: husband.id, conceived: now, due: now + 9, litter: 1, illicit: false };
    expect(
      computeConceptionChance(10, 400, wife, husband, 24, 26, null, now, { kind: "spouse" }),
    ).toBe(0);
    wife.pregnancy = null;
  });

  it("dampens toward the population cap and stops at it", () => {
    expect(capDamping(0, 100)).toBe(1);
    expect(capDamping(50, 100)).toBe(1);
    let prev = 2;
    for (const alive of [70, 80, 90, 95, 100]) {
      const d = capDamping(alive, 100);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
    expect(capDamping(100, 100)).toBe(0);
    expect(capDamping(120, 100)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Founders
// ---------------------------------------------------------------------------

describe("createFounder", () => {
  it("records no events and names per culture convention", () => {
    const h = makeTestWorld({ seed: "founders", couples: 3 });
    expect(h.world.events.size).toBe(0);
    for (const p of h.founders) {
      expect(p.givenName.length).toBeGreaterThan(1);
      expect(p.surname.length).toBeGreaterThan(1); // given-family default
      expect(h.world.alive.has(p.id)).toBe(true);
      expect(p.status.profession).not.toBe("none"); // working-age adults
    }
  });

  it("uses patronymics from an invented father-name when the culture asks", () => {
    const h = makeTestWorld({ seed: "patro", couples: 2, nameOrder: "given-patronymic" });
    for (const p of h.founders) {
      expect(p.surname.endsWith(p.sex === "f" ? "sdota" : "sson")).toBe(true);
    }
  });

  it("gives no surname under given-only naming", () => {
    const h = makeTestWorld({ seed: "given-only", couples: 2, nameOrder: "given-only" });
    for (const p of h.founders) expect(p.surname).toBe("");
  });

  it("back-computes the birthdate from the requested age", () => {
    const h = makeTestWorld({ seed: "ages", couples: 2 });
    const p = h.services.people.createFounder(h.root.fork("x"), h.world, h.services, {
      culture: h.culture.id,
      religion: h.religion.id,
      location: h.settlements[0].id,
      house: null,
      sex: "m",
      ageYears: 33,
    });
    expect(h.services.people.age(h.world, p)).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// Children, litters, legitimacy
// ---------------------------------------------------------------------------

describe("createChild and litters", () => {
  it("records a birth with litter data and registers the child", () => {
    const h = makeTestWorld({ seed: "birth", couples: 1 });
    const [wife, husband] = h.founders;
    const child = h.services.people.createChild(
      h.root.fork("kid"), h.world, h.services, wife, husband,
    );
    expect(h.world.alive.has(child.id)).toBe(true);
    expect(child.mother).toBe(wife.id);
    expect(child.father).toBe(husband.id);
    expect(child.legalFather).toBeNull(); // father IS the husband
    expect(wife.children).toContain(child.id);
    expect(husband.children).toContain(child.id);
    const births = eventsOfType(h, "birth");
    expect(births).toHaveLength(1);
    expect(births[0].data.litter).toBe(1);
    expect(births[0].data.litterIndex).toBe(0);
    expect(births[0].importance).toBeGreaterThanOrEqual(8);
    expect(births[0].importance).toBeLessThanOrEqual(16);
    expect(births[0].secret).toBe(false);
  });

  it("delivers twins with cross-linked litterMates and one twin-birth event", () => {
    const h = makeTestWorld({ seed: "twins-3", couples: 1 });
    const [wife, husband] = h.founders;
    h.controls.forcedLitter = 2;
    wife.pregnancy = {
      father: husband.id,
      conceived: h.world.now - 8,
      due: h.world.now + 1,
      litter: 2,
      illicit: false,
    };
    h.tick(); // reaches the due date and delivers
    const births = eventsOfType(h, "birth");
    expect(births).toHaveLength(2);
    expect(births.map((b) => b.data.litterIndex).sort()).toEqual([0, 1]);
    for (const b of births) expect(b.data.litter).toBe(2);
    const twins = eventsOfType(h, "twin-birth");
    expect(twins).toHaveLength(1);
    expect(twins[0].importance).toBe(15);
    expect(twins[0].causes).toEqual(births.map((b) => b.id));
    const ids = births.map((b) => b.participants.subject);
    const a = h.world.people.get(ids[0])!;
    const b = h.world.people.get(ids[1])!;
    expect(a.litterMates).toEqual([b.id]);
    expect(b.litterMates).toEqual([a.id]);
    expect(wife.pregnancy).toBeNull();
    expect(wife.flags[F.lastBirth]).toBe(h.world.now);
  });

  it("marks a married woman's child by her lover as secret, husband as legal father", () => {
    const h = makeTestWorld({ seed: "cuckoo", couples: 2 });
    const [wife, husband] = h.founders;
    const lover = h.founders[3]; // the other couple's husband
    const child = h.services.people.createChild(
      h.root.fork("bastard"), h.world, h.services, wife, lover,
      undefined,
    );
    // createChild via the service defaults litter handling; illicitness comes
    // from pregnancy delivery, so mimic it directly:
    const h2 = makeTestWorld({ seed: "cuckoo2", couples: 2 });
    const [w2, hus2] = h2.founders;
    const lover2 = h2.founders[3];
    w2.pregnancy = {
      father: lover2.id,
      conceived: h2.world.now - 8,
      due: h2.world.now + 1,
      litter: 1,
      illicit: true,
    };
    h2.controls.forcedLitter = 1;
    h2.tick();
    const births = eventsOfType(h2, "birth");
    expect(births).toHaveLength(1);
    expect(births[0].secret).toBe(true);
    expect(births[0].data.illicit).toBe(true);
    const babe = h2.world.people.get(births[0].participants.subject)!;
    expect(babe.father).toBe(lover2.id);
    expect(babe.legalFather).toBe(hus2.id);
    expect(hus2.children).toContain(babe.id); // the world believes
    expect(lover2.children).not.toContain(babe.id); // the sire keeps no list
    // First case (direct service call, wife married to someone else than father):
    expect(child.legalFather).toBe(husband.id);
  });
});

// ---------------------------------------------------------------------------
// Death cascade
// ---------------------------------------------------------------------------

describe("kill", () => {
  it("cascades: widowhood, politics.onDeath, grief memories, killer hatred", () => {
    const h = makeTestWorld({ seed: "kill", couples: 3 });
    const [wife, husband] = h.founders;
    const killer = h.founders[4];
    const child = h.services.people.createChild(
      h.root.fork("kid"), h.world, h.services, wife, husband,
    );
    const ctx = h.mkCtx();
    h.services.people.kill(ctx, husband, "a blade in the dark", { killer: killer.id });

    expect(husband.died).toBe(h.world.now);
    expect(husband.deathCause).toBe("a blade in the dark");
    expect(h.world.alive.has(husband.id)).toBe(false);
    expect(h.world.stats.totalDied).toBe(1);

    // Both marriage records widowed.
    expect(wife.marriages[0].active).toBe(false);
    expect(wife.marriages[0].endReason).toBe("death");
    expect(husband.marriages[0].active).toBe(false);
    expect(typeof wife.flags[F.mourningUntil]).toBe("number");

    // Cascade calls.
    expect(h.spies.onDeath).toEqual([husband.id]);
    const mourners = h.spies.memories.map((m) => m.person);
    expect(mourners).toContain(wife.id);
    expect(mourners).toContain(child.id);
    expect(
      h.spies.opinionAdjusts.some((o) => o.a === wife.id && o.b === killer.id && o.delta < 0),
    ).toBe(true);

    const deaths = eventsOfType(h, "death");
    expect(deaths).toHaveLength(1);
    expect(deaths[0].data.cause).toBe("a blade in the dark");
    expect(deaths[0].participants.killer).toBe(killer.id);
    expect(deaths[0].importance).toBeGreaterThanOrEqual(8);
  });

  it("threads a causal parent event into the death record", () => {
    const h = makeTestWorld({ seed: "kill-cause", couples: 1 });
    const ctx = h.mkCtx();
    const brawl = ctx.record({
      type: "brawl",
      date: h.world.now,
      participants: { subject: h.founders[1].id },
      data: {},
      location: h.founders[1].location,
      region: null,
      importance: 12,
      causes: [],
      storyline: null,
      secret: false,
    });
    h.services.people.kill(ctx, h.founders[1], "a broken skull", { event: brawl.id });
    const death = eventsOfType(h, "death")[0];
    expect(death.causes).toContain(brawl.id);
  });

  it("places orphaned minors with the nearest adult kin and moves them", () => {
    const h = makeTestWorld({ seed: "orphan", couples: 2, settlements: 2 });
    const [wife, husband] = h.founders;
    const child = h.services.people.createChild(
      h.root.fork("kid"), h.world, h.services, wife, husband,
    );
    const sibling = h.services.people.createChild(
      h.root.fork("sib"), h.world, h.services, wife, husband,
    );
    sibling.born -= 20 * 12; // an adult sibling, grown and flown
    sibling.location = h.settlements[1].id;
    const ctx = h.mkCtx();
    h.services.people.kill(ctx, husband, "a fever");
    expect(child.flags[F.guardian]).toBeUndefined(); // mother still lives
    h.services.people.kill(ctx, wife, "grief and a hard winter");
    expect(child.flags[F.guardian]).toBe(sibling.id);
    expect(child.location).toBe(sibling.location);
    const moves = eventsOfType(h, "moved");
    expect(moves.some((m) => m.participants.subject === child.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Marriage market
// ---------------------------------------------------------------------------

describe("marriage market", () => {
  it("honors an existing betrothal with a wedding carrying the culture's rite", () => {
    const h = makeTestWorld({ seed: "betrothed", couples: 1 });
    const a = h.services.people.createFounder(h.root.fork("a"), h.world, h.services, {
      culture: h.culture.id, religion: h.religion.id, location: h.settlements[0].id,
      house: null, sex: "f", ageYears: 19,
    });
    const b = h.services.people.createFounder(h.root.fork("b"), h.world, h.services, {
      culture: h.culture.id, religion: h.religion.id, location: h.settlements[0].id,
      house: null, sex: "m", ageYears: 23,
    });
    a.betrothed = b.id;
    b.betrothed = a.id;
    h.tick();
    const weddings = eventsOfType(h, "wedding");
    expect(weddings).toHaveLength(1);
    expect(weddings[0].participants.bride).toBe(a.id);
    expect(weddings[0].participants.groom).toBe(b.id);
    expect(weddings[0].data.rite).toBe("The Binding of Cords");
    expect(weddings[0].importance).toBeGreaterThanOrEqual(10);
    expect(a.marriages[0].spouse).toBe(b.id);
    expect(b.marriages[0].spouse).toBe(a.id);
    expect(a.betrothed).toBeNull();
  });

  it("matches commoner singles into marriages over time, avoiding close kin", () => {
    const h = makeTestWorld({ seed: "market", couples: 0 });
    for (let i = 0; i < 8; i++) {
      h.services.people.createFounder(h.root.fork("single", i), h.world, h.services, {
        culture: h.culture.id, religion: h.religion.id, location: h.settlements[0].id,
        house: null, sex: i % 2 === 0 ? "f" : "m", ageYears: 19 + (i % 4),
      });
    }
    for (let m = 0; m < 48; m++) h.tick();
    const weddings = eventsOfType(h, "wedding");
    expect(weddings.length).toBeGreaterThanOrEqual(1);
    for (const w of weddings) {
      const bride = h.world.people.get(w.participants.bride)!;
      const groom = h.world.people.get(w.participants.groom)!;
      expect(bride.sex).toBe("f");
      expect(groom.sex).toBe("m");
      expect(h.services.social.closeKin(h.world, bride.id, groom.id)).toBe(false);
    }
  });

  it("blocks high-inbreeding commoner matches", () => {
    const h = makeTestWorld({ seed: "inbred", couples: 0 });
    h.controls.inbreeding = 0.125; // closer than cousins, always
    for (let i = 0; i < 6; i++) {
      h.services.people.createFounder(h.root.fork("s", i), h.world, h.services, {
        culture: h.culture.id, religion: h.religion.id, location: h.settlements[0].id,
        house: null, sex: i % 2 === 0 ? "f" : "m", ageYears: 20 + i,
      });
    }
    for (let m = 0; m < 36; m++) h.tick();
    expect(eventsOfType(h, "wedding")).toHaveLength(0);
  });

  it("processes a pending divorce flag into a divorce event", () => {
    const h = makeTestWorld({ seed: "divorce", couples: 1 });
    const [wife, husband] = h.founders;
    wife.flags[F.divorcePending] = husband.id;
    h.tick();
    const divorces = eventsOfType(h, "divorce");
    expect(divorces).toHaveLength(1);
    expect(divorces[0].importance).toBe(15);
    expect(wife.marriages[0].active).toBe(false);
    expect(wife.marriages[0].endReason).toBe("divorce");
    expect(husband.marriages[0].active).toBe(false);
    expect(wife.flags[F.divorcePending]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Emigration near the cap
// ---------------------------------------------------------------------------

describe("population pressure", () => {
  it("sends young unbound adults away when the land is full, without killing them", () => {
    const h = makeTestWorld({ seed: "full-land", couples: 0, popCap: 20 });
    for (let i = 0; i < 30; i++) {
      h.services.people.createFounder(h.root.fork("crowd", i), h.world, h.services, {
        culture: h.culture.id, religion: h.religion.id, location: h.settlements[0].id,
        house: null, sex: "f", ageYears: 18 + (i % 8),
      });
    }
    for (let m = 0; m < 24; m++) h.tick();
    const gone = eventsOfType(h, "emigrated");
    expect(gone.length).toBeGreaterThanOrEqual(1);
    for (const ev of gone) {
      const p = h.world.people.get(ev.participants.subject)!;
      expect(p.flags[F.emigrated]).toBe(true);
      expect(p.died).toBeNull();
      expect(p.location).toBeNull();
      expect(h.world.alive.has(p.id)).toBe(false);
      expect(ev.importance).toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Life stages & coming of age
// ---------------------------------------------------------------------------

describe("life course", () => {
  it("classifies life stages by culture adulthood age", () => {
    const h = makeTestWorld({ seed: "stages", couples: 1 });
    const [wife, husband] = h.founders;
    const child = h.services.people.createChild(
      h.root.fork("kid"), h.world, h.services, wife, husband,
    );
    expect(h.services.people.lifeStage(h.world, child)).toBe("infant");
    child.born -= 6 * 12;
    expect(h.services.people.lifeStage(h.world, child)).toBe("child");
    child.born -= 8 * 12;
    expect(h.services.people.lifeStage(h.world, child)).toBe("youth");
    child.born -= 4 * 12;
    expect(h.services.people.lifeStage(h.world, child)).toBe("adult");
    child.born -= 45 * 12;
    expect(h.services.people.lifeStage(h.world, child)).toBe("elder");
  });

  it("comes of age exactly once, with the culture's rite, then takes work", () => {
    const h = makeTestWorld({ seed: "majority-2", couples: 4 });
    const kids: Person[] = [];
    for (let i = 0; i < 4; i++) {
      kids.push(
        h.services.people.createChild(
          h.root.fork("kid", i), h.world, h.services, h.founders[i * 2], h.founders[i * 2 + 1],
        ),
      );
    }
    for (let m = 0; m < 18 * 12; m++) h.tick();
    const survivors = kids.filter((k) => k.died === null && h.world.alive.has(k.id));
    expect(survivors.length).toBeGreaterThanOrEqual(1);
    for (const kid of survivors) {
      const mine = participantEvents(h, kid.id);
      const majority = mine.filter((e) => e.type === "coming-of-age");
      expect(majority).toHaveLength(1);
      expect(majority[0].data.rite).toBe("The First Spear");
      expect(majority[0].importance).toBeGreaterThanOrEqual(6);
      expect(kid.status.profession).not.toBe("none");
      const took = mine.filter((e) => e.type === "took-profession");
      expect(took).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Illness flavor
// ---------------------------------------------------------------------------

describe("illness names", () => {
  it("generates evocative, non-empty names", () => {
    const rng = new Rng("sickness");
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const name = illnessName(rng.fork(i), null, null);
      expect(name.length).toBeGreaterThan(3);
      expect(name).not.toContain("undefined");
      seen.add(name);
    }
    expect(seen.size).toBeGreaterThan(10); // variety, not a broken constant
  });
});

// ---------------------------------------------------------------------------
// Long-run stability & determinism
// ---------------------------------------------------------------------------

describe("the long run", () => {
  it("keeps the population stable over decades (no explosion, no collapse)", () => {
    const h = makeTestWorld({ seed: "stability", couples: 40, popCap: 300, settlements: 3 });
    for (let m = 0; m < 40 * 12; m++) h.tick();
    const alive = h.world.alive.size;
    expect(alive).toBeGreaterThan(60);
    expect(alive).toBeLessThan(330); // never far above the cap
    expect(h.world.stats.totalBorn).toBeGreaterThan(100);
    expect(h.world.stats.totalDied).toBeGreaterThan(20);
    // Bookkeeping identity: born - died - emigrated = alive (founders count as born).
    const emigrated = [...h.world.people.values()].filter(
      (p) => p.flags[F.emigrated] === true,
    ).length;
    expect(h.world.stats.totalBorn - h.world.stats.totalDied - emigrated).toBe(alive);
    // Event volume discipline: dead adults average a modest, meaningful chronicle.
    const deadAdults = [...h.world.people.values()].filter(
      (p) => p.died !== null && h.services.people.age(h.world, p) >= 16,
    );
    if (deadAdults.length > 0) {
      const counts = deadAdults.map((p) => participantEvents(h, p.id).length);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      expect(avg).toBeGreaterThan(2);
      expect(avg).toBeLessThan(60);
    }
  });

  it("is deterministic: same seed, same decade, identical chronicle", () => {
    const run = () => {
      const h = makeTestWorld({ seed: "determinism", couples: 12, popCap: 200 });
      for (let m = 0; m < 10 * 12; m++) h.tick();
      return worldDigest(h.world);
    };
    const first = run();
    const second = run();
    expect(second).toBe(first);
  });
});
