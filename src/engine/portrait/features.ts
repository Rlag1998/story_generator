/**
 * Facial features: eyes, brows, nose, mouth, marks, freckles, age lines.
 */

import type { FaceMetrics } from "./metrics";
import { clamp01, n, pt, smoothOpen } from "./paths";

// --------------------------------------------------------------------------
// Eyes
// --------------------------------------------------------------------------

/**
 * Almond eye outline. `dir` points toward the OUTER corner (+1 right eye,
 * -1 left eye) so the two eyes are true mirror images.
 */
function almondD(ex: number, ey: number, w: number, h: number, dir: -1 | 1): string {
  const X = (f: number) => n(ex + dir * f * w);
  return (
    `M ${X(-1)} ${n(ey)} ` +
    `Q ${X(-0.35)} ${n(ey - h * 1.5)} ${X(0.15)} ${n(ey - h * 1.3)} ` +
    `Q ${X(0.8)} ${n(ey - h * 0.95)} ${X(1)} ${n(ey)} ` +
    `Q ${X(0.5)} ${n(ey + h * 1.15)} ${X(-0.4)} ${n(ey + h * 0.95)} ` +
    `Q ${X(-0.8)} ${n(ey + h * 0.6)} ${X(-1)} ${n(ey)} Z`
  );
}

/** One eye. `side` -1 = viewer-left, +1 = viewer-right. */
function eye(m: FaceMetrics, side: -1 | 1): string {
  const ex = m.cx + side * m.eyeDX;
  const ey = m.eyeY;
  const w = m.eyeW;
  const h = m.eyeH;
  const iris = side === -1 ? m.eyeL : m.eyeR;
  const tag = side === -1 ? "l" : "r";
  const clipId = `${m.id}e${tag}`;
  const iy = ey + h * 0.08;
  // Outer corner sits slightly high: rotate each eye outward.
  const rot = `rotate(${n(-side * m.eyeTiltDeg)} ${n(ex)} ${n(ey)})`;
  const d = almondD(ex, ey, w, h, side);
  const X = (f: number) => n(ex + side * f * w); // outward-positive coordinate
  const parts: string[] = [];
  parts.push(`<g transform="${rot}" data-eye="${tag}">`);
  parts.push(`<clipPath id="${clipId}"><path d="${d}"/></clipPath>`);
  parts.push(`<path d="${d}" fill="${m.sclera}"/>`);
  parts.push(`<g clip-path="url(#${clipId})">`);
  parts.push(`<circle cx="${n(ex)}" cy="${n(iy)}" r="${n(m.irisR)}" fill="${iris}" data-iris="${tag}"/>`);
  parts.push(
    `<circle cx="${n(ex)}" cy="${n(iy)}" r="${n(m.irisR)}" fill="none" stroke="#1c1410" stroke-width="0.4" opacity="0.65"/>`,
  );
  parts.push(`<circle cx="${n(ex)}" cy="${n(iy)}" r="${n(m.pupilR)}" fill="#17100c" data-pupil="${tag}"/>`);
  parts.push(
    `<circle cx="${n(ex - m.irisR * 0.35)}" cy="${n(ey - h * 0.22)}" r="0.55" fill="#ffffff" opacity="0.85"/>`,
  );
  // Upper-lid soft shadow inside the eye.
  parts.push(
    `<path d="M ${X(-1)} ${n(ey - h * 0.1)} Q ${n(ex)} ${n(ey - h * 1.7)} ${X(1)} ${n(ey - h * 0.1)} L ${X(1)} ${n(ey - h * 2)} L ${X(-1)} ${n(ey - h * 2)} Z" fill="${m.skinShadow}" opacity="0.3"/>`,
  );
  parts.push(`</g>`);
  // Lash line.
  parts.push(
    `<path d="M ${X(-1)} ${n(ey - h * 0.05)} Q ${X(-0.3)} ${n(ey - h * 1.55)} ${X(0.2)} ${n(ey - h * 1.32)} Q ${X(0.85)} ${n(ey - h * 0.95)} ${X(1)} ${n(ey)}" fill="none" stroke="${m.line}" stroke-width="${n(0.75 + (m.lashes ? 0.25 : 0))}" stroke-linecap="round"/>`,
  );
  // Lower lid, whisper-light.
  parts.push(
    `<path d="M ${X(-0.6)} ${n(ey + h * 0.85)} Q ${X(0.1)} ${n(ey + h * 1.15)} ${X(0.85)} ${n(ey + h * 0.35)}" fill="none" stroke="${m.line}" stroke-width="0.4" opacity="0.45"/>`,
  );
  if (m.lashes) {
    parts.push(
      `<path d="M ${X(0.95)} ${n(ey - h * 0.25)} L ${X(1.35)} ${n(ey - h * 0.7)}" stroke="${m.line}" stroke-width="0.5" stroke-linecap="round"/>`,
    );
  }
  if (m.elder > 0.3) {
    parts.push(
      `<path d="M ${X(-0.55)} ${n(ey + h * 1.7)} Q ${n(ex)} ${n(ey + h * 2.2)} ${X(0.6)} ${n(ey + h * 1.75)}" fill="none" stroke="${m.skinShadow}" stroke-width="0.5" opacity="${n(m.elder * 0.55)}"/>`,
    );
  }
  parts.push(`</g>`);
  return parts.join("");
}

export function eyes(m: FaceMetrics): string {
  return `<g data-l="eyes">${eye(m, -1)}${eye(m, 1)}</g>`;
}

// --------------------------------------------------------------------------
// Brows
// --------------------------------------------------------------------------

function browSide(m: FaceMetrics, side: -1 | 1): string {
  const ex = m.cx + side * m.eyeDX;
  const by = m.browY + (m.browShape === 4 ? 0.7 : 0);
  const w = m.eyeW;
  const x0 = ex - side * w * 1.05; // inner end
  const x1 = ex + side * w * 1.18; // outer end
  let d: string;
  switch (m.browShape) {
    case 0: // level
      d = `M ${n(x0)} ${n(by + 0.4)} Q ${n(ex)} ${n(by - 0.4)} ${n(x1)} ${n(by - 0.1)}`;
      break;
    case 1: // arched
      d = `M ${n(x0)} ${n(by + 1)} Q ${n(ex + side * w * 0.1)} ${n(by - 1.9)} ${n(x1)} ${n(by + 0.7)}`;
      break;
    case 2: // angled, fierce
      d = `M ${n(x0)} ${n(by + 1.1)} L ${n(ex + side * w * 0.35)} ${n(by - 1.4)} L ${n(x1)} ${n(by + 0.9)}`;
      break;
    case 3: // soft thin
      d = `M ${n(x0)} ${n(by + 0.7)} Q ${n(ex)} ${n(by - 1)} ${n(x1)} ${n(by + 0.3)}`;
      break;
    default: // heavy
      d = `M ${n(x0)} ${n(by + 0.5)} Q ${n(ex)} ${n(by - 0.9)} ${n(x1)} ${n(by + 0.2)}`;
      break;
  }
  return `<path d="${d}" fill="none" stroke="${m.brow}" stroke-width="${n(m.browWeight)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function brows(m: FaceMetrics): string {
  return `<g data-l="brows">${browSide(m, -1)}${browSide(m, 1)}</g>`;
}

// --------------------------------------------------------------------------
// Nose
// --------------------------------------------------------------------------

export function nose(m: FaceMetrics): string {
  const cx = m.cx;
  const top = m.noseTop;
  const base = top + m.noseLen;
  const bw = m.noseBW;
  const wing = m.noseWing;
  const tipY = base - 1.1;
  // Bridge line down the shadowed (viewer-right) side, bump = aquiline arc.
  const bridge =
    `M ${n(cx + bw)} ${n(top + 1)} ` +
    `C ${n(cx + bw + m.noseBump * 2)} ${n(top + m.noseLen * 0.38)} ` +
    `${n(cx + bw * 0.9 + m.noseBump * 1.2)} ${n(top + m.noseLen * 0.72)} ` +
    `${n(cx + bw * 0.75)} ${n(tipY)}`;
  // Underside: wing, nostril curl, tip, nostril curl, wing.
  const baseY = base + 0.4;
  const tipDrop = 1.4 - m.noseTipUp * 0.9;
  const under = smoothOpen([
    pt(cx - wing, baseY - 0.9),
    pt(cx - wing * 0.62, baseY + 0.55),
    pt(cx - wing * 0.28, baseY + 0.15),
    pt(cx, baseY + tipDrop * 0.45),
    pt(cx + wing * 0.28, baseY + 0.15),
    pt(cx + wing * 0.62, baseY + 0.55),
    pt(cx + wing, baseY - 0.9),
  ]);
  const nostrils =
    `<ellipse cx="${n(cx - wing * 0.5)}" cy="${n(baseY + 0.15)}" rx="0.85" ry="0.5" fill="${m.line}" opacity="0.35"/>` +
    `<ellipse cx="${n(cx + wing * 0.5)}" cy="${n(baseY + 0.15)}" rx="0.85" ry="0.5" fill="${m.line}" opacity="0.35"/>`;
  return (
    `<g data-l="nose">` +
    `<path d="${bridge}" fill="none" stroke="${m.skinShadow}" stroke-width="0.8" opacity="0.55" stroke-linecap="round"/>` +
    `<path d="${under}" fill="none" stroke="${m.line}" stroke-width="0.7" opacity="0.8" stroke-linecap="round"/>` +
    nostrils +
    `</g>`
  );
}

// --------------------------------------------------------------------------
// Mouth
// --------------------------------------------------------------------------

export function mouth(m: FaceMetrics): string {
  const cx = m.cx;
  const my = m.mouthY;
  const hw = m.mouthHW;
  const cornerY = my - m.mouthCurve * 0.7;
  const upH = m.lipFull * 1.25 + 0.55;
  const lowH = m.lipFull * 1.5 + 0.5;
  const bowDip = m.bowDepth * 0.55;
  const upperTop = my - upH;
  // Upper lip: two lobes meeting at the philtrum dip.
  const upper =
    `M ${n(cx - hw)} ${n(cornerY)} ` +
    `Q ${n(cx - hw * 0.55)} ${n(upperTop - 0.2)} ${n(cx - hw * 0.22)} ${n(upperTop)} ` +
    `Q ${n(cx)} ${n(upperTop + bowDip)} ${n(cx + hw * 0.22)} ${n(upperTop)} ` +
    `Q ${n(cx + hw * 0.55)} ${n(upperTop - 0.2)} ${n(cx + hw)} ${n(cornerY)} ` +
    `Q ${n(cx)} ${n(my + 0.5)} ${n(cx - hw)} ${n(cornerY)} Z`;
  const lower =
    `M ${n(cx - hw)} ${n(cornerY)} ` +
    `Q ${n(cx)} ${n(my + 0.4)} ${n(cx + hw)} ${n(cornerY)} ` +
    `Q ${n(cx + hw * 0.6)} ${n(my + lowH + 0.6)} ${n(cx)} ${n(my + lowH + 0.7)} ` +
    `Q ${n(cx - hw * 0.6)} ${n(my + lowH + 0.6)} ${n(cx - hw)} ${n(cornerY)} Z`;
  const mouthLine =
    `M ${n(cx - hw)} ${n(cornerY)} Q ${n(cx)} ${n(my + 0.55)} ${n(cx + hw)} ${n(cornerY)}`;
  return (
    `<g data-l="mouth">` +
    `<path d="${lower}" fill="${m.lip}"/>` +
    `<path d="${upper}" fill="${m.lipDark}"/>` +
    `<path d="${mouthLine}" fill="none" stroke="${m.line}" stroke-width="0.55" opacity="0.8" stroke-linecap="round"/>` +
    `<path d="M ${n(cx - hw * 0.45)} ${n(my + lowH * 0.55)} Q ${n(cx)} ${n(my + lowH * 0.85)} ${n(cx + hw * 0.45)} ${n(my + lowH * 0.55)}" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.22"/>` +
    `</g>`
  );
}

// --------------------------------------------------------------------------
// Marks: dimples, cleft chin, freckles, age lines
// --------------------------------------------------------------------------

export function marks(m: FaceMetrics): string {
  const parts: string[] = [];
  if (m.dimples) {
    for (const s of [-1, 1] as const) {
      const x = m.cx + s * (m.mouthHW + 1.7);
      parts.push(
        `<path d="M ${n(x)} ${n(m.mouthY - 0.9)} q ${n(s * 0.7)} 1.3 0 2.5" fill="none" stroke="${m.skinShadow}" stroke-width="0.55" opacity="0.6" stroke-linecap="round"/>`,
      );
    }
  }
  if (m.cleftChin) {
    parts.push(
      `<path d="M ${n(m.cx)} ${n(m.chinY - 3.9)} q 0.5 1.1 0 2.3" fill="none" stroke="${m.skinShadow}" stroke-width="0.6" opacity="0.7" stroke-linecap="round"/>`,
    );
  }
  return parts.length ? `<g data-l="marks">${parts.join("")}</g>` : "";
}

export function freckles(m: FaceMetrics): string {
  if (!m.freckles) return "";
  const parts: string[] = [];
  // Two cheek clusters + a dusting over the nose bridge.
  for (const s of [-1, 1] as const) {
    const count = 6 + m.dice.int(`frk-n${s}`, 4);
    for (let i = 0; i < count; i++) {
      const r1 = m.dice.r(`frk${s}x${i}`);
      const r2 = m.dice.r(`frk${s}y${i}`);
      const r3 = m.dice.r(`frk${s}r${i}`);
      const x = m.cx + s * (2.4 + r1 * m.cheekHW * 0.52);
      const y = m.eyeY + 2.6 + r2 * 4.4;
      parts.push(
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.3 + r3 * 0.28)}" fill="${m.freckle}" opacity="0.75"/>`,
      );
    }
  }
  for (let i = 0; i < 4; i++) {
    const r1 = m.dice.r(`frkbx${i}`);
    const r2 = m.dice.r(`frkby${i}`);
    parts.push(
      `<circle cx="${n(m.cx + (r1 - 0.5) * 5)}" cy="${n(m.noseTop + 2 + r2 * 2.6)}" r="0.32" fill="${m.freckle}" opacity="0.7"/>`,
    );
  }
  return `<g data-l="freckles">${parts.join("")}</g>`;
}

export function wrinkles(m: FaceMetrics): string {
  if (m.elder < 0.12) return "";
  const o = clamp01((m.elder - 0.08) * 0.85);
  const parts: string[] = [];
  const fw = m.skullHW * 0.55;
  const fy = m.browY - 4.4;
  parts.push(
    `<path d="M ${n(m.cx - fw)} ${n(fy)} Q ${n(m.cx)} ${n(fy - 1.7)} ${n(m.cx + fw)} ${n(fy)}" fill="none" stroke="${m.skinShadow}" stroke-width="0.5" opacity="${n(o * 0.7)}"/>`,
  );
  if (m.elder > 0.35) {
    parts.push(
      `<path d="M ${n(m.cx - fw * 0.8)} ${n(fy - 2.6)} Q ${n(m.cx)} ${n(fy - 4)} ${n(m.cx + fw * 0.8)} ${n(fy - 2.6)}" fill="none" stroke="${m.skinShadow}" stroke-width="0.45" opacity="${n(o * 0.6)}"/>`,
    );
    // Glabella crease between the brows.
    parts.push(
      `<path d="M ${n(m.cx - 0.9)} ${n(m.browY - 0.5)} L ${n(m.cx - 0.9)} ${n(m.browY - 2.6)}" stroke="${m.skinShadow}" stroke-width="0.4" opacity="${n(o * 0.5)}"/>`,
    );
  }
  // Crow's feet.
  for (const s of [-1, 1] as const) {
    const x = m.cx + s * (m.eyeDX + m.eyeW * 1.12);
    parts.push(
      `<path d="M ${n(x)} ${n(m.eyeY - 0.4)} l ${n(s * 1.7)} -0.9 M ${n(x)} ${n(m.eyeY + 0.7)} l ${n(s * 1.8)} 0.5" fill="none" stroke="${m.skinShadow}" stroke-width="0.45" opacity="${n(o * 0.65)}"/>`,
    );
  }
  // Nasolabial folds.
  const baseY = m.noseTop + m.noseLen + 0.6;
  for (const s of [-1, 1] as const) {
    parts.push(
      `<path d="M ${n(m.cx + s * (m.noseWing + 0.7))} ${n(baseY)} Q ${n(m.cx + s * (m.mouthHW + 2.4))} ${n(m.mouthY - 1.2)} ${n(m.cx + s * (m.mouthHW + 1.4))} ${n(m.mouthY + 1.6)}" fill="none" stroke="${m.skinShadow}" stroke-width="0.5" opacity="${n(o * 0.6)}"/>`,
    );
  }
  return `<g data-l="wrinkles">${parts.join("")}</g>`;
}
