/**
 * Hair: back masses, the cap over the skull, fringes, beards, streaks.
 *
 * Silhouettes are built by sampling an expanded skull ellipse and modulating
 * the radius by texture: straight lies flat, waves roll, curls scallop,
 * coils bloom into a full crown. Everything is deterministic in the
 * phenotype dice, so a person's hair never changes between renders and
 * kin with the same texture genes read as kin.
 */

import { lerpHex } from "../core/appearance";
import { luminance } from "./color";
import type { FaceMetrics } from "./metrics";
import { lerp, n, pt, smoothClosed, type Pt } from "./paths";

/** Back masses sit a shade darker so the cap reads in front of them. */
function backHex(m: FaceMetrics): string {
  return lerpHex(m.hair, "#241a12", 0.14);
}

/** Very light hair (white, moon-pale, deep grey) needs a defining edge. */
function hairEdge(m: FaceMetrics): string {
  if (luminance(m.hair) < 0.8) return "";
  return ` stroke="${m.hairDark}" stroke-opacity="0.45" stroke-width="0.5"`;
}

/** Point on the expanded skull ellipse; t 0 = left temple, 1 = right temple. */
function skullPoint(m: FaceMetrics, t: number, expand: number): { x: number; y: number } {
  const a = Math.PI * (1 - t);
  const rx = m.skullHW + expand;
  const ry = m.templeY - m.topY + expand;
  return { x: m.cx + Math.cos(a) * rx, y: m.templeY - Math.sin(a) * ry };
}

/** Texture-driven silhouette modulation. */
function texAmp(m: FaceMetrics, t: number, phase: number): number {
  switch (m.texture) {
    case 1: // wavy
      return 0.7 * Math.sin(t * Math.PI * 5 + phase);
    case 2: // curly
      return 1.5 * Math.abs(Math.sin(t * Math.PI * 7 + phase)) - 0.5;
    case 3: // coiled
      return 2.1 * Math.abs(Math.sin(t * Math.PI * 9 + phase)) - 0.6;
    default:
      return 0;
  }
}

/** Hairline (inner cap edge) points, LEFT to RIGHT across the forehead. */
function hairlinePts(m: FaceMetrics): Pt[] {
  const hlY = m.hairlineY;
  const fw = m.skullHW * 0.82;
  const us = [0, 0.18, 0.36, 0.5, 0.64, 0.82, 1];
  let offs: number[];
  switch (m.fringe) {
    case 0: // straight bang, low over the brow
      offs = [0, 1.6, 2.3, 2.5, 2.3, 1.6, 0].map((v) => v + (m.browY - 2.6 - hlY) * 0.55);
      break;
    case 1: // rounded hairline
      offs = [0, 1.3, 2.0, 2.2, 2.0, 1.3, 0];
      break;
    case 2: // centre part: curtains low at the sides, peak of forehead shown
      offs = [0, 2.7, 2.1, -1.3, 2.1, 2.7, 0];
      break;
    case 3: // side sweep
      offs = [2.9, 2.5, 1.4, 0.1, -0.9, -1.6, -2.1];
      break;
    default: // widow's peak
      offs = [0, 1.5, 0.5, 3.1, 0.5, 1.5, 0];
      break;
  }
  const pts: Pt[] = [];
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    let y = hlY + offs[i];
    // Recession carves the temples into an M-shape.
    if (m.recess > 0.15 && (i === 1 || i === us.length - 2)) y -= m.recess * 5;
    const k = m.fringe === 2 && i === 3 ? 0.45 : m.fringe === 4 && i === 3 ? 0.4 : 1;
    pts.push(pt(m.cx - fw + u * fw * 2, y, k));
  }
  return pts;
}

/** The cap of hair over the skull, with texture bumps and the fringe edge. */
export function hairCap(m: FaceMetrics): string {
  if (m.baldCrown) return baldFringe(m);
  const phase = m.dice.r("cap-phase") * Math.PI * 2;
  const volAbs = 1.1 + m.style.vol * 17;
  const outer: Pt[] = [];
  const N = 22;
  const sideY = m.earY - 1 + (m.style.back > 0 ? 2.5 : 0);
  // The side anchors follow the cheek contour so the cap hugs the temples
  // instead of leaving bare skull beside the hairline.
  const sideX = m.cheekHW * 0.97 + 0.7 + m.style.vol * 5;
  outer.push(pt(m.cx - sideX, sideY, 0.6));
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const jitter = (m.dice.r(`cap-j${i}`) - 0.5) * 0.5;
    const expand = volAbs * (0.8 + 0.35 * Math.sin(Math.PI * t)) + texAmp(m, t, phase) + jitter;
    const p = skullPoint(m, t, Math.max(0.5, expand));
    outer.push(pt(p.x, p.y, m.texture >= 2 ? 1.12 : 1));
  }
  outer.push(pt(m.cx + sideX, sideY, 0.6));
  const inner = hairlinePts(m).reverse();
  // Bring the hairline ends to meet the sideburn points cleanly.
  const d = smoothClosed([...outer, ...inner.map((p) => ({ ...p }))]);
  const strands = capStrands(m);
  const streak = m.streak ? silverStreak(m, d) : "";
  return (
    `<g data-l="hair">` +
    `<path d="${d}" fill="${m.hair}"${hairEdge(m)}/>` +
    strands +
    streak +
    `</g>`
  );
}

/** Elder bald crown: only a band of hair around the sides and back. */
function baldFringe(m: FaceMetrics): string {
  const parts: string[] = [];
  for (const s of [-1, 1] as const) {
    const x0 = m.cx + s * (m.skullHW + 0.4);
    const y0 = m.templeY - 1;
    const d =
      `M ${n(x0)} ${n(y0)} ` +
      `C ${n(x0 + s * 2.4)} ${n(y0 + 2.5)} ${n(x0 + s * 2.2)} ${n(m.earY + 1.5)} ${n(m.cx + s * (m.cheekHW - 1))} ${n(m.earY + 3.2)} ` +
      `C ${n(m.cx + s * (m.cheekHW - 3))} ${n(m.earY + 2)} ${n(x0 - s * 1.3)} ${n(y0 + 3)} ${n(x0 - s * 1.6)} ${n(y0 + 0.5)} Z`;
    parts.push(`<path d="${d}" fill="${m.hair}"/>`);
  }
  // A few faithful strands combed over the crown.
  if (m.dice.chance("combover", 0.4)) {
    parts.push(
      `<path d="M ${n(m.cx - m.skullHW * 0.7)} ${n(m.topY + 2.5)} Q ${n(m.cx)} ${n(m.topY + 0.6)} ${n(m.cx + m.skullHW * 0.55)} ${n(m.topY + 2.8)}" fill="none" stroke="${m.hair}" stroke-width="0.8" opacity="0.8"/>`,
    );
  }
  return `<g data-l="hair">${parts.join("")}</g>`;
}

/** A few interior strand strokes so the cap reads as hair, not helmet. */
function capStrands(m: FaceMetrics): string {
  const parts: string[] = [];
  const nStr = m.texture >= 2 ? 4 : 3;
  for (let i = 0; i < nStr; i++) {
    const u = 0.2 + 0.6 * (i / (nStr - 1)) + (m.dice.r(`str${i}`) - 0.5) * 0.1;
    const p0 = skullPoint(m, u, 0.2);
    const p1 = skullPoint(m, u + (u < 0.5 ? -0.08 : 0.08), 1.4 + m.style.vol * 10);
    if (m.texture >= 2) {
      // Curl squiggle.
      parts.push(
        `<path d="M ${n(p0.x)} ${n(p0.y)} q ${n(1.4)} ${n(-1.2)} ${n(0.3)} ${n(-2.2)} q ${n(-1)} ${n(-0.9)} ${n(0.4)} ${n(-1.6)}" fill="none" stroke="${m.hairDark}" stroke-width="0.5" opacity="0.4"/>`,
      );
    } else {
      parts.push(
        `<path d="M ${n(p0.x)} ${n(p0.y - 1)} Q ${n((p0.x + p1.x) / 2)} ${n(p1.y - 1.5)} ${n(p1.x)} ${n(p1.y + 2)}" fill="none" stroke="${m.hairDark}" stroke-width="0.5" opacity="0.4"/>`,
      );
    }
  }
  return parts.join("");
}

/** Silver streak: a bright lock sweeping back from the hairline. */
function silverStreak(m: FaceMetrics, capD: string): string {
  const s = m.dice.chance("streak-side", 0.5) ? -1 : 1;
  const x0 = m.cx + s * m.skullHW * 0.28;
  const top = skullPoint(m, 0.5 + s * 0.18, 2.2 + m.style.vol * 14);
  const d =
    `M ${n(x0 - 1.4)} ${n(m.hairlineY + 2.6)} ` +
    `Q ${n(x0 - s * 3)} ${n((m.hairlineY + top.y) / 2)} ${n(top.x - 1)} ${n(top.y - 0.4)} ` +
    `L ${n(top.x + 2.2)} ${n(top.y + 0.3)} ` +
    `Q ${n(x0 + s * 1.5)} ${n((m.hairlineY + top.y) / 2 + 1)} ${n(x0 + 1.6)} ${n(m.hairlineY + 2.9)} Z`;
  return (
    `<clipPath id="${m.id}s"><path d="${capD}"/></clipPath>` +
    `<path d="${d}" fill="${m.streak}" clip-path="url(#${m.id}s)" data-l="streak"/>`
  );
}

/** Long hair falling behind the head and over the shoulders. */
export function hairBack(m: FaceMetrics): string {
  const st = m.style;
  const parts: string[] = [];
  if (st.tail) {
    // Tied back: a tail glimpsed past one side of the neck.
    const s = m.dice.chance("tail-side", 0.5) ? -1 : 1;
    const x = m.cx + s * (m.neckHW + 2.2);
    const d =
      `M ${n(x - 1.5)} ${n(m.chinY + 1)} ` +
      `Q ${n(x + s * 1.8)} ${n(m.chinY + 8)} ${n(x)} ${n(m.chinY + 14)} ` +
      `Q ${n(x - s * 1.6)} ${n(m.chinY + 10)} ${n(x - 1.5 - s * 1.2)} ${n(m.chinY + 2)} Z`;
    return `<g data-l="hairback"><path d="${d}" fill="${backHex(m)}"/></g>`;
  }
  if (st.back === 0 && !st.braid) return "";

  const phase = m.dice.r("back-phase") * Math.PI * 2;
  const yBot = st.back === 1 ? m.chinY + 3 : st.back === 2 ? 77 : 88;
  const wTop = m.skullHW + 1.2 + st.vol * 8;
  const wBot = st.braid
    ? m.skullHW + 1
    : (m.skullHW + (st.back === 1 ? 1.8 : 3.2) + st.vol * 10) * (m.texture === 0 ? 0.88 : 1);
  const pts: Pt[] = [];
  // Over the crown.
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const expand = 1.6 + st.vol * 15 + texAmp(m, t, phase) * 0.7;
    const p = skullPoint(m, t, expand);
    pts.push(pt(p.x, p.y));
  }
  // Right side falling down, pinching in slightly near the jaw.
  const sideSteps = 4;
  const sideW = (f: number): number =>
    lerp(wTop, wBot, f * f * 0.9 + f * 0.1) * (1 - 0.07 * Math.sin(Math.PI * Math.min(1, f * 2)));
  for (let i = 1; i <= sideSteps; i++) {
    const f = i / sideSteps;
    const y = lerp(m.templeY, yBot, f);
    const wave = texAmp(m, f, phase + 2) * 0.8;
    pts.push(pt(m.cx + sideW(f) + wave, y, m.texture >= 2 ? 1.1 : 1));
  }
  // Bottom edge, right to left, with texture lobes. Straight hair rounds
  // into a soft U so long locks read as locks, not a cape hem.
  const botSteps = 5;
  for (let i = 0; i <= botSteps; i++) {
    const f = i / botSteps;
    const x = lerp(m.cx + wBot * 0.82, m.cx - wBot * 0.82, f);
    const lob =
      m.texture === 0
        ? Math.sin(f * Math.PI) * 3.2
        : m.texture === 1
          ? Math.sin(f * Math.PI * 3 + phase) * 1.6 + 1
          : Math.abs(Math.sin(f * Math.PI * (m.texture === 2 ? 4 : 5) + phase)) * 2.6;
    pts.push(pt(x, yBot + lob, m.texture >= 1 ? 1.15 : 1));
  }
  // Left side rising back up.
  for (let i = sideSteps; i >= 1; i--) {
    const f = i / sideSteps;
    const y = lerp(m.templeY, yBot, f);
    const wave = texAmp(m, f, phase + 4) * 0.8;
    pts.push(pt(m.cx - sideW(f) - wave, y, m.texture >= 2 ? 1.1 : 1));
  }
  parts.push(`<path d="${smoothClosed(pts)}" fill="${backHex(m)}"${hairEdge(m)}/>`);
  // Straight hair: a few long guide strands.
  if (m.texture === 0 && st.back >= 2) {
    for (const s of [-1, 1] as const) {
      const x = m.cx + s * (m.skullHW + 2.5);
      parts.push(
        `<path d="M ${n(x)} ${n(m.cheekY)} Q ${n(x + s * 2)} ${n((m.cheekY + yBot) / 2)} ${n(x + s * 1)} ${n(yBot - 2)}" fill="none" stroke="${m.hairDark}" stroke-width="0.5" opacity="0.35"/>`,
      );
    }
  }
  if (st.braid) {
    parts.push(braid(m, yBot));
  }
  return `<g data-l="hairback">${parts.join("")}</g>`;
}

/** A braid of shrinking links falling over one shoulder. */
function braid(m: FaceMetrics, yTopRef: number): string {
  const s = m.dice.chance("braid-side", 0.5) ? -1 : 1;
  const x0 = m.cx + s * (m.neckHW + 3.4);
  const parts: string[] = [];
  let y = m.chinY + 1.5;
  let r = 2.5;
  let i = 0;
  while (y < 88 && r > 0.9) {
    const sway = Math.sin(i * 1.9) * 1.1;
    parts.push(`<circle cx="${n(x0 + sway)}" cy="${n(y)}" r="${n(r)}" fill="${backHex(m)}"/>`);
    parts.push(
      `<path d="M ${n(x0 + sway - r * 0.5)} ${n(y - r * 0.35)} Q ${n(x0 + sway)} ${n(y + r * 0.45)} ${n(x0 + sway + r * 0.55)} ${n(y - r * 0.3)}" fill="none" stroke="${m.hairDark}" stroke-width="0.45" opacity="0.5"/>`,
    );
    y += r * 1.55;
    r *= 0.93;
    i++;
  }
  return parts.join("");
}

// --------------------------------------------------------------------------
// Beards
// --------------------------------------------------------------------------

/** Lower-face outline pushed outward by `off`, left cheek around to right. */
function beardOutline(m: FaceMetrics, off: number, hang: number): Pt[] {
  const cx = m.cx;
  const chinCornerY = m.chinY - Math.max(1.4, m.chinHW * 0.42);
  const raw: [number, number][] = [
    [cx - m.cheekHW - off * 0.5, m.cheekY + 3],
    [cx - m.jawHW - m.jowl * 2.4 - off, m.jawY + off * 0.4],
    [cx - m.chinHW - off, chinCornerY + off * 0.6 + hang * 0.35],
    [cx, m.chinY + off + hang],
    [cx + m.chinHW + off, chinCornerY + off * 0.6 + hang * 0.35],
    [cx + m.jawHW + m.jowl * 2.4 + off, m.jawY + off * 0.4],
    [cx + m.cheekHW + off * 0.5, m.cheekY + 3],
  ];
  return raw.map(([x, y]) => pt(x, y));
}

/**
 * Facial hair. Fill layer drawn beneath the mouth (the mouth is painted on
 * top so lips stay visible inside full beards); the mustache is layered
 * after the mouth.
 */
export function beardBase(m: FaceMetrics): string {
  const b = m.beard;
  if (b === "none" || b === "mustache") return "";
  const phase = m.dice.r("beard-phase") * Math.PI * 2;
  if (b === "stubble") {
    const outline = beardOutline(m, 0.15, 0);
    const inner: Pt[] = [
      pt(m.cx + m.mouthHW * 1.25, m.mouthY - 2.2),
      pt(m.cx, m.mouthY - 2.6),
      pt(m.cx - m.mouthHW * 1.25, m.mouthY - 2.2),
    ];
    const d = smoothClosed([...outline, ...inner]);
    return `<g data-l="beard"><path d="${d}" fill="${m.hairDark}" opacity="0.18"/></g>`;
  }
  if (b === "goatee") {
    const d = smoothClosed([
      pt(m.cx - m.chinHW - 1.6, m.mouthY + 1.2),
      pt(m.cx - m.chinHW - 1.2, m.chinY - 0.5),
      pt(m.cx, m.chinY + 2.6),
      pt(m.cx + m.chinHW + 1.2, m.chinY - 0.5),
      pt(m.cx + m.chinHW + 1.6, m.mouthY + 1.2),
      pt(m.cx, m.mouthY + 2.2),
    ]);
    return `<g data-l="beard"><path d="${d}" fill="${m.beardColor}"/></g>`;
  }
  // short / full / long
  const off = b === "short" ? 1.0 : b === "full" ? 2.1 : 2.4;
  const hang = b === "short" ? 1.2 : b === "full" ? 4.5 : m.faceLen * 0.34;
  const outline = beardOutline(m, off, hang);
  // Texture the hanging edge of long beards.
  if (b === "long") {
    const bottom = outline[3];
    const forked = m.dice.chance("fork", 0.35);
    outline.splice(
      3,
      1,
      pt(m.cx - m.chinHW * 0.9, bottom.y - (forked ? 0.5 : 1.5), 1.1),
      pt(m.cx, bottom.y - (forked ? 3.2 : 0), forked ? 0.5 : 1),
      pt(m.cx + m.chinHW * 0.9, bottom.y - (forked ? 0.5 : 1.5), 1.1),
    );
  } else if (m.texture >= 2) {
    // Curly beards scallop.
    for (let i = 1; i < outline.length - 1; i++) {
      outline[i] = pt(
        outline[i].x,
        outline[i].y + Math.abs(Math.sin(i * 2.1 + phase)) * 0.9,
        1.15,
      );
    }
  }
  const inner: Pt[] = [
    pt(m.cx + m.cheekHW * 0.6, m.cheekY + 4.6),
    pt(m.cx + m.mouthHW * 1.25, m.mouthY - 1.2),
    pt(m.cx, m.mouthY - 1.9),
    pt(m.cx - m.mouthHW * 1.25, m.mouthY - 1.2),
    pt(m.cx - m.cheekHW * 0.6, m.cheekY + 4.6),
  ];
  const d = smoothClosed([...outline, ...inner]);
  const strand = `<path d="M ${n(m.cx - m.chinHW * 0.5)} ${n(m.chinY + hang * 0.35)} Q ${n(m.cx)} ${n(m.chinY + hang * 0.7)} ${n(m.cx + m.chinHW * 0.5)} ${n(m.chinY + hang * 0.35)}" fill="none" stroke="${m.hairDark}" stroke-width="0.45" opacity="0.4"/>`;
  return `<g data-l="beard"><path d="${d}" fill="${m.beardColor}"/>${b !== "short" ? strand : ""}</g>`;
}

/** Mustache, painted after the mouth. */
export function mustache(m: FaceMetrics): string {
  const b = m.beard;
  const shortWith = b === "short" && m.dice.chance("short-stache", 0.55);
  if (b !== "mustache" && b !== "goatee" && b !== "full" && b !== "long" && !shortWith) return "";
  const my = m.mouthY;
  const mw = m.mouthHW * 1.08;
  const mh = 2.1;
  const droop = b === "long" || (b === "mustache" && m.dice.chance("droop", 0.4)) ? 2.4 : 0.4;
  const d =
    `M ${n(m.cx - mw)} ${n(my + droop)} ` +
    `Q ${n(m.cx - mw * 0.8)} ${n(my - 1)} ${n(m.cx - mw * 0.45)} ${n(my - mh + 0.4)} ` +
    `Q ${n(m.cx - mw * 0.2)} ${n(my - mh)} ${n(m.cx)} ${n(my - mh * 0.55)} ` +
    `Q ${n(m.cx + mw * 0.2)} ${n(my - mh)} ${n(m.cx + mw * 0.45)} ${n(my - mh + 0.4)} ` +
    `Q ${n(m.cx + mw * 0.8)} ${n(my - 1)} ${n(m.cx + mw)} ${n(my + droop)} ` +
    `Q ${n(m.cx + mw * 0.55)} ${n(my - 0.2)} ${n(m.cx)} ${n(my - 0.5)} ` +
    `Q ${n(m.cx - mw * 0.55)} ${n(my - 0.2)} ${n(m.cx - mw)} ${n(my + droop)} Z`;
  return `<g data-l="mustache"><path d="${d}" fill="${m.beardColor}"/></g>`;
}

/** Infant fuzz: a soft crescent of down along the crown, plus a curl. */
export function infantWisps(m: FaceMetrics): string {
  const parts: string[] = [];
  // Soft crescent of down hugging the top of the skull.
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = 0.16 + (0.68 * i) / N;
    const po = skullPoint(m, t, 0.9);
    const pi = skullPoint(m, t, -3.2);
    outer.push(pt(po.x, po.y));
    inner.push(pt(pi.x, pi.y));
  }
  inner.reverse();
  parts.push(`<path d="${smoothClosed([...outer, ...inner])}" fill="${m.hair}" opacity="0.9"/>`);
  // One proud curl at the crown.
  const c = skullPoint(m, 0.52, 0.6);
  parts.push(
    `<path d="M ${n(c.x - 1.2)} ${n(c.y + 0.4)} q 1.2 -2.6 2.8 -1.4 q 1.1 0.9 0 1.8" fill="none" stroke="${m.hair}" stroke-width="1" stroke-linecap="round"/>`,
  );
  return `<g data-l="hair">${parts.join("")}</g>`;
}
