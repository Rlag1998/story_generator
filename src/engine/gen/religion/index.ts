/**
 * Religion module — createReligionService.
 *
 * Generates faiths coherent with their culture's values and tongue
 * (pantheons, dualisms, monisms, ancestor cults, animisms, mystery rites),
 * splits heresies that keep a family resemblance, and runs the monthly
 * religious calendar: festivals, omens, miracles and temple-raisings, all
 * deterministic and deliberately low in event volume.
 *
 * Native names are coined directly from the shared `Language` phonology in
 * core/types (see words.ts), so this module stands alone while the language
 * module is built in parallel.
 */

import type { Ctx, Culture, Person, Religion, ReligionService, World } from "../../core/types";
import type { Rng } from "../../core/rng";
import { generateReligion } from "./generate";
import { makeSchism } from "./schism";
import { religionTick } from "./tick";

export function createReligionService(): ReligionService {
  return {
    generate(rng: Rng, world: World, culture: Culture): Religion {
      return generateReligion(rng, world, culture);
    },
    schism(rng: Rng, world: World, parent: Religion, founder: Person): Religion {
      return makeSchism(rng, world, parent, founder);
    },
    tick(ctx: Ctx): void {
      religionTick(ctx);
    },
  };
}

// Extra exported helpers (free-form internal API for tests and tooling).
export { generateReligion, pickShape, fillTokens } from "./generate";
export { makeSchism, schismWithReport } from "./schism";
export { religionTick } from "./tick";
export { forgeWord, forgeName, sacredWord, cap } from "./words";
export { DOMAINS, DOCTRINE_PAIRS, VIRTUE_POOL, SIN_POOL, TENETS } from "./pools";
