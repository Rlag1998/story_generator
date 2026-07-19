/**
 * FaceMetrics: the single numeric model of a face.
 *
 * Everything the renderer draws is computed here, continuously, from the
 * phenotype + sex + age. Discrete gene indices choose archetype parameter
 * sets; the parameters are then blended with build, sex and age so that
 * kin who share alleles visibly share bone structure at every age.
 */

import { EYE_COLORS, HAIR_COLORS, skinHex, lerpHex } from "../core/appearance";
import type { Phenotype, Sex } from "../core/types";
import { Dice, idToken, phenotypeKey } from "./dice";
import { clamp, clamp01, idx, lerp } from "./paths";
import {
  AGE_WHITE,
  BG_TONES,
  CLOTH_TONES,
  MOON_PALE_EYE,
  MOON_PALE_HAIR,
  MOON_PALE_SKIN,
  SILVER_STREAK,
  SILVER_STREAK_ON_LIGHT,
  shade,
  tint,
} from "./color";

// --------------------------------------------------------------------------
// Face archetypes (faceShape 0..5) — the coarse family silhouette.
// --------------------------------------------------------------------------

interface Arch {
  skull: number; // half-width at the temples
  cheek: number; // half-width at the cheekbones
  jaw: number; // half-width at the jaw corners
  chin: number; // half-width of the chin pad
  len: number; // face length multiplier
  curve: number; // 0 chiselled chin .. 1 round chin
  cheekY: number; // relative height of the widest point
  jowl: number; // outward fullness near the jaw
}

const FACE_ARCHES: readonly Arch[] = [
  { skull: 15.4, cheek: 17.0, jaw: 13.4, chin: 6.2, len: 1.0, curve: 0.55, cheekY: 0.5, jowl: 0.08 }, // oval
  { skull: 16.4, cheek: 18.4, jaw: 15.2, chin: 8.2, len: 0.92, curve: 0.85, cheekY: 0.54, jowl: 0.22 }, // round
  { skull: 16.0, cheek: 17.4, jaw: 16.0, chin: 9.6, len: 0.97, curve: 0.3, cheekY: 0.5, jowl: 0.16 }, // square
  { skull: 16.8, cheek: 17.7, jaw: 12.4, chin: 5.2, len: 0.98, curve: 0.42, cheekY: 0.44, jowl: 0.05 }, // heart
  { skull: 14.8, cheek: 15.8, jaw: 12.6, chin: 6.0, len: 1.1, curve: 0.5, cheekY: 0.5, jowl: 0.06 }, // long
  { skull: 14.0, cheek: 18.2, jaw: 12.2, chin: 5.4, len: 1.04, curve: 0.42, cheekY: 0.5, jowl: 0.04 }, // diamond
];

/** Jaw variants (jawShape 0..4) applied on top of the face archetype. */
const JAW_MODS = [
  { jaw: 0.3, chin: 0.8, curve: 0.2, jowl: 0.04, len: 0 }, // soft
  { jaw: -0.9, chin: -0.8, curve: -0.05, jowl: 0, len: 0 }, // tapered
  { jaw: 1.5, chin: 1.9, curve: -0.28, jowl: 0.05, len: 0 }, // squared
  { jaw: -1.5, chin: -1.7, curve: -0.18, jowl: 0, len: 0.04 }, // pointed
  { jaw: 2.3, chin: 1.2, curve: 0.1, jowl: 0.24, len: 0 }, // heavy
] as const;

/** Nose variants (noseShape 0..5). */
const NOSE_VARIANTS = [
  { len: 1.0, wing: 2.6, bump: 0.0, tipUp: 0.0, bw: 1.0 }, // straight
  { len: 0.95, wing: 3.6, bump: 0.05, tipUp: 0.0, bw: 1.35 }, // broad
  { len: 1.1, wing: 2.7, bump: 0.55, tipUp: -0.3, bw: 1.05 }, // aquiline
  { len: 0.85, wing: 2.9, bump: -0.35, tipUp: 0.6, bw: 1.0 }, // snub
  { len: 1.18, wing: 2.4, bump: 0.35, tipUp: -0.6, bw: 0.92 }, // hawk
  { len: 1.0, wing: 3.3, bump: 0.1, tipUp: 0.2, bw: 1.2 }, // flared
] as const;

/** Mouth variants (mouthShape 0..4). */
const MOUTH_VARIANTS = [
  { full: 1.0, hw: 5.4, curve: 0.4, bow: 0.9 }, // full
  { full: 0.45, hw: 4.7, curve: 0.2, bow: 0.4 }, // thin
  { full: 0.8, hw: 6.5, curve: 0.5, bow: 0.6 }, // wide
  { full: 0.9, hw: 4.8, curve: 0.3, bow: 1.6 }, // bow
  { full: 0.6, hw: 5.2, curve: -0.7, bow: 0.5 }, // stern
] as const;

/** Ear variants (earShape 0..3). */
const EAR_VARIANTS = [
  { rx: 2.5, ry: 4.0, out: 0.3, tip: false }, // small
  { rx: 2.9, ry: 4.7, out: 0.5, tip: false }, // medium
  { rx: 3.3, ry: 5.5, out: 1.0, tip: false }, // large / stick-out
  { rx: 3.0, ry: 5.0, out: 0.7, tip: true }, // subtly peaked
] as const;

// --------------------------------------------------------------------------
// Hairstyles
// --------------------------------------------------------------------------

export interface HairStyle {
  key: string;
  /** Back length: 0 none, 1 chin, 2 shoulder, 3 chest. */
  back: 0 | 1 | 2 | 3;
  vol: number; // silhouette volume
  fringe: number; // hairline variant 0 bang, 1 arc, 2 part, 3 sweep, 4 peak
  tail?: boolean; // tied-back tail behind the neck
  braid?: boolean; // braid falling over one shoulder
}

export const HAIR_STYLES: readonly HairStyle[] = [
  { key: "cropped", back: 0, vol: 0.05, fringe: 1 },
  { key: "tousled", back: 0, vol: 0.11, fringe: 0 },
  { key: "parted", back: 0, vol: 0.09, fringe: 2 },
  { key: "swept", back: 0, vol: 0.1, fringe: 3 },
  { key: "chin-loose", back: 1, vol: 0.11, fringe: 2 },
  { key: "tied-back", back: 0, vol: 0.045, fringe: 2, tail: true },
  { key: "shoulder-loose", back: 2, vol: 0.12, fringe: 1 },
  { key: "long-flowing", back: 3, vol: 0.13, fringe: 2 },
  { key: "braided", back: 2, vol: 0.06, fringe: 2, braid: true },
];

const STYLE_WEIGHTS_M = [3, 3, 2.2, 1.8, 1.2, 1.4, 0.7, 0.35, 0.15] as const;
const STYLE_WEIGHTS_F = [0.25, 0.5, 1.2, 0.8, 2.2, 2.2, 3, 2.6, 2.2] as const;

/** Beard kinds. */
export const BEARDS = ["none", "stubble", "mustache", "goatee", "short", "full", "long"] as const;
export type BeardKind = (typeof BEARDS)[number];

// --------------------------------------------------------------------------
// The metrics object
// --------------------------------------------------------------------------

export interface FaceMetrics {
  id: string; // token for element ids
  dice: Dice;

  // resolved colors
  bg: string;
  skin: string;
  skinShadow: string;
  skinHi: string;
  blush: string;
  line: string;
  hair: string;
  hairDark: string;
  brow: string;
  beardColor: string;
  eyeL: string;
  eyeR: string;
  sclera: string;
  lip: string;
  lipDark: string;
  clothA: string;
  clothB: string;
  freckle: string;
  streak: string | null;

  // life morph
  child: number; // 1 infant .. 0 adult
  elder: number; // 0 adult .. 1 ancient (0 for unaging)
  greyT: number;
  bustScale: number;

  // head structure (viewBox units, face centred on cx)
  cx: number;
  topY: number;
  chinY: number;
  faceLen: number;
  skullHW: number;
  templeY: number;
  cheekHW: number;
  cheekY: number;
  jawHW: number;
  jawY: number;
  chinHW: number;
  chinCurve: number;
  jowl: number;

  // features
  browY: number;
  browShape: number;
  browWeight: number;
  eyeY: number;
  eyeDX: number;
  eyeW: number;
  eyeH: number;
  eyeTiltDeg: number;
  irisR: number;
  pupilR: number;
  noseTop: number;
  noseLen: number;
  noseWing: number;
  noseBump: number;
  noseTipUp: number;
  noseBW: number;
  mouthY: number;
  mouthHW: number;
  lipFull: number;
  mouthCurve: number;
  bowDepth: number;
  earY: number;
  earX: number;
  earRX: number;
  earRY: number;
  earTip: boolean;
  neckHW: number;
  shoulderHW: number;
  shoulderY: number;

  // styling
  sex: Sex;
  texture: number; // 0 straight 1 wavy 2 curly 3 coiled
  style: HairStyle;
  hairlineY: number;
  fringe: number;
  recess: number; // 0..1 hairline recession
  baldCrown: boolean;
  beard: BeardKind;
  lashes: boolean;

  // rare traits
  moonPale: boolean;
  nightEyed: boolean;
  mismatched: boolean;
  silverStreak: boolean;
  unaging: boolean;

  freckles: boolean;
  dimples: boolean;
  cleftChin: boolean;
}

export function faceMetrics(ph: Phenotype, sex: Sex, ageYears: number, size: number): FaceMetrics {
  const key = phenotypeKey(ph, sex);
  const dice = new Dice(key);
  const id = idToken(key + "|" + Math.round(ageYears * 4) + "|" + size);

  const age = clamp(Number.isFinite(ageYears) ? ageYears : 30, 0, 110);
  const has = (t: string) => ph.rareTraits.includes(t);
  const moonPale = has("moon-pale");
  const unaging = has("unaging");
  const nightEyed = has("night-eyed");
  const mismatched = has("mismatched-eyes");
  const silverStreak = has("silver-streak");

  // -- life morph ----------------------------------------------------------
  const child = clamp01((15 - age) / 15);
  const elderRaw = clamp01((age - 46) / 32);
  const elder = unaging ? 0 : elderRaw;
  const greyOnset = 40 + dice.r("grey-onset") * 14;
  const greyFull = greyOnset + 26 + dice.r("grey-full") * 12;
  let greyT = clamp01((age - greyOnset) / (greyFull - greyOnset));
  if (unaging) greyT *= 0.45;
  const bustScale = 1 - 0.22 * child;

  // -- structural blend ----------------------------------------------------
  const A = FACE_ARCHES[idx(ph.faceShape, FACE_ARCHES.length)];
  const J = JAW_MODS[idx(ph.jawShape, JAW_MODS.length)];
  const build = clamp(ph.buildScore, -3, 3);
  const height = clamp(ph.heightScore, -3, 3);

  const wf = (1 + build * 0.022) * (1 - 0.05 * child) * (sex === "m" ? 1.02 : 0.985);
  const lenF = (A.len + J.len) * (1 - 0.15 * child) * (1 + height * 0.006);

  const cx = 50;
  const faceLen = 46 * lenF + elder * 0.8;
  const headCenterY = 42 - height * 0.6 + child * 4.2;
  const topY = headCenterY - faceLen * 0.52;
  const chinY = headCenterY + faceLen * 0.48 + elder * 0.7;

  const skullHW = A.skull * wf;
  const cheekHW = (A.cheek + 0.5 * child - 0.45 * elder * (build < 0 ? 1 : 0.3)) * wf;
  const jawHW = (A.jaw + J.jaw + (sex === "m" ? 0.55 : 0) + 0.6 * child) * wf;
  const chinHW = (A.chin + J.chin + (sex === "m" ? 0.4 : 0)) * wf * (1 - 0.1 * child);
  const chinCurve = clamp01(A.curve + J.curve + 0.3 * child);
  const jowl = clamp(A.jowl + J.jowl + Math.max(0, build) * 0.06 + elder * 0.14 * (build > -1 ? 1 : 0.3), 0, 0.7);

  const templeY = topY + faceLen * 0.3;
  const cheekY = topY + faceLen * (0.52 + (A.cheekY - 0.5) * 0.16);
  const jawY = topY + faceLen * 0.78;

  // -- eyes ----------------------------------------------------------------
  const browShape = idx(ph.browShape, 5);
  const faceShape = idx(ph.faceShape, 6);
  const eyeY = topY + faceLen * (0.52 + 0.045 * child);
  const eyeDX = cheekHW * 0.47;
  const eyeW = 3.85 * (1 + 0.1 * child) * (1 + (idx(ph.mouthShape, 5) === 2 ? 0.03 : 0));
  const eyeRound =
    (faceShape === 1 ? 0.55 : faceShape === 3 ? 0.2 : faceShape === 4 ? -0.2 : faceShape === 5 ? -0.1 : 0) +
    (browShape === 4 ? -0.3 : browShape === 2 ? -0.15 : 0);
  const eyeH = (2.15 + eyeRound * 0.7) * (1 + 0.42 * child) * (1 - 0.16 * elder);
  const eyeTiltDeg = [2, 4, 7, 3, 1][browShape] * (1 - 0.4 * child);
  const irisR = eyeH * 0.86 * (nightEyed ? 1.06 : 1);
  const pupilR = irisR * (nightEyed ? 0.82 : 0.45);

  // -- brows ---------------------------------------------------------------
  const browLift = [1.2, 1.7, 1.4, 1.6, 0.6][browShape];
  const browY = eyeY - (3.2 - 0.7 * child) - browLift * 0.7;
  const browWeight = ([1.35, 1.2, 1.5, 0.9, 1.95][browShape] + (sex === "m" ? 0.25 : 0)) * (1 - 0.35 * child);

  // -- nose ----------------------------------------------------------------
  const NV = NOSE_VARIANTS[idx(ph.noseShape, NOSE_VARIANTS.length)];
  const noseTop = eyeY + 1.2;
  const noseLen = faceLen * 0.205 * NV.len * (1 - 0.3 * child);
  const noseWing = NV.wing * wf * (1 - 0.28 * child);
  const noseBump = NV.bump * (1 - 0.7 * child) + elder * 0.08;
  const noseTipUp = NV.tipUp + 0.5 * child;
  const noseBW = NV.bw * (1 - 0.2 * child);

  // -- mouth ---------------------------------------------------------------
  const MV = MOUTH_VARIANTS[idx(ph.mouthShape, MOUTH_VARIANTS.length)];
  const noseBase = noseTop + noseLen;
  const mouthY = noseBase + (chinY - noseBase) * 0.42;
  const mouthHW = MV.hw * 1.12 * wf * (1 - 0.18 * child);
  const lipFull = MV.full * (1 - 0.18 * child) * (1 - 0.35 * elder) * (sex === "f" ? 1.12 : 1);
  const mouthCurve = MV.curve + 0.25 * child - 0.35 * elder;
  const bowDepth = MV.bow;

  // -- ears / neck / shoulders --------------------------------------------
  const EV = EAR_VARIANTS[idx(ph.earShape, EAR_VARIANTS.length)];
  const earY = eyeY + 0.6;
  const earX = cheekHW + EV.out;
  const earRX = EV.rx * (1 - 0.12 * child);
  const earRY = EV.ry * (1 - 0.12 * child);
  const neckHW = (6.7 + build * 0.36 + (sex === "m" ? 0.55 : 0)) * (1 - 0.2 * child);
  const shoulderHW = (40 + build * 1.3 + (sex === "m" ? 1.6 : -0.8)) * (1 - 0.16 * child);
  const shoulderY = 72.5 + 2.2 * child;

  // -- resolved colors -----------------------------------------------------
  const skinBase = moonPale ? MOON_PALE_SKIN : skinHex(ph.skinTone);
  const skin = skinBase;
  const skinShadow = moonPale ? lerpHex(skin, "#6d5f74", 0.24) : shade(skin, 0.22);
  const skinHi = tint(skin, 0.12);
  const blush = lerpHex(skin, "#c96f5e", 0.5);
  const line = moonPale ? lerpHex(skin, "#4b3d4e", 0.62) : lerpHex(skin, "#2b1710", 0.58);

  const hairBaseHex = moonPale
    ? MOON_PALE_HAIR
    : HAIR_COLORS[idx(ph.hairColor, HAIR_COLORS.length)].hex;
  const hair = moonPale ? hairBaseHex : lerpHex(hairBaseHex, AGE_WHITE, greyT);
  const hairDark = lerpHex(hair, "#181310", moonPale || greyT > 0.6 ? 0.22 : 0.38);
  const brow = moonPale
    ? "#cac6ce"
    : lerpHex(lerpHex(hairBaseHex, "#241a12", 0.42), "#cfcabd", greyT * 0.9);
  const beardColor = moonPale
    ? lerpHex(hairBaseHex, "#b9b6bf", 0.35)
    : lerpHex(
        lerpHex(hairBaseHex, "#6a4326", dice.r("beard-warm") * 0.18),
        AGE_WHITE,
        clamp01(greyT * 1.15),
      );

  const eyeIdx = idx(ph.eyeColor, EYE_COLORS.length);
  const eyeMain = moonPale ? MOON_PALE_EYE : EYE_COLORS[eyeIdx].hex;
  let eyeR = eyeMain;
  if (mismatched && !moonPale) {
    const alt = (eyeIdx + 1 + dice.int("mismatch", EYE_COLORS.length - 1)) % EYE_COLORS.length;
    eyeR = EYE_COLORS[alt].hex;
  }
  const sclera = moonPale ? "#f9f2f0" : "#f6f1e4";
  const lip = lerpHex(
    skin,
    moonPale ? "#c9848c" : "#9c4a44",
    0.28 + lipFull * 0.14 + (sex === "f" ? 0.1 : 0),
  );
  const lipDark = lerpHex(lip, "#5c2622", 0.4);
  const clothA = dice.pick("cloth", CLOTH_TONES);
  const clothB = lerpHex(clothA, "#171512", 0.3);
  const freckle = lerpHex(skin, "#4c2c16", 0.42);
  const lightHair = moonPale || greyT > 0.55 || idx(ph.hairColor, HAIR_COLORS.length) >= 8;
  const streak = silverStreak ? (lightHair ? SILVER_STREAK_ON_LIGHT : SILVER_STREAK) : null;

  // -- hair styling --------------------------------------------------------
  const texture = idx(ph.hairTexture, 4);
  let styleI = dice.weighted("style", sex === "m" ? STYLE_WEIGHTS_M : STYLE_WEIGHTS_F);
  if (age < 3) styleI = 0; // infants: soft wisps
  else if (age < 8 && HAIR_STYLES[styleI].back === 3) styleI = 6; // small children: not floor-length
  let style = HAIR_STYLES[styleI];
  // Curls and coils carry their length in volume rather than hang.
  let vol = style.vol * (texture === 2 ? 1.7 : texture === 3 ? 2.4 : 1) * (1 - 0.35 * child);
  if (texture === 3 && style.back === 3) style = { ...style, back: 2 };
  style = { ...style, vol };

  let fringe = style.fringe;
  if (dice.chance("widows-peak", 0.14) && fringe !== 0) fringe = 4;

  // Hairline recession / thinning: some elder males, deterministically.
  let recess = 0;
  let baldCrown = false;
  if (sex === "m" && elder > 0.05 && dice.chance("bald", 0.48)) {
    recess = clamp01(elder * (0.55 + dice.r("bald-amt") * 0.75));
    baldCrown = recess > 0.62 && dice.chance("bald-crown", 0.6);
  }
  const hairlineY = browY - (4.7 + dice.r("forehead") * 1.9) * (1 - 0.12 * child) - recess * 4.5;

  // -- beard ---------------------------------------------------------------
  let beard: BeardKind = "none";
  if (sex === "m" && age >= 17 && !dice.chance("shaven", 0.42)) {
    if (age < 20) beard = dice.chance("youth-beard", 0.6) ? "stubble" : "mustache";
    else {
      const w = [1.6, 1.4, 1.5, 2.2, 2.0, age > 45 ? 1.1 : 0.35];
      beard = (["stubble", "mustache", "goatee", "short", "full", "long"] as const)[
        dice.weighted("beard", w)
      ];
    }
  }
  const lashes = sex === "f" && age > 9;

  return {
    id,
    dice,
    bg: dice.pick("bg", BG_TONES),
    skin,
    skinShadow,
    skinHi,
    blush,
    line,
    hair,
    hairDark,
    brow,
    beardColor,
    eyeL: eyeMain,
    eyeR,
    sclera,
    lip,
    lipDark,
    clothA,
    clothB,
    freckle,
    streak,
    child,
    elder,
    greyT,
    bustScale,
    cx,
    topY,
    chinY,
    faceLen,
    skullHW,
    templeY,
    cheekHW,
    cheekY,
    jawHW,
    jawY,
    chinHW,
    chinCurve,
    jowl,
    browY,
    browShape,
    browWeight,
    eyeY,
    eyeDX,
    eyeW,
    eyeH,
    eyeTiltDeg,
    irisR,
    pupilR,
    noseTop,
    noseLen,
    noseWing,
    noseBump,
    noseTipUp,
    noseBW,
    mouthY,
    mouthHW,
    lipFull,
    mouthCurve,
    bowDepth,
    earY,
    earX,
    earRX,
    earRY,
    earTip: EV.tip,
    neckHW,
    shoulderHW,
    shoulderY,
    sex,
    texture,
    style,
    hairlineY,
    fringe,
    recess,
    baldCrown,
    beard,
    lashes,
    moonPale,
    nightEyed,
    mismatched,
    silverStreak,
    unaging,
    freckles: ph.freckles,
    dimples: ph.dimples,
    cleftChin: ph.cleftChin,
  };
}
