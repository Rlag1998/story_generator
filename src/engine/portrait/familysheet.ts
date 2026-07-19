/**
 * Family-sheet renderer: a human-inspection page for portraits and banners.
 *
 * Not a test. Run with:
 *   npx tsx src/engine/portrait/familysheet.ts
 *
 * Renders several families (parents + mixed children), one life across the
 * ages, rare-trait showcases, and a strip of banners at full and tiny size.
 */

/// <reference path="./node-shim.d.ts" />
import { mkdirSync, writeFileSync } from "node:fs";
import { Rng } from "../core/rng";
import type { Phenotype, Sex } from "../core/types";
import { portraitSVG } from "./portrait";
import { bannerSVG } from "./banner";
import { childPhenotype, randomPhenotype } from "./sample";

const OUT =
  "/tmp/claude-0/-home-user-story-generator/19dbdeec-32ed-5bfc-a72d-eab09f7f2608/scratchpad/portraits.html";

function cell(svg: string, label: string): string {
  return `<figure>${svg}<figcaption>${label}</figcaption></figure>`;
}

function familyBlock(seedLabel: string, rng: Rng, kids: number): string {
  const father = randomPhenotype(rng.fork("f"));
  const mother = randomPhenotype(rng.fork("m"));
  const cells: string[] = [
    cell(portraitSVG(father, "m", 38, 120), "father, 38"),
    cell(portraitSVG(mother, "f", 35, 120), "mother, 35"),
  ];
  const ages = [4, 9, 14, 19, 26, 31];
  for (let i = 0; i < kids; i++) {
    const kid = childPhenotype(rng.fork("kid", i), mother, father);
    const sex: Sex = rng.fork("sex", i).chance(0.5) ? "f" : "m";
    const age = ages[i % ages.length];
    cells.push(cell(portraitSVG(kid, sex, age, 120), `child ${i + 1} (${sex}, ${age})`));
  }
  return `<section><h2>Family ${seedLabel}</h2><div class="row">${cells.join("")}</div></section>`;
}

function agesBlock(rng: Rng): string {
  const ph = randomPhenotype(rng);
  const cells = [0, 2, 6, 12, 18, 30, 45, 60, 75, 90].map((age) =>
    cell(portraitSVG(ph, "m", age, 110), `age ${age}`),
  );
  const phf = randomPhenotype(rng.fork("f"));
  const cellsF = [0, 2, 6, 12, 18, 30, 45, 60, 75, 90].map((age) =>
    cell(portraitSVG(phf, "f", age, 110), `age ${age}`),
  );
  return (
    `<section><h2>One man across the years</h2><div class="row">${cells.join("")}</div></section>` +
    `<section><h2>One woman across the years</h2><div class="row">${cellsF.join("")}</div></section>`
  );
}

function raresBlock(rng: Rng): string {
  const traits = [
    "moon-pale",
    "mismatched-eyes",
    "silver-streak",
    "night-eyed",
    "unaging",
  ];
  const cells = traits.map((t, i) => {
    const ph = randomPhenotype(rng.fork(t), { rare: [t] });
    const age = t === "unaging" ? 78 : 30;
    return cell(portraitSVG(ph, i % 2 === 0 ? "f" : "m", age, 120), `${t}${t === "unaging" ? ", 78" : ""}`);
  });
  // Contrast: the same phenotype aged normally.
  const phN = randomPhenotype(rng.fork("unaging"), { rare: [] });
  cells.push(cell(portraitSVG(phN, "m", 78, 120), "same face, aging normally"));
  return `<section><h2>Rare traits</h2><div class="row">${cells.join("")}</div></section>`;
}

function texturesBlock(rng: Rng): string {
  const cells: string[] = [];
  for (let tex = 0; tex < 4; tex++) {
    for (const sex of ["f", "m"] as const) {
      const ph = randomPhenotype(rng.fork("tex", tex, sex));
      ph.hairTexture = tex;
      cells.push(
        cell(portraitSVG(ph, sex, 28, 110), `${["straight", "wavy", "curly", "coiled"][tex]} ${sex}`),
      );
    }
  }
  return `<section><h2>Hair textures</h2><div class="row">${cells.join("")}</div></section>`;
}

function bannersBlock(): string {
  const big: string[] = [];
  const small: string[] = [];
  for (let i = 0; i < 16; i++) {
    const seed = `house-${i}`;
    big.push(cell(bannerSVG(seed, 84), seed));
    small.push(bannerSVG(seed, 24));
  }
  return (
    `<section><h2>Banners</h2><div class="row">${big.join("")}</div>` +
    `<h3>Readable at 24px</h3><div class="row tiny">${small.join("")}</div></section>`
  );
}

export function renderSheet(): string {
  const rng = new Rng("family-sheet", "sheet");
  const body = [
    familyBlock("Maren", rng.fork("fam1"), 5),
    familyBlock("Durroch", rng.fork("fam2"), 5),
    familyBlock("Vessari", rng.fork("fam3"), 5),
    agesBlock(rng.fork("ages")),
    raresBlock(rng.fork("rares")),
    texturesBlock(rng.fork("tex")),
    bannersBlock(),
  ].join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Aeonspire portrait sheet</title>
<style>
  body { font-family: Georgia, serif; background: #f4efe6; color: #33291d; margin: 24px; }
  h2 { border-bottom: 1px solid #c9bda6; padding-bottom: 4px; }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
  figure { margin: 0; text-align: center; }
  figcaption { font-size: 12px; margin-top: 2px; color: #6b5c46; }
  .tiny { align-items: center; gap: 6px; }
</style></head><body>
<h1>Aeonspire portrait &amp; heraldry sheet</h1>
${body}
</body></html>`;
}

// Entry point when run as a script.
mkdirSync(OUT.slice(0, OUT.lastIndexOf("/")), { recursive: true });
writeFileSync(OUT, renderSheet());
console.log("wrote " + OUT);
