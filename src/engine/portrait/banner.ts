/**
 * bannerSVG: procedural heraldry from a seed string.
 *
 * Follows the medieval rule of tincture (metal on colour, colour on metal)
 * with a curated palette, classic field divisions, ordinaries, bold charge
 * silhouettes and occasional borders. Every element is drawn as simple
 * high-contrast shapes so a banner stays readable at 24px.
 */

import { Rng } from "../core/rng";
import { fnv1a } from "../core/rng";
import { n, poly } from "./paths";

// --------------------------------------------------------------------------
// Tinctures
// --------------------------------------------------------------------------

interface Tincture {
  key: string;
  hex: string;
  metal: boolean;
}

export const TINCTURES: readonly Tincture[] = [
  { key: "or", hex: "#d7a636", metal: true },
  { key: "argent", hex: "#e9e4d4", metal: true },
  { key: "gules", hex: "#93302b", metal: false },
  { key: "azure", hex: "#2f5378", metal: false },
  { key: "vert", hex: "#3d6b41", metal: false },
  { key: "sable", hex: "#2a272e", metal: false },
  { key: "purpure", hex: "#5f3f68", metal: false },
  { key: "murrey", hex: "#7c2c40", metal: false },
] as const;

const METALS = TINCTURES.filter((t) => t.metal);
const COLOURS = TINCTURES.filter((t) => !t.metal);

/** Heater shield outline in a 100 x 120 viewBox. */
const SHIELD_D =
  "M 8 10 L 92 10 L 92 52 C 92 84, 73 104, 50 113 C 27 104, 8 84, 8 52 Z";

// --------------------------------------------------------------------------
// Charges: bold silhouettes in a 100x100 box, centred on (50,50).
// Each returns markup given the charge fill and the accent (field) colour.
// --------------------------------------------------------------------------

function star(fill: string): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 44 : 18;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
  }
  return `<path d="${poly(pts)}" fill="${fill}"/>`;
}

function crescent(fill: string): string {
  // Waxing crescent, horns to the chief (upward).
  return `<path d="M 14 42 A 40 40 0 1 0 86 42 A 33 33 0 1 1 14 42 Z" fill="${fill}"/>`;
}

function sun(fill: string): string {
  let rays = "";
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x0 = 50 + 24 * Math.cos(a - 0.16);
    const y0 = 50 + 24 * Math.sin(a - 0.16);
    const x1 = 50 + 46 * Math.cos(a);
    const y1 = 50 + 46 * Math.sin(a);
    const x2 = 50 + 24 * Math.cos(a + 0.16);
    const y2 = 50 + 24 * Math.sin(a + 0.16);
    rays += `<path d="${poly([[x0, y0], [x1, y1], [x2, y2]])}" fill="${fill}"/>`;
  }
  return rays + `<circle cx="50" cy="50" r="24" fill="${fill}"/>`;
}

function tower(fill: string, accent: string): string {
  const d = poly([
    [28, 90], [28, 38], [20, 38], [20, 18], [33, 18], [33, 28], [43, 28], [43, 18],
    [57, 18], [57, 28], [67, 28], [67, 18], [80, 18], [80, 38], [72, 38], [72, 90],
  ]);
  const door = `M 43 90 L 43 68 A 7 9 0 0 1 57 68 L 57 90 Z`;
  return `<path d="${d}" fill="${fill}"/><path d="${door}" fill="${accent}"/>`;
}

function tree(fill: string): string {
  return (
    `<circle cx="50" cy="32" r="20" fill="${fill}"/>` +
    `<circle cx="33" cy="44" r="14" fill="${fill}"/>` +
    `<circle cx="67" cy="44" r="14" fill="${fill}"/>` +
    `<path d="${poly([[45, 92], [46, 54], [40, 46], [46, 50], [50, 42], [54, 50], [60, 46], [54, 54], [55, 92]])}" fill="${fill}"/>`
  );
}

function mountain(fill: string): string {
  return `<path d="${poly([[6, 84], [34, 28], [48, 54], [62, 20], [94, 84]])}" fill="${fill}"/>`;
}

function fish(fill: string, accent: string): string {
  const body =
    "M 12 50 C 26 30, 58 30, 74 46 L 92 32 L 86 50 L 92 68 L 74 54 C 58 70, 26 70, 12 50 Z";
  return (
    `<path d="${body}" fill="${fill}"/>` +
    `<circle cx="27" cy="47" r="3.4" fill="${accent}"/>` +
    `<path d="M 44 36 C 50 44, 50 56, 44 64" fill="none" stroke="${accent}" stroke-width="3"/>`
  );
}

function sword(fill: string): string {
  return (
    `<path d="${poly([[50, 4], [57, 20], [55, 58], [45, 58], [43, 20]])}" fill="${fill}"/>` +
    `<rect x="30" y="58" width="40" height="7" rx="2" fill="${fill}"/>` +
    `<rect x="45" y="65" width="10" height="18" fill="${fill}"/>` +
    `<circle cx="50" cy="89" r="6.5" fill="${fill}"/>`
  );
}

function key(fill: string, accent: string): string {
  return (
    `<circle cx="50" cy="26" r="15" fill="${fill}"/>` +
    `<circle cx="50" cy="26" r="7" fill="${accent}"/>` +
    `<rect x="45" y="38" width="10" height="52" fill="${fill}"/>` +
    `<path d="${poly([[55, 70], [70, 70], [70, 78], [62, 78], [62, 82], [55, 82]])}" fill="${fill}"/>` +
    `<rect x="55" y="86" width="12" height="6" fill="${fill}"/>`
  );
}

function wolf(fill: string, accent: string): string {
  const d =
    "M 18 54 L 36 46 L 42 30 L 50 12 L 57 28 L 66 14 L 71 32 L 76 44 L 78 64 " +
    "L 72 88 L 44 88 L 47 70 L 38 66 L 26 63 L 18 59 Z";
  return `<path d="${d}" fill="${fill}"/><circle cx="49" cy="42" r="3.4" fill="${accent}"/>`;
}

function raven(fill: string, accent: string): string {
  const d =
    "M 18 38 L 36 34 C 38 22, 56 18, 63 26 C 74 32, 78 46, 74 58 " +
    "C 72 68, 66 76, 58 80 L 64 92 L 50 84 L 40 91 L 44 78 C 34 72, 30 60, 33 47 " +
    "C 29 45, 22 42, 18 38 Z";
  return `<path d="${d}" fill="${fill}"/><circle cx="52" cy="30" r="2.6" fill="${accent}"/>`;
}

function ship(fill: string): string {
  return (
    `<path d="M 10 62 L 20 82 L 80 82 L 90 62 C 72 70, 28 70, 10 62 Z" fill="${fill}"/>` +
    `<rect x="47.5" y="14" width="5" height="52" fill="${fill}"/>` +
    `<path d="M 30 20 L 70 20 C 62 32, 62 42, 70 50 L 30 50 C 38 42, 38 32, 30 20 Z" fill="${fill}"/>`
  );
}

function serpent(fill: string): string {
  return (
    `<path d="M 30 22 C 68 20, 72 40, 50 48 C 28 56, 30 74, 64 74" fill="none" stroke="${fill}" stroke-width="13" stroke-linecap="round"/>` +
    `<path d="${poly([[60, 66], [88, 74], [62, 86]])}" fill="${fill}"/>` +
    `<path d="${poly([[32, 16], [10, 20], [30, 30]])}" fill="${fill}"/>`
  );
}

function axe(fill: string): string {
  return (
    `<rect x="46" y="14" width="8" height="76" rx="3" fill="${fill}"/>` +
    `<path d="M 54 16 C 74 18, 84 30, 86 46 C 74 42, 62 42, 54 46 Z" fill="${fill}"/>` +
    `<path d="M 46 16 C 26 18, 16 30, 14 46 C 26 42, 38 42, 46 46 Z" fill="${fill}"/>`
  );
}

export type ChargeKey =
  | "star" | "crescent" | "sun" | "tower" | "tree" | "mountain" | "fish"
  | "sword" | "key" | "wolf" | "raven" | "ship" | "serpent" | "axe";

const CHARGES: Record<ChargeKey, (fill: string, accent: string) => string> = {
  star: (f) => star(f),
  crescent: (f) => crescent(f),
  sun: (f) => sun(f),
  tower,
  tree: (f) => tree(f),
  mountain: (f) => mountain(f),
  fish,
  sword: (f) => sword(f),
  key,
  wolf,
  raven,
  ship: (f) => ship(f),
  serpent: (f) => serpent(f),
  axe: (f) => axe(f),
};

const CHARGE_KEYS = Object.keys(CHARGES) as ChargeKey[];

// --------------------------------------------------------------------------
// Field divisions and ordinaries
// --------------------------------------------------------------------------

type Division = "plain" | "pale" | "fess" | "bend" | "chevron" | "quarterly";
type Ordinary = "pale" | "fess" | "bend" | "chevron" | "chief" | "saltire" | "cross";

/** Region-B shapes for a division (no fill; caller wraps or fills them). */
function divisionShapes(div: Division): string {
  switch (div) {
    case "pale":
      return `<rect x="50" y="0" width="50" height="120"/>`;
    case "fess":
      return `<rect x="0" y="56" width="100" height="64"/>`;
    case "bend":
      return `<path d="${poly([[0, 0], [100, 120], [0, 120]])}"/>`;
    case "chevron":
      return `<path d="${poly([[0, 120], [0, 74], [50, 44], [100, 74], [100, 120]])}"/>`;
    case "quarterly":
      return (
        `<rect x="50" y="0" width="50" height="58"/>` +
        `<rect x="0" y="58" width="50" height="62"/>`
      );
    default:
      return "";
  }
}

/** Overlay painting tincture B over the division's B region. */
function divisionOverlay(div: Division, hexB: string): string {
  const shapes = divisionShapes(div);
  return shapes ? `<g fill="${hexB}">${shapes}</g>` : "";
}

function ordinaryShape(ord: Ordinary, hex: string): string {
  switch (ord) {
    case "pale":
      return `<rect x="36" y="0" width="28" height="120" fill="${hex}"/>`;
    case "fess":
      return `<rect x="0" y="42" width="100" height="26" fill="${hex}"/>`;
    case "bend":
      return `<path d="${poly([[0, 0], [24, 0], [100, 96], [100, 120], [78, 120]])}" fill="${hex}"/>`;
    case "chevron":
      return `<path d="${poly([[0, 96], [50, 52], [100, 96], [100, 74], [50, 30], [0, 74]])}" fill="${hex}"/>`;
    case "chief":
      return `<rect x="0" y="0" width="100" height="30" fill="${hex}"/>`;
    case "saltire":
      return (
        `<path d="${poly([[0, 0], [18, 0], [100, 104], [100, 120], [84, 120]])}" fill="${hex}"/>` +
        `<path d="${poly([[100, 0], [82, 0], [0, 104], [0, 120], [16, 120]])}" fill="${hex}"/>`
      );
    case "cross":
      return (
        `<rect x="38" y="0" width="24" height="120" fill="${hex}"/>` +
        `<rect x="0" y="34" width="100" height="24" fill="${hex}"/>`
      );
  }
}

// --------------------------------------------------------------------------
// The generator
// --------------------------------------------------------------------------

export function bannerSVG(seed: string, size = 96): string {
  const rng = new Rng("banner|" + seed, "banner:" + seed);
  const id = "b" + (fnv1a("banner|" + seed) >>> 0).toString(36) + "x" + Math.round(size).toString(36);

  const pickTincture = (metal: boolean, exclude?: string): Tincture => {
    const pool = (metal ? METALS : COLOURS).filter((t) => t.key !== exclude);
    return rng.pick(pool);
  };

  const fieldMetal = rng.chance(0.42);
  const fieldA = pickTincture(fieldMetal);

  const division: Division = rng.weightedPairs([
    ["plain", 4.2],
    ["pale", 1.1],
    ["fess", 1.1],
    ["bend", 0.9],
    ["chevron", 0.9],
    ["quarterly", 1.4],
  ] as const);

  let fieldB: Tincture | null = null;
  if (division !== "plain") {
    // Divided fields prefer contrast of class; same-class pairs allowed rarely.
    fieldB = rng.chance(0.8) ? pickTincture(!fieldMetal) : pickTincture(fieldMetal, fieldA.key);
  }

  let ordinary: Ordinary | null = null;
  if (division === "plain" && rng.chance(0.38)) {
    ordinary = rng.pick(["pale", "fess", "bend", "chevron", "chief", "saltire", "cross"] as const);
  }
  const ordTincture = ordinary ? pickTincture(!fieldMetal) : null;

  // Charge: what stands at the centre, and what colour contrasts behind it.
  const centreBehindMetal =
    ordinary && ordinary !== "chief" && ordinary !== "saltire" && ordinary !== "cross"
      ? ordTincture!.metal
      : fieldMetal;
  let chargeMode: "single" | "trio" | "none" = "single";
  if (ordinary === "saltire" || ordinary === "cross") chargeMode = "none";
  else if (ordinary && rng.chance(0.42)) chargeMode = "none";
  else if (division === "plain" && !ordinary && rng.chance(0.18)) chargeMode = "trio";

  const outline = `#1e1a16`;
  const chargeKey = rng.pick(CHARGE_KEYS);
  // A charge straddling a metal+colour division would clash with one half;
  // heraldry's answer is to counterchange it. Same-class divisions can carry
  // a contrasting charge whole, so counterchange is only an occasional flourish.
  const counterchanged =
    division !== "plain" &&
    fieldB !== null &&
    (fieldB.metal !== fieldA.metal ? rng.chance(0.9) : rng.chance(0.25));

  let chargeMarkup = "";
  if (chargeMode === "single") {
    const cy = ordinary === "chief" ? 66 : 56;
    const place = (inner: string) =>
      `<g transform="translate(${n(50 - 33)} ${n(cy - 33)}) scale(0.66)" data-charge="${chargeKey}">` +
      `<g stroke="${outline}" stroke-opacity="0.35" stroke-width="2" stroke-linejoin="round">${inner}</g></g>`;
    if (counterchanged && fieldB) {
      // Counterchange: tincture B over region A, tincture A over region B.
      const clipId = id + "cc";
      chargeMarkup =
        `<clipPath id="${clipId}">${divisionShapes(division)}</clipPath>` +
        place(CHARGES[chargeKey](fieldB.hex, fieldA.hex)) +
        `<g clip-path="url(#${clipId})">${place(CHARGES[chargeKey](fieldA.hex, fieldB.hex))}</g>`;
    } else {
      const chargeT = pickTincture(!centreBehindMetal);
      const accent = ordinary && ordinary !== "chief" ? ordTincture!.hex : fieldA.hex;
      chargeMarkup = place(CHARGES[chargeKey](chargeT.hex, accent));
    }
  } else if (chargeMode === "trio") {
    const chargeT = pickTincture(!fieldMetal);
    const draw = CHARGES[chargeKey](chargeT.hex, fieldA.hex);
    const spots: [number, number][] = [
      [29, 36],
      [71, 36],
      [50, 78],
    ];
    chargeMarkup = spots
      .map(
        ([x, y]) =>
          `<g transform="translate(${n(x - 15)} ${n(y - 15)}) scale(0.3)" data-charge="${chargeKey}">` +
          `<g stroke="${outline}" stroke-opacity="0.35" stroke-width="3" stroke-linejoin="round">${draw}</g></g>`,
      )
      .join("");
  }

  let border = "";
  if (rng.chance(0.28)) {
    const borderT = pickTincture(!fieldMetal, ordTincture?.key);
    border = `<path d="${SHIELD_D}" fill="none" stroke="${borderT.hex}" stroke-width="7"/>`;
  }

  const w = Math.max(8, Math.round(size));
  const h = Math.round(w * 1.2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 100 120" role="img">` +
    `<clipPath id="${id}"><path d="${SHIELD_D}"/></clipPath>` +
    `<g clip-path="url(#${id})">` +
    `<rect x="0" y="0" width="100" height="120" fill="${fieldA.hex}"/>` +
    (fieldB ? divisionOverlay(division, fieldB.hex) : "") +
    (ordinary && ordTincture ? ordinaryShape(ordinary, ordTincture.hex) : "") +
    chargeMarkup +
    border +
    // Quiet depth: a light kiss at the top edge, a shadow toward the point.
    `<path d="M 8 10 L 92 10 L 92 20 C 64 14, 36 14, 8 20 Z" fill="#ffffff" opacity="0.1"/>` +
    `<path d="M 50 113 C 66 100, 78 88, 88 66 L 92 52 L 92 78 C 84 98, 68 108, 50 113 Z" fill="#000000" opacity="0.12"/>` +
    `</g>` +
    `<path d="${SHIELD_D}" fill="none" stroke="#241f1c" stroke-width="3" stroke-linejoin="round"/>` +
    `</svg>`
  );
}
