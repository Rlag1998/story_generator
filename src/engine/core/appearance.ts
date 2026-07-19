/**
 * Canonical appearance vocabularies shared by genetics (which assigns them),
 * portraits (which draws them), and narrative (which describes them).
 * Indices in Phenotype refer into these tables.
 */

export interface ColorEntry {
  key: string;
  name: string; // narrative name, e.g. "chestnut"
  hex: string; // portrait color
}

export const HAIR_COLORS: ColorEntry[] = [
  { key: "black", name: "black", hex: "#1b1b20" },
  { key: "dark-brown", name: "dark brown", hex: "#3a2a1d" },
  { key: "brown", name: "brown", hex: "#5c4327" },
  { key: "chestnut", name: "chestnut", hex: "#6f4a2f" },
  { key: "auburn", name: "auburn", hex: "#7d3b22" },
  { key: "red", name: "flame-red", hex: "#a04422" },
  { key: "golden", name: "golden", hex: "#c8973f" },
  { key: "flaxen", name: "flaxen", hex: "#d9b877" },
  { key: "ash", name: "ash-fair", hex: "#c9bd9e" },
  { key: "white", name: "white", hex: "#e8e4da" }, // moon-pale / age
];

export const EYE_COLORS: ColorEntry[] = [
  { key: "dark", name: "near-black", hex: "#2a1f18" },
  { key: "brown", name: "brown", hex: "#5b3a21" },
  { key: "amber", name: "amber", hex: "#9a6b2f" },
  { key: "hazel", name: "hazel", hex: "#6e6432" },
  { key: "green", name: "green", hex: "#4c6b3c" },
  { key: "grey", name: "grey", hex: "#7d8492" },
  { key: "blue", name: "blue", hex: "#4a6d94" },
  { key: "pale", name: "glacier-pale", hex: "#9db4c0" },
  { key: "violet", name: "violet", hex: "#6d5a8c" }, // rare
];

export const HAIR_TEXTURES = ["straight", "wavy", "curly", "coiled"] as const;

/** Skin tone 0..1 maps onto this ramp (portraits interpolate). */
export const SKIN_RAMP: [number, string][] = [
  [0.0, "#f3ddc8"],
  [0.2, "#eac9a8"],
  [0.4, "#d9a97f"],
  [0.6, "#b97f56"],
  [0.8, "#8d5a3b"],
  [1.0, "#5d3a26"],
];

export interface RareTraitDef {
  key: string;
  name: string; // display, e.g. "Moon-pale"
  description: string;
  /** visible: shows in portraits; hidden: temperament/constitution only. */
  visible: boolean;
}

export const RARE_TRAITS: RareTraitDef[] = [
  { key: "moon-pale", name: "Moon-pale", visible: true, description: "Born without color — chalk skin, white hair, eyes like rose glass. Folk call them omen-touched." },
  { key: "mismatched-eyes", name: "Mismatched eyes", visible: true, description: "Each eye a different color. Said to see two worlds at once." },
  { key: "silver-streak", name: "Silver streak", visible: true, description: "A lock of silver hair from birth, passed down some lines like a signature." },
  { key: "giants-blood", name: "Giant's blood", visible: true, description: "Towers head and shoulders above others; doorways are the enemy." },
  { key: "six-fingered", name: "Six-fingered", visible: true, description: "A sixth finger on one hand. Feared by some, prized by glovers." },
  { key: "caul-born", name: "Caul-born", visible: false, description: "Born behind the veil. Midwives keep the caul; sailors pay silver for it." },
  { key: "the-sight", name: "The Sight", visible: false, description: "Prone to visions and true-seeming dreams. Temples argue over them." },
  { key: "iron-constitution", name: "Iron constitution", visible: false, description: "Shrugs off fevers that fell whole households." },
  { key: "glass-bones", name: "Glass bones", visible: false, description: "Bones that break at a stumble. A careful, watchful life." },
  { key: "wolfs-hunger", name: "Wolf's hunger", visible: false, description: "An appetite that no table survives; a metabolism like a forge." },
  { key: "unaging", name: "Unaging face", visible: true, description: "Time forgets the face; at fifty they are carded at the tavern." },
  { key: "night-eyed", name: "Night-eyed", visible: true, description: "Huge dark pupils; sees by starlight, squints at noon." },
];

export function rareTraitDef(key: string): RareTraitDef | undefined {
  return RARE_TRAITS.find((t) => t.key === key);
}

export function skinHex(tone: number): string {
  const t = Math.max(0, Math.min(1, tone));
  for (let i = 1; i < SKIN_RAMP.length; i++) {
    if (t <= SKIN_RAMP[i][0]) {
      const [t0, c0] = SKIN_RAMP[i - 1];
      const [t1, c1] = SKIN_RAMP[i];
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return lerpHex(c0, c1, f);
    }
  }
  return SKIN_RAMP[SKIN_RAMP.length - 1][1];
}

export function lerpHex(a: string, b: string, f: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const out = pa.map((v, i) => Math.round(v + (pb[i] - v) * f));
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}
