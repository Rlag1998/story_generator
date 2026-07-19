import { describe, expect, it } from "vitest";
import { bannerSVG, TINCTURES } from "./banner";
import { createPortraitService } from "./index";
import { fills, svgProblem } from "./testutil";

const svc = createPortraitService();

describe("bannerSVG", () => {
  it("produces well-formed SVG for many seeds", () => {
    for (let i = 0; i < 50; i++) {
      const svg = svc.bannerSVG(`seed-${i}`);
      const problem = svgProblem(svg);
      expect(problem, `seed-${i}: ${problem}`).toBeNull();
      expect(svg).toContain('viewBox="0 0 100 120"');
    }
  });

  it("is deterministic per seed", () => {
    expect(bannerSVG("House Maren")).toEqual(bannerSVG("House Maren"));
    expect(bannerSVG("House Maren", 24)).toEqual(bannerSVG("House Maren", 24));
  });

  it("different seeds give varied banners (>= 46 unique of 50)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      // Strip the seed-derived clip id so uniqueness reflects real design.
      seen.add(bannerSVG(`banner-${i}`).replace(/b[a-z0-9]+/g, ""));
    }
    expect(seen.size).toBeGreaterThanOrEqual(46);
  });

  it("respects the size parameter (width x 1.2 height)", () => {
    const svg = bannerSVG("sized", 24);
    expect(svg).toContain('width="24" height="29"');
  });

  it("draws only curated tinctures plus fixed accents", () => {
    const allowed = new Set<string>([
      ...TINCTURES.map((t) => t.hex),
      "#ffffff",
      "#000000",
      "none",
    ]);
    for (let i = 0; i < 30; i++) {
      for (const f of fills(bannerSVG(`tinct-${i}`))) {
        expect(allowed.has(f), `unexpected fill ${f} in tinct-${i}`).toBe(true);
      }
    }
  });

  it("keeps a dark outline for readability at small sizes", () => {
    expect(bannerSVG("outline", 24)).toContain('stroke="#241f1c"');
  });

  it("uses a variety of charges across seeds", () => {
    const charges = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const m = bannerSVG(`charge-${i}`).match(/data-charge="([a-z]+)"/);
      if (m) charges.add(m[1]);
    }
    expect(charges.size).toBeGreaterThanOrEqual(8);
  });
});
