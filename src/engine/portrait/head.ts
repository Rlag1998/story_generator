/**
 * Bust structure: background, garment, neck, head silhouette, ears, shading.
 */

import type { FaceMetrics } from "./metrics";
import { n, pt, smoothClosed, type Pt } from "./paths";

/** The head outline: a smooth closed curve through the facial anchor points. */
export function headPathD(m: FaceMetrics): string {
  const { cx } = m;
  const chinCornerY = m.chinY - Math.max(1.4, m.chinHW * 0.42);
  const jowlX = m.jawHW + m.jowl * 2.4;
  const chinK = 0.55 + m.chinCurve * 0.75; // round chins curve, square chins corner
  const pts: Pt[] = [
    pt(cx, m.topY),
    pt(cx + m.skullHW * 0.62, m.topY + m.faceLen * 0.055),
    pt(cx + m.skullHW, m.templeY),
    pt(cx + m.cheekHW, m.cheekY),
    pt(cx + jowlX, m.jawY, 0.9 + m.jowl * 0.7),
    pt(cx + m.chinHW, chinCornerY, chinK),
    pt(cx, m.chinY, 0.7 + m.chinCurve * 0.5),
    pt(cx - m.chinHW, chinCornerY, chinK),
    pt(cx - jowlX, m.jawY, 0.9 + m.jowl * 0.7),
    pt(cx - m.cheekHW, m.cheekY),
    pt(cx - m.skullHW, m.templeY),
    pt(cx - m.skullHW * 0.62, m.topY + m.faceLen * 0.055),
  ];
  return smoothClosed(pts);
}

/** Background disc with a whisper of an inner ring. */
export function background(m: FaceMetrics): string {
  return (
    `<circle cx="50" cy="50" r="47" fill="${m.bg}"/>` +
    `<circle cx="50" cy="50" r="44.5" fill="none" stroke="#2b2118" stroke-opacity="0.05" stroke-width="2"/>`
  );
}

/** Neck column + soft shadow cast by the chin. */
export function neck(m: FaceMetrics): string {
  const { cx } = m;
  const top = m.chinY - 8;
  const bot = m.shoulderY + 3;
  const w0 = m.neckHW;
  const w1 = m.neckHW * 1.12;
  const d =
    `M ${n(cx - w0)} ${n(top)} ` +
    `C ${n(cx - w0)} ${n(top + 6)} ${n(cx - w1)} ${n(bot - 4)} ${n(cx - w1 - 0.8)} ${n(bot)} ` +
    `L ${n(cx + w1 + 0.8)} ${n(bot)} ` +
    `C ${n(cx + w1)} ${n(bot - 4)} ${n(cx + w0)} ${n(top + 6)} ${n(cx + w0)} ${n(top)} Z`;
  const shadow =
    `<path d="M ${n(cx - w0)} ${n(top)} ` +
    `C ${n(cx - w0 * 0.8)} ${n(m.chinY + 3.4)} ${n(cx + w0 * 0.8)} ${n(m.chinY + 3.4)} ${n(cx + w0)} ${n(top)} ` +
    `L ${n(cx + w0)} ${n(m.chinY + 5.4)} L ${n(cx - w0)} ${n(m.chinY + 5.4)} Z" ` +
    `fill="${m.skinShadow}" opacity="0.5"/>`;
  return `<path d="${d}" fill="${m.skin}"/>` + shadow;
}

/** Shoulders and garment: quiet cloth, a collar seam, side shading. */
export function garment(m: FaceMetrics): string {
  const { cx } = m;
  const sw = m.shoulderHW;
  const gy = m.shoulderY;
  const d =
    `M ${n(cx - sw)} 102 ` +
    `C ${n(cx - sw + 1)} ${n(gy + 10)} ${n(cx - sw * 0.74)} ${n(gy + 2.6)} ${n(cx - sw * 0.42)} ${n(gy + 0.4)} ` +
    `C ${n(cx - sw * 0.24)} ${n(gy - 0.8)} ${n(cx - 8)} ${n(gy - 1.6)} ${n(cx)} ${n(gy - 1.6)} ` +
    `C ${n(cx + 8)} ${n(gy - 1.6)} ${n(cx + sw * 0.24)} ${n(gy - 0.8)} ${n(cx + sw * 0.42)} ${n(gy + 0.4)} ` +
    `C ${n(cx + sw * 0.74)} ${n(gy + 2.6)} ${n(cx + sw - 1)} ${n(gy + 10)} ${n(cx + sw)} 102 Z`;
  const collarKind = m.dice.int("collar", 3);
  let collar = "";
  if (collarKind === 0) {
    collar = `<path d="M ${n(cx - 8.5)} ${n(gy + 0.4)} Q ${n(cx)} ${n(gy + 5)} ${n(cx + 8.5)} ${n(gy + 0.4)}" fill="none" stroke="${m.clothB}" stroke-width="1.5"/>`;
  } else if (collarKind === 1) {
    collar =
      `<path d="M ${n(cx - 9)} ${n(gy)} L ${n(cx)} ${n(gy + 9)} L ${n(cx + 9)} ${n(gy)}" fill="none" stroke="${m.clothB}" stroke-width="1.4"/>` +
      `<circle cx="${n(cx)}" cy="${n(gy + 10.6)}" r="1.1" fill="${m.clothB}"/>`;
  } else {
    collar =
      `<path d="M ${n(cx - sw * 0.5)} ${n(gy + 4)} L ${n(cx - 3)} ${n(gy + 1)}" fill="none" stroke="${m.clothB}" stroke-width="1.3"/>` +
      `<path d="M ${n(cx + sw * 0.5)} ${n(gy + 4)} L ${n(cx + 3)} ${n(gy + 1)}" fill="none" stroke="${m.clothB}" stroke-width="1.3"/>`;
  }
  return (
    `<clipPath id="${m.id}g"><path d="${d}"/></clipPath>` +
    `<path d="${d}" fill="${m.clothA}"/>` +
    `<g clip-path="url(#${m.id}g)">` +
    `<path d="${d}" fill="${m.clothB}" opacity="0.55"/>` +
    `<path d="${d}" fill="${m.clothA}" transform="translate(-2.2,-1.6)"/>` +
    `</g>` +
    collar
  );
}

/** Ears, drawn beneath the head so only their outer halves show. */
export function ears(m: FaceMetrics): string {
  const parts: string[] = [];
  for (const side of [-1, 1] as const) {
    const ex = m.cx + side * m.earX;
    const ey = m.earY;
    if (m.earTip) {
      // Teardrop with a gentle peak.
      const d =
        `M ${n(ex)} ${n(ey + m.earRY * 0.9)} ` +
        `C ${n(ex + side * m.earRX * 1.5)} ${n(ey + m.earRY * 0.55)} ${n(ex + side * m.earRX * 1.35)} ${n(ey - m.earRY * 0.15)} ` +
        `${n(ex + side * m.earRX * 0.7)} ${n(ey - m.earRY * 0.82)} ` +
        `C ${n(ex + side * m.earRX * 0.4)} ${n(ey - m.earRY * 1.12)} ${n(ex - side * m.earRX * 0.4)} ${n(ey - m.earRY * 0.7)} ` +
        `${n(ex - side * m.earRX * 0.3)} ${n(ey)} Z`;
      parts.push(`<path d="${d}" fill="${m.skin}"/>`);
    } else {
      parts.push(
        `<ellipse cx="${n(ex)}" cy="${n(ey)}" rx="${n(m.earRX)}" ry="${n(m.earRY)}" fill="${m.skin}" transform="rotate(${n(side * -6)} ${n(ex)} ${n(ey)})"/>`,
      );
    }
    // Inner ear whorl.
    parts.push(
      `<path d="M ${n(ex + side * m.earRX * 0.72)} ${n(ey - m.earRY * 0.32)} Q ${n(ex + side * m.earRX * 0.1)} ${n(ey - m.earRY * 0.5)} ${n(ex - side * m.earRX * 0.12)} ${n(ey + m.earRY * 0.18)}" fill="none" stroke="${m.skinShadow}" stroke-width="0.7" opacity="0.75"/>`,
    );
  }
  return parts.join("");
}

/**
 * Head fill + soft two-tone shading: a shadow crescent hugging the right and
 * lower contour (the base skin re-drawn slightly offset over a full shadow
 * copy), a forehead light, and a faint cheek warmth.
 */
export function headWithShading(m: FaceMetrics, headD: string): string {
  const blushOp = 0.1 + 0.12 * m.child;
  const gauntOp = m.elder * 0.22;
  let extra = "";
  if (gauntOp > 0.03) {
    extra =
      `<ellipse cx="${n(m.cx - m.cheekHW * 0.52)}" cy="${n(m.cheekY + 3.4)}" rx="3.4" ry="2" fill="${m.skinShadow}" opacity="${n(gauntOp)}"/>` +
      `<ellipse cx="${n(m.cx + m.cheekHW * 0.52)}" cy="${n(m.cheekY + 3.4)}" rx="3.4" ry="2" fill="${m.skinShadow}" opacity="${n(gauntOp)}"/>`;
  }
  return (
    `<clipPath id="${m.id}h"><path d="${headD}"/></clipPath>` +
    `<path d="${headD}" fill="${m.skin}"/>` +
    `<g clip-path="url(#${m.id}h)">` +
    `<path d="${headD}" fill="${m.skinShadow}" opacity="0.5"/>` +
    `<path d="${headD}" fill="${m.skin}" transform="translate(-1.9,-1.4)"/>` +
    `<ellipse cx="${n(m.cx - 4)}" cy="${n(m.browY - 6)}" rx="9" ry="5.5" fill="${m.skinHi}" opacity="0.5"/>` +
    `<ellipse cx="${n(m.cx - m.cheekHW * 0.55)}" cy="${n(m.cheekY + 2.6)}" rx="3.2" ry="2.1" fill="${m.blush}" opacity="${n(blushOp)}"/>` +
    `<ellipse cx="${n(m.cx + m.cheekHW * 0.55)}" cy="${n(m.cheekY + 2.6)}" rx="3.2" ry="2.1" fill="${m.blush}" opacity="${n(blushOp)}"/>` +
    extra +
    `</g>` +
    `<path d="${headD}" fill="none" stroke="${m.line}" stroke-width="0.45" opacity="0.28"/>`
  );
}
