/**
 * Portrait module: procedural SVG bust portraits and heraldic banners.
 *
 * Public factory per docs/CONTRACTS.md. portraitSVG is a pure deterministic
 * function of (phenotype, sex, age, size); bannerSVG of (seed, size).
 */

import type { PortraitService } from "../core/types";
import { portraitSVG } from "./portrait";
import { bannerSVG } from "./banner";

export function createPortraitService(): PortraitService {
  return { portraitSVG, bannerSVG };
}

// Convenience re-exports for tests, tooling and the UI.
export { portraitSVG } from "./portrait";
export { bannerSVG, TINCTURES } from "./banner";
export { faceMetrics, HAIR_STYLES, BEARDS } from "./metrics";
export {
  MOON_PALE_HAIR,
  MOON_PALE_SKIN,
  MOON_PALE_EYE,
  SILVER_STREAK,
  SILVER_STREAK_ON_LIGHT,
} from "./color";
export { phenotypeKey } from "./dice";
export { randomPhenotype, childPhenotype } from "./sample";
