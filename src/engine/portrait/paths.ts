/**
 * Small geometry toolkit: stable number formatting and smooth path builders.
 *
 * All face geometry is drawn with Catmull-Rom chains converted to cubic
 * Beziers. Because every control point derives continuously from phenotype
 * numbers, blended child faces land visibly *between* their parents' faces,
 * which is what makes family resemblance legible.
 */

export interface Pt {
  x: number;
  y: number;
  /** Corner smoothness: 1 = fully smooth, 0 = sharp corner. Default 1. */
  k?: number;
}

/** Deterministic compact number formatting (2 decimals, no negative zero). */
export function n(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
}

export function pt(x: number, y: number, k?: number): Pt {
  return { x, y, k };
}

/** Closed smooth path through all points (Catmull-Rom -> cubic Bezier). */
export function smoothClosed(pts: readonly Pt[]): string {
  const m = pts.length;
  if (m < 3) return "";
  let d = `M ${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % m];
    const p3 = pts[(i + 2) % m];
    const k1 = (p1.k ?? 1) / 6;
    const k2 = (p2.k ?? 1) / 6;
    d +=
      ` C ${n(p1.x + (p2.x - p0.x) * k1)} ${n(p1.y + (p2.y - p0.y) * k1)}` +
      ` ${n(p2.x - (p3.x - p1.x) * k2)} ${n(p2.y - (p3.y - p1.y) * k2)}` +
      ` ${n(p2.x)} ${n(p2.y)}`;
  }
  return d + " Z";
}

/** Open smooth chain through all points (endpoint tangents clamped). */
export function smoothOpen(pts: readonly Pt[]): string {
  const m = pts.length;
  if (m === 0) return "";
  if (m === 1) return `M ${n(pts[0].x)} ${n(pts[0].y)}`;
  let d = `M ${n(pts[0].x)} ${n(pts[0].y)}`;
  for (let i = 0; i < m - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(m - 1, i + 2)];
    const k1 = (p1.k ?? 1) / 6;
    const k2 = (p2.k ?? 1) / 6;
    d +=
      ` C ${n(p1.x + (p2.x - p0.x) * k1)} ${n(p1.y + (p2.y - p0.y) * k1)}` +
      ` ${n(p2.x - (p3.x - p1.x) * k2)} ${n(p2.y - (p3.y - p1.y) * k2)}` +
      ` ${n(p2.x)} ${n(p2.y)}`;
  }
  return d;
}

/** Straight-edged polygon path. */
export function poly(points: readonly (readonly [number, number])[]): string {
  let d = `M ${n(points[0][0])} ${n(points[0][1])}`;
  for (let i = 1; i < points.length; i++) d += ` L ${n(points[i][0])} ${n(points[i][1])}`;
  return d + " Z";
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export const clamp01 = (v: number): number => clamp(v, 0, 1);

export const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

/** Wrap an arbitrary number into a valid index of an n-entry table. */
export function idx(v: number, count: number): number {
  const i = Math.round(Number.isFinite(v) ? v : 0);
  return ((i % count) + count) % count;
}
