/**
 * Culture module — createCultureService.
 *
 * Generates coherent cultures bound to their language (names, demonyms and
 * tradition flavor coined from the tongue's own phonology), derives drifted
 * daughter cultures, and owns all personal-naming conventions: full-name
 * composition per name order, ancestor-honoring baby names, twin-naming
 * flavor, and descent-correct surnames.
 *
 * Allowed exception per docs/CONTRACTS.md: this module imports the public
 * API of gen/language (strict DAG: language <- culture <- religion), since
 * worldgen runs before the services registry exists.
 */

import { createLanguageService } from "../language";
import type { Rng } from "../../core/rng";
import type {
  Culture,
  CultureService,
  Language,
  Person,
  Sex,
  World,
} from "../../core/types";
import { deriveCulture, generateCulture } from "./generate";
import { chooseBabyName, chooseBabySurname, composeFullName } from "./naming";

export function createCultureService(): CultureService {
  // Our own language-service instance, used for given names so newborns
  // sound like their culture's tongue. Language services are stateless;
  // determinism flows entirely from the Rng streams we pass in.
  const languageService = createLanguageService();
  const givenNameFn = (rng: Rng, lang: Language, sex: Sex): string =>
    languageService.givenName(rng, lang, sex);

  return {
    generate(rng: Rng, world: World, language: Language): Culture {
      return generateCulture(rng, world, language);
    },
    derive(rng: Rng, world: World, parent: Culture, language: Language): Culture {
      return deriveCulture(rng, world, parent, language);
    },
    fullName(world: World, person: Person): string {
      return composeFullName(world, person);
    },
    babyName(rng: Rng, world: World, mother: Person, father: Person | null, sex: Sex): string {
      return chooseBabyName(rng, world, mother, father, sex, givenNameFn);
    },
    babySurname(
      world: World,
      mother: Person,
      father: Person | null,
      sex: Sex,
      given: string,
    ): string {
      return chooseBabySurname(world, mother, father, sex, given);
    },
  };
}

// Extra exported helpers (free-form internal API for tests and tooling).
export { generateCulture, deriveCulture } from "./generate";
export { composeFullName, chooseBabyName, chooseBabySurname, applyPatronymic } from "./naming";
export { TRADITION_TEMPLATES, TRADITION_HOOKS, selectTraditions } from "./traditions";
