/**
 * Portrait palette helpers: warm flat-vector tones derived from the shared
 * appearance tables so genetics, portraits and narrative all agree.
 */

import { lerpHex } from "../core/appearance";

/** Darken toward a warm sepia (keeps skin shadows warm, never muddy grey). */
export function shade(hex: string, f: number): string {
  return lerpHex(hex, "#3a2014", f);
}

/** Lighten toward warm ivory. */
export function tint(hex: string, f: number): string {
  return lerpHex(hex, "#fff8ee", f);
}

/** Hair colours override tables (portrait-side, referenced by tests). */
export const MOON_PALE_SKIN = "#f6ece4";
export const MOON_PALE_HAIR = "#eef0f2"; // cool white against the warm skin
export const MOON_PALE_EYE = "#c78f9b"; // rose glass
export const SILVER_STREAK = "#dcdfe4";
export const SILVER_STREAK_ON_LIGHT = "#b3bac4";
export const AGE_WHITE = "#e8e4da"; // matches HAIR_COLORS "white"

/** Background disc tones: quiet parchment variations. */
export const BG_TONES = [
  "#e8dfcd",
  "#e3dbc9",
  "#ded8cc",
  "#e6ded2",
  "#e0d5c2",
  "#dcd4c7",
  "#e5d9c6",
] as const;

/** Neutral garment cloth: undyed wool, worn leather, quiet greys. */
export const CLOTH_TONES = [
  "#6f6353",
  "#67604f",
  "#5e6066",
  "#6b5a51",
  "#57604f",
  "#645c68",
  "#71685a",
  "#505860",
  "#7a6c58",
] as const;

/** Perceived luminance 0..1 of a #rrggbb hex. */
export function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export { lerpHex };
