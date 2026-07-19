/**
 * Succession law tests over fabricated dynasty pedigrees: each of the six
 * laws, reign bookkeeping, regencies, crises with claimant flags, and house
 * headship inheritance.
 */

import { describe, expect, it } from "vitest";
import type { House, Person } from "../core/types";
import { PF } from "./helpers";
import { successionLine } from "./succession";
import {
  type DynastyHarness,
  enthrone,
  makeDynastyWorld,
  spawn,
} from "./testkit";

function marry(a: Person, b: Person, now: number): void {
  a.marriages.push({ spouse: b.id, date: now, active: true });
  b.marriages.push({ spouse: a.id, date: now, active: true });
}

/** The classic test dynasty: a king, a dead heir with sons, and rivals. */
function buildMaleLine(h: DynastyHarness) {
  const w = h.world;
  const house = h.house.id;
  const grandpa = spawn(w, { sex: "m", ageYears: 82, house, dead: true });
  const king = spawn(w, { sex: "m", ageYears: 52, house, father: grandpa.id });
  const brother = spawn(w, { sex: "m", ageYears: 45, house, father: grandpa.id });
  const nephew = spawn(w, { sex: "m", ageYears: 19, house, father: brother.id });
  const queen = spawn(w, { sex: "f", ageYears: 49, house });
  queen.flags[PF.marriedIn] = true;
  marry(king, queen, w.now - 360);
  const daughter = spawn(w, { sex: "f", ageYears: 27, house, mother: queen.id, father: king.id });
  const deadSon = spawn(w, { sex: "m", ageYears: 25, house, mother: queen.id, father: king.id, dead: true });
  const youngSon = spawn(w, { sex: "m", ageYears: 22, house, mother: queen.id, father: king.id });
  const grandson1 = spawn(w, { sex: "m", ageYears: 6, house, father: deadSon.id });
  const grandson2 = spawn(w, { sex: "m", ageYears: 4, house, father: deadSon.id });
  enthrone(h, king);
  return { king, queen, brother, nephew, daughter, deadSon, youngSon, grandson1, grandson2 };
}

describe("male-primogeniture", () => {
  it("orders sons with representation, then brothers, then nephews", () => {
    const h = makeDynastyWorld({ law: "male-primogeniture" });
    const d = buildMaleLine(h);
    const line = successionLine(h.world, h.polity);
    expect(line).toEqual([
      d.grandson1.id, // dead eldest son's line comes first
      d.grandson2.id,
      d.youngSon.id,
      d.brother.id,
      d.nephew.id,
    ]);
    // Daughters and the married-in queen never appear.
    expect(line).not.toContain(d.daughter.id);
    expect(line).not.toContain(d.queen.id);
  });

  it("crowns the heir, closes the reign, and notes a regent for a child", () => {
    const h = makeDynastyWorld({ law: "male-primogeniture" });
    const d = buildMaleLine(h);
    const ctx = h.mkCtx();
    h.services.people.kill(ctx, d.king, "a wasting fever", {});

    expect(h.polity.ruler).toBe(d.grandson1.id);
    expect(d.grandson1.status.rank).toBe(5);
    const reigns = h.polity.reigns;
    expect(reigns.length).toBe(2);
    expect(reigns[0].ruler).toBe(d.king.id);
    expect(reigns[0].to).toBe(h.world.now);
    expect(reigns[1]).toEqual({ ruler: d.grandson1.id, from: h.world.now, to: null });

    const events = [...h.world.events.values()];
    const coronation = events.find((e) => e.type === "coronation");
    expect(coronation).toBeDefined();
    expect(coronation!.participants.ruler).toBe(d.grandson1.id);
    expect(coronation!.data.polity).toBe(h.polity.id);
    // The boy king gets a grown hand at his shoulder: the king's brother.
    expect(coronation!.data.regent).toBe(d.brother.id);
    // Cause chain runs back to the death.
    const death = events.find((e) => e.type === "death" && e.participants.subject === d.king.id);
    expect(death).toBeDefined();
    expect(coronation!.causes).toContain(death!.id);
  });
});

describe("absolute-primogeniture", () => {
  it("takes the eldest child of either sex, with representation", () => {
    const h = makeDynastyWorld({ law: "absolute-primogeniture" });
    const d = buildMaleLine(h);
    const line = successionLine(h.world, h.polity);
    // Eldest daughter first; the dead son's boys stand before the young son.
    expect(line.slice(0, 4)).toEqual([
      d.daughter.id,
      d.grandson1.id,
      d.grandson2.id,
      d.youngSon.id,
    ]);
    const ctx = h.mkCtx();
    h.services.people.kill(ctx, d.king, "thrown from a horse", {});
    expect(h.polity.ruler).toBe(d.daughter.id);
  });
});

describe("female-primogeniture", () => {
  it("mirrors through the female line", () => {
    const h = makeDynastyWorld({ law: "female-primogeniture", descent: "matrilineal" });
    const w = h.world;
    const house = h.house.id;
    const queen = spawn(w, { sex: "f", ageYears: 50, house });
    const eldestDaughter = spawn(w, { sex: "f", ageYears: 28, house, mother: queen.id });
    const granddaughter = spawn(w, { sex: "f", ageYears: 8, house, mother: eldestDaughter.id });
    const youngerDaughter = spawn(w, { sex: "f", ageYears: 24, house, mother: queen.id });
    const son = spawn(w, { sex: "m", ageYears: 30, house, mother: queen.id });
    enthrone(h, queen);

    const line = successionLine(w, h.polity);
    expect(line.slice(0, 3)).toEqual([eldestDaughter.id, granddaughter.id, youngerDaughter.id]);
    expect(line).not.toContain(son.id);
  });
});

describe("seniority", () => {
  it("hands the seat to the eldest living adult of the house blood", () => {
    const h = makeDynastyWorld({ law: "seniority" });
    const w = h.world;
    const house = h.house.id;
    const king = spawn(w, { sex: "m", ageYears: 40, house });
    const youngSon = spawn(w, { sex: "m", ageYears: 17, house, father: king.id });
    const greatUncle = spawn(w, { sex: "m", ageYears: 66, house });
    const cousin = spawn(w, { sex: "f", ageYears: 33, house });
    const inLaw = spawn(w, { sex: "f", ageYears: 70, house });
    inLaw.flags[PF.marriedIn] = true;
    enthrone(h, king);

    const line = successionLine(w, h.polity);
    expect(line[0]).toBe(greatUncle.id);
    expect(line).not.toContain(inLaw.id);

    h.services.people.kill(h.mkCtx(), king, "a stone in the gut", {});
    expect(h.polity.ruler).toBe(greatUncle.id);
    // The passed-over son is real, just behind his elders.
    expect(line).toContain(youngSon.id);
    expect(line.indexOf(cousin.id)).toBeGreaterThan(line.indexOf(greatUncle.id));
  });
});

describe("elective-council", () => {
  it("ranks candidates by standing, voice, and hunger", () => {
    const h = makeDynastyWorld({ law: "elective-council" });
    const w = h.world;
    const house = h.house.id;
    const ruler = spawn(w, { sex: "m", ageYears: 55, house });
    enthrone(h, ruler);
    const silverTongue = spawn(w, { sex: "f", ageYears: 40, house, rank: 4, ambition: 0.8 });
    silverTongue.phenotype.aptitudes["oratory"] = 3;
    silverTongue.notability = 200;
    const dullard = spawn(w, { sex: "m", ageYears: 44, house, rank: 2, ambition: 0.1 });
    dullard.phenotype.aptitudes["oratory"] = 0;
    dullard.notability = 0;
    const child = spawn(w, { sex: "m", ageYears: 6, house });

    const line = successionLine(w, h.polity);
    expect(line[0]).toBe(silverTongue.id);
    expect(line).toContain(dullard.id);
    expect(line).not.toContain(child.id); // councils do not elect children

    h.services.people.kill(h.mkCtx(), ruler, "age and honey wine", {});
    expect(h.polity.ruler).toBe(silverTongue.id);
  });
});

describe("divine-lot", () => {
  it("casts the lot among eligible kin, deterministically", () => {
    const build = () => {
      const h = makeDynastyWorld({ law: "divine-lot", seed: "lot-seed" });
      const w = h.world;
      const house = h.house.id;
      const hierarch = spawn(w, { sex: "m", ageYears: 60, house });
      for (let i = 0; i < 4; i++) {
        spawn(w, { sex: i % 2 === 0 ? "f" : "m", ageYears: 25 + i * 3, house, father: hierarch.id });
      }
      enthrone(h, hierarch);
      h.services.people.kill(h.mkCtx(), hierarch, "found cold at prayer", {});
      return h;
    };
    const a = build();
    const b = build();
    expect(a.polity.ruler).not.toBeNull();
    expect(a.polity.ruler).toBe(b.polity.ruler);
    const coronation = [...a.world.events.values()].find((e) => e.type === "coronation");
    expect(coronation).toBeDefined();
    expect(coronation!.data.chosenByLot).toBe(true);
    expect(typeof coronation!.data.rite).toBe("string");
    expect((coronation!.data.rite as string).length).toBeGreaterThan(0);
  });
});

describe("succession crisis", () => {
  function buildCrisisWorld() {
    const h = makeDynastyWorld({ law: "male-primogeniture", seed: "crisis-seed" });
    const w = h.world;
    // A king alone: no blood kin, a married-in consort, and rival houses.
    const king = spawn(w, { sex: "m", ageYears: 60, house: h.house.id });
    const consort = spawn(w, { sex: "f", ageYears: 55, house: h.house.id });
    consort.flags[PF.marriedIn] = true;
    enthrone(h, king);
    const rivalHouse: House = {
      id: 99,
      name: "House Vane",
      motto: "We Do Not Forget",
      founder: 0,
      founded: w.now - 500,
      head: null,
      seat: h.settlement.id,
      culture: h.culture.id,
      parent: null,
      prestige: 40,
      bannerSeed: "test:House Vane#99",
      feuds: new Map(),
    };
    w.houses.set(rivalHouse.id, rivalHouse);
    const rivalHead = spawn(w, { sex: "m", ageYears: 41, house: rivalHouse.id, rank: 4, ambition: 0.9 });
    rivalHouse.head = rivalHead.id;
    return { h, king, consort, rivalHead };
  }

  it("opens a crisis with claimant flags when the line is empty", () => {
    const { h, king, consort, rivalHead } = buildCrisisWorld();
    h.services.people.kill(h.mkCtx(), king, "choked at the feast", {});

    expect(h.polity.ruler).toBeNull();
    const crisis = [...h.world.events.values()].find((e) => e.type === "succession-crisis");
    expect(crisis).toBeDefined();
    expect(crisis!.importance).toBe(55);
    const claimants = crisis!.data.claimants as number[];
    expect(claimants.length).toBeGreaterThanOrEqual(1);
    expect(claimants.length).toBeLessThanOrEqual(3);
    expect(rivalHead.flags[PF.claimant]).toBe(h.polity.id);
    expect(consort.flags[PF.claimant]).toBeUndefined();
  });

  it("resolves after a stew: a disputed coronation seats a claimant", () => {
    const { h, king, rivalHead } = buildCrisisWorld();
    h.services.people.kill(h.mkCtx(), king, "choked at the feast", {});
    for (let i = 0; i < 30 && h.polity.ruler === null; i++) h.tick();
    expect(h.polity.ruler).toBe(rivalHead.id);
    expect(h.polity.rulingHouse).toBe(rivalHead.house);
    const coronation = [...h.world.events.values()].find((e) => e.type === "coronation");
    expect(coronation).toBeDefined();
    expect(coronation!.data.disputed).toBe(true);
    // The crisis is the coronation's cause.
    const crisis = [...h.world.events.values()].find((e) => e.type === "succession-crisis");
    expect(coronation!.causes).toContain(crisis!.id);
    // Reigns pick back up.
    const last = h.polity.reigns[h.polity.reigns.length - 1];
    expect(last.ruler).toBe(rivalHead.id);
    expect(last.to).toBeNull();
  });
});

describe("house headship", () => {
  it("passes head, seat title and wealth by primogeniture on the head's death", () => {
    const h = makeDynastyWorld({ law: "male-primogeniture" });
    const w = h.world;
    // A separate noble house, not the crown.
    const house: House = {
      id: 77,
      name: "House Corrow",
      motto: "By Hand and Fire",
      founder: 0,
      founded: w.now - 300,
      head: null,
      seat: h.settlement.id,
      culture: h.culture.id,
      parent: null,
      prestige: 25,
      bannerSeed: "test:House Corrow#77",
      feuds: new Map(),
    };
    w.houses.set(house.id, house);
    const lord = spawn(w, { sex: "m", ageYears: 58, house: house.id, rank: 4 });
    lord.status.wealth = 4;
    house.head = lord.id;
    const daughter = spawn(w, { sex: "f", ageYears: 30, house: house.id, mother: null, father: lord.id, rank: 3 });
    const son = spawn(w, { sex: "m", ageYears: 26, house: house.id, father: lord.id, rank: 3 });

    h.services.people.kill(h.mkCtx(), lord, "the winter cough", {});
    // Patrilineal primogeniture: the son, though younger than his sister.
    expect(house.head).toBe(son.id);
    expect(son.status.rank).toBe(4);
    expect(son.status.wealth).toBe(4);
    expect(son.status.titles.some((t) => t.includes("of Harrowmere"))).toBe(true);
    const grant = [...w.events.values()].find((e) => e.type === "title-granted");
    expect(grant).toBeDefined();
    expect(grant!.participants.subject).toBe(son.id);
    expect(daughter.id).not.toBe(house.head);
  });

  it("seniority custom crowns the eldest member instead", () => {
    const h = makeDynastyWorld({ inheritance: "seniority" });
    const w = h.world;
    const house = h.house;
    const lord = spawn(w, { sex: "m", ageYears: 50, house: house.id, rank: 4 });
    house.head = lord.id;
    spawn(w, { sex: "m", ageYears: 20, house: house.id, father: lord.id });
    const elder = spawn(w, { sex: "f", ageYears: 63, house: house.id });
    h.services.people.kill(h.mkCtx(), lord, "a fall on the stair", {});
    expect(house.head).toBe(elder.id);
  });
});

describe("successionLine contract", () => {
  it("respects the limit and never lists the dead or the sitting ruler", () => {
    const h = makeDynastyWorld({ law: "absolute-primogeniture" });
    const d = buildMaleLine(h);
    const line = successionLine(h.world, h.polity, 2);
    expect(line.length).toBe(2);
    expect(line).not.toContain(d.king.id);
    expect(line).not.toContain(d.deadSon.id);
  });
});
