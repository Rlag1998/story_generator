/**
 * Naming convention tests: full-name composition per name order, newborn
 * surnames per descent rule, ancestor naming over a fabricated pedigree,
 * twin-naming flavor, and determinism.
 */

import { describe, expect, it } from "vitest";
import { Rng } from "../../core/rng";
import type { Culture, Person, World } from "../../core/types";
import {
  applyPatronymic,
  chooseBabyName,
  chooseBabySurname,
  composeFullName,
  type GivenNameFn,
} from "./naming";
import { generateCulture } from "./generate";
import {
  addCulture,
  addHouse,
  addLanguage,
  addPerson,
  makeTestLanguage,
  makeTestWorld,
} from "./testkit";

/** Rng whose label carries the seed, as the engine's root rng does. */
function testRng(seed: string): Rng {
  return new Rng(seed, `test:${seed}`);
}

/** A tiny deterministic stand-in for the language service's givenName. */
const stubGiven: GivenNameFn = (rng, _lang, sex) =>
  sex === "f"
    ? rng.pick(["Runa", "Selka", "Idra", "Sana", "Kelva", "Mira"])
    : rng.pick(["Torin", "Selk", "Kel", "Soren", "Sarn", "Doran"]);

interface Fixture {
  world: World;
  culture: Culture;
}

function fixture(): Fixture {
  const world = makeTestWorld();
  const lang = addLanguage(world, makeTestLanguage());
  const culture = generateCulture(new Rng("naming-fixture", "test"), world, lang);
  culture.nameOrder = "given-family";
  culture.descent = "patrilineal";
  culture.ancestorNaming = 0;
  addCulture(world, culture);
  return { world, culture };
}

describe("applyPatronymic", () => {
  const lang = makeTestLanguage();
  it("applies gendered affixes", () => {
    expect(applyPatronymic(lang, "Halvar", "m")).toBe("Halvarsson");
    expect(applyPatronymic(lang, "Halvar", "f")).toBe("Halvarsdottir");
  });
  it("collapses a doubled letter at the seam", () => {
    expect(applyPatronymic(lang, "Nils", "m")).toBe("Nilsson");
  });
  it("supports prefix-style patronymics", () => {
    const welsh = makeTestLanguage({ patronymicM: ["ap ", ""], patronymicF: ["ferch ", ""] });
    expect(applyPatronymic(welsh, "Gwilym", "m")).toBe("ap Gwilym");
    expect(applyPatronymic(welsh, "Gwilym", "f")).toBe("ferch Gwilym");
  });
});

describe("composeFullName", () => {
  it("given-family: given then family name", () => {
    const { world, culture } = fixture();
    const p = addPerson(world, { givenName: "Kel", surname: "Maren", sex: "m", culture: culture.id });
    expect(composeFullName(world, p)).toBe("Kel Maren");
  });

  it("family-given: family name first", () => {
    const { world, culture } = fixture();
    culture.nameOrder = "family-given";
    const p = addPerson(world, { givenName: "Kel", surname: "Maren", sex: "m", culture: culture.id });
    expect(composeFullName(world, p)).toBe("Maren Kel");
  });

  it("given-only: bare given name even when a surname is stored", () => {
    const { world, culture } = fixture();
    culture.nameOrder = "given-only";
    const p = addPerson(world, { givenName: "Kel", surname: "Maren", sex: "m", culture: culture.id });
    expect(composeFullName(world, p)).toBe("Kel");
  });

  it("given-patronymic: builds from the legal father's given name", () => {
    const { world, culture } = fixture();
    culture.nameOrder = "given-patronymic";
    const father = addPerson(world, { givenName: "Halvar", sex: "m", culture: culture.id });
    const p = addPerson(world, {
      givenName: "Runa", sex: "f", culture: culture.id, father: father.id,
    });
    expect(composeFullName(world, p)).toBe("Runa Halvarsdottir");
  });

  it("given-patronymic: legal father outranks biological father", () => {
    const { world, culture } = fixture();
    culture.nameOrder = "given-patronymic";
    const bio = addPerson(world, { givenName: "Torvald", sex: "m", culture: culture.id });
    const legal = addPerson(world, { givenName: "Halvar", sex: "m", culture: culture.id });
    const p = addPerson(world, {
      givenName: "Kel", sex: "m", culture: culture.id, father: bio.id, legalFather: legal.id,
    });
    expect(composeFullName(world, p)).toBe("Kel Halvarsson");
  });

  it("given-patronymic: matrilineal cultures use the mother's name", () => {
    const { world, culture } = fixture();
    culture.nameOrder = "given-patronymic";
    culture.descent = "matrilineal";
    const mother = addPerson(world, { givenName: "Sigrun", sex: "f", culture: culture.id });
    const p = addPerson(world, {
      givenName: "Kel", sex: "m", culture: culture.id, mother: mother.id,
    });
    expect(composeFullName(world, p)).toBe("Kel Sigrunsson");
  });

  it("given-patronymic: falls back to house name, then given only", () => {
    const { world, culture } = fixture();
    culture.nameOrder = "given-patronymic";
    const house = addHouse(world, "House Maren", culture.id);
    const noble = addPerson(world, {
      givenName: "Aeric", sex: "m", culture: culture.id, house: house.id,
    });
    expect(composeFullName(world, noble)).toBe("Aeric Maren");
    const orphan = addPerson(world, { givenName: "Wren", sex: "f", culture: culture.id });
    expect(composeFullName(world, orphan)).toBe("Wren");
  });

  it("nobles show their house name in family orders", () => {
    const { world, culture } = fixture();
    const house = addHouse(world, "Clan Durroch", culture.id);
    const p = addPerson(world, {
      givenName: "Brann", surname: "Smithson", sex: "m", culture: culture.id,
      house: house.id, rank: 4,
    });
    expect(composeFullName(world, p)).toBe("Brann Durroch");
  });
});

describe("chooseBabySurname", () => {
  it("is empty for given-only cultures", () => {
    const { world, culture } = fixture();
    culture.nameOrder = "given-only";
    const mother = addPerson(world, { givenName: "Sigrun", surname: "Voss", sex: "f", culture: culture.id });
    expect(chooseBabySurname(world, mother, null, "f", "Runa")).toBe("");
  });

  it("builds a patronymic from the father for patronymic cultures", () => {
    const { world, culture } = fixture();
    culture.nameOrder = "given-patronymic";
    const mother = addPerson(world, { givenName: "Sigrun", sex: "f", culture: culture.id });
    const father = addPerson(world, { givenName: "Halvar", sex: "m", culture: culture.id });
    expect(chooseBabySurname(world, mother, father, "f", "Runa")).toBe("Halvarsdottir");
    expect(chooseBabySurname(world, mother, father, "m", "Kel")).toBe("Halvarsson");
  });

  it("gives the fatherless a matronymic", () => {
    const { world, culture } = fixture();
    culture.nameOrder = "given-patronymic";
    const mother = addPerson(world, { givenName: "Sigrun", sex: "f", culture: culture.id });
    expect(chooseBabySurname(world, mother, null, "m", "Kel")).toBe("Sigrunsson");
  });

  it("passes family names down the descent line", () => {
    const { world, culture } = fixture();
    const mother = addPerson(world, { givenName: "Sigrun", surname: "Voss", sex: "f", culture: culture.id });
    const father = addPerson(world, { givenName: "Halvar", surname: "Maren", sex: "m", culture: culture.id });
    culture.descent = "patrilineal";
    expect(chooseBabySurname(world, mother, father, "m", "Kel")).toBe("Maren");
    culture.descent = "matrilineal";
    expect(chooseBabySurname(world, mother, father, "m", "Kel")).toBe("Voss");
  });

  it("cognatic descent follows the grander line", () => {
    const { world, culture } = fixture();
    culture.descent = "cognatic";
    const mother = addPerson(world, {
      givenName: "Sigrun", surname: "Voss", sex: "f", culture: culture.id, rank: 4,
    });
    const father = addPerson(world, {
      givenName: "Halvar", surname: "Maren", sex: "m", culture: culture.id, rank: 1,
    });
    expect(chooseBabySurname(world, mother, father, "f", "Runa")).toBe("Voss");
  });

  it("falls back to the other parent when the favored line has no name", () => {
    const { world, culture } = fixture();
    culture.descent = "patrilineal";
    const mother = addPerson(world, { givenName: "Sigrun", surname: "Voss", sex: "f", culture: culture.id });
    expect(chooseBabySurname(world, mother, null, "m", "Kel")).toBe("Voss");
  });
});

describe("chooseBabyName", () => {
  it("reuses a dead grandparent's name when ancestor naming fires", () => {
    const { world, culture } = fixture();
    culture.ancestorNaming = 1;
    const grandfather = addPerson(world, {
      givenName: "Torvald", sex: "m", culture: culture.id, died: 100 * 12,
    });
    const grandmother = addPerson(world, {
      givenName: "Astrid", sex: "f", culture: culture.id, died: 100 * 12,
    });
    const father = addPerson(world, {
      givenName: "Halvar", sex: "m", culture: culture.id,
      father: grandfather.id, mother: grandmother.id,
    });
    const mother = addPerson(world, { givenName: "Sigrun", sex: "f", culture: culture.id });
    const rng = testRng("ancestor-roll");
    expect(chooseBabyName(rng, world, mother, father, "m", stubGiven)).toBe("Torvald");
    expect(chooseBabyName(rng.fork("girl"), world, mother, father, "f", stubGiven)).toBe("Astrid");
  });

  it("reaches great-grandparents when no grandparent name fits", () => {
    const { world, culture } = fixture();
    culture.ancestorNaming = 1;
    const great = addPerson(world, {
      givenName: "Brandor", sex: "m", culture: culture.id, died: 95 * 12,
    });
    const grandfather = addPerson(world, {
      givenName: "Torvald", sex: "m", culture: culture.id, father: great.id,
    }); // still alive: not eligible himself, but his line is walkable
    const father = addPerson(world, {
      givenName: "Halvar", sex: "m", culture: culture.id, father: grandfather.id,
    });
    const mother = addPerson(world, { givenName: "Sigrun", sex: "f", culture: culture.id });
    const rng = testRng("great-roll");
    expect(chooseBabyName(rng, world, mother, father, "m", stubGiven)).toBe("Brandor");
  });

  it("never hands a newborn a living sibling's name", () => {
    const { world, culture } = fixture();
    culture.ancestorNaming = 1;
    const grandfather = addPerson(world, {
      givenName: "Torvald", sex: "m", culture: culture.id, died: 100 * 12,
    });
    const father = addPerson(world, {
      givenName: "Halvar", sex: "m", culture: culture.id, father: grandfather.id,
    });
    const mother = addPerson(world, { givenName: "Sigrun", sex: "f", culture: culture.id });
    // An older brother already carries the grandfather's name.
    addPerson(world, {
      givenName: "Torvald", sex: "m", culture: culture.id,
      mother: mother.id, father: father.id,
    });
    for (let i = 0; i < 10; i++) {
      const name = chooseBabyName(testRng(`sib-${i}`), world, mother, father, "m", stubGiven);
      expect(name).not.toBe("Torvald");
    }
  });

  it("alliterates litter mates when the twin belief calls for it", () => {
    const { world, culture } = fixture();
    culture.traditions = [
      { key: "twins-two-flames", name: "The Two Flames", description: "", hooks: ["twins", "birth"] },
    ];
    const mother = addPerson(world, { givenName: "Sigrun", sex: "f", culture: culture.id });
    const father = addPerson(world, { givenName: "Halvar", sex: "m", culture: culture.id });
    // Firstborn twin, delivered this very month.
    addPerson(world, {
      givenName: "Selk", sex: "m", culture: culture.id,
      mother: mother.id, father: father.id, born: world.now,
    });
    for (let i = 0; i < 6; i++) {
      const name = chooseBabyName(testRng(`twin-${i}`), world, mother, father, "m", stubGiven);
      expect(name[0].toLowerCase()).toBe("s");
      expect(name).not.toBe("Selk");
    }
  });

  it("keeps twin initials apart where twins are uncanny", () => {
    const { world, culture } = fixture();
    culture.traditions = [
      { key: "twins-one-soul", name: "The Halved Soul", description: "", hooks: ["twins", "birth"] },
    ];
    const mother = addPerson(world, { givenName: "Sigrun", sex: "f", culture: culture.id });
    addPerson(world, {
      givenName: "Selk", sex: "m", culture: culture.id, mother: mother.id, born: world.now,
    });
    for (let i = 0; i < 6; i++) {
      const name = chooseBabyName(testRng(`un-${i}`), world, mother, null, "m", stubGiven);
      expect(name[0].toLowerCase()).not.toBe("s");
    }
  });

  it("is deterministic for a fixed seed", () => {
    const build = () => {
      const { world, culture } = fixture();
      culture.ancestorNaming = 0.5;
      const mother = addPerson(world, { givenName: "Sigrun", sex: "f", culture: culture.id });
      const father = addPerson(world, { givenName: "Halvar", sex: "m", culture: culture.id });
      const names: string[] = [];
      for (let i = 0; i < 8; i++) {
        names.push(
          chooseBabyName(new Rng("det", "t").fork("baby", i), world, mother, father, i % 2 ? "f" : "m", stubGiven),
        );
      }
      return names.join("|");
    };
    expect(build()).toBe(build());
  });
});
