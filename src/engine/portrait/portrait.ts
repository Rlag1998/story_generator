/**
 * portraitSVG: a complete, standalone bust portrait as an SVG string.
 *
 * Pure deterministic function of (phenotype, sex, ageYears, size).
 * Layer order (background to foreground):
 *   disc, neck, garment, back hair, ears, head + shading, freckles,
 *   age lines, beard, mouth, mustache, marks, nose, eyes, brows, hair cap.
 */

import type { Phenotype, Sex } from "../core/types";
import { faceMetrics } from "./metrics";
import { background, ears, garment, headPathD, headWithShading, neck } from "./head";
import { brows, eyes, freckles, marks, mouth, nose, wrinkles } from "./features";
import { beardBase, hairBack, hairCap, infantWisps, mustache } from "./hair";
import { n } from "./paths";

export function portraitSVG(ph: Phenotype, sex: Sex, ageYears: number, size = 160): string {
  const m = faceMetrics(ph, sex, ageYears, size);
  const headD = headPathD(m);
  const infant = ageYears < 3;

  const bust: string[] = [];
  bust.push(neck(m));
  bust.push(garment(m));
  bust.push(hairBack(m));
  bust.push(ears(m));
  bust.push(headWithShading(m, headD));
  bust.push(freckles(m));
  bust.push(wrinkles(m));
  bust.push(beardBase(m));
  bust.push(mouth(m));
  bust.push(mustache(m));
  bust.push(marks(m));
  bust.push(nose(m));
  bust.push(eyes(m));
  bust.push(brows(m));
  bust.push(infant ? infantWisps(m) : hairCap(m));

  // Children sit smaller in the frame; the bust scales toward its base.
  const scale =
    m.bustScale === 1
      ? ""
      : ` transform="translate(50 97) scale(${n(m.bustScale)}) translate(-50 -97)"`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(size)}" height="${n(size)}" ` +
    `viewBox="0 0 100 100" role="img">` +
    `<clipPath id="${m.id}d"><circle cx="50" cy="50" r="47"/></clipPath>` +
    background(m) +
    `<g clip-path="url(#${m.id}d)">` +
    `<g${scale}>` +
    bust.join("") +
    `</g></g>` +
    `</svg>`
  );
}
