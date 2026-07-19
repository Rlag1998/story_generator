/**
 * Religion generation: a faith grown from a culture's values, attitudes and
 * tongue, coherent from its shape (pantheon, dualist, monist, ancestor,
 * animist, mystery) down to its clergy, calendar, morals and burial customs.
 *
 * All randomness is labeled-substream forking from the provided Rng, so
 * adding draws to one aspect never perturbs another.
 */

import type { Rng } from "../../core/rng";
import type {
  Culture,
  CultureValue,
  Deity,
  DeityId,
  HolyDay,
  Language,
  Religion,
  ReligionShape,
  World,
} from "../../core/types";
import { nextId } from "../../core/world";
import {
  AFTERLIVES,
  ANCESTOR_DOMAINS,
  ANCESTOR_EPITHETS,
  ANIMIST_DOMAINS,
  ANIMIST_EPITHETS,
  CLERGY_ROOTS,
  DEITY_DAY_PATTERNS,
  DOCTRINE_PAIRS,
  DOMAIN_BY_KEY,
  DOMAINS,
  DUALIST_AXES,
  FAITH_NOUNS,
  FUNERAL_RITES,
  MONIST_DOMAINS,
  MONIST_EPITHETS,
  MYSTERY_GUIDE_DOMAINS,
  MYSTERY_GUIDE_EPITHETS,
  MYSTERY_VEILED_DOMAINS,
  MYSTERY_VEILED_EPITHETS,
  SEASON_DAYS,
  SHAPE_DAYS,
  SHAPE_FAITH_NAMES,
  SIN_POOL,
  TENETS,
  VALUE_DOMAINS,
  VIRTUE_POOL,
  type FaithNoun,
  type Temper,
} from "./pools";
import { cap, forgeName, forgeWord } from "./words";

// ---------------------------------------------------------------------------
// Token filling
// ---------------------------------------------------------------------------

export interface ProseTokens {
  chief?: string;
  adversary?: string;
  clergy?: string;
  holy?: string;
}

export function fillTokens(text: string, t: ProseTokens): string {
  return text
    .replace(/\{chief\}/g, t.chief ?? "the god")
    .replace(/\{adversary\}/g, t.adversary ?? "the dark")
    .replace(/\{clergy\}/g, t.clergy ?? "the priests")
    .replace(/\{holy\}/g, t.holy ?? "the holy day");
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export function pickShape(rng: Rng, culture: Culture): ReligionShape {
  const v = new Set<CultureValue>(culture.values);
  const mys = culture.attitudes.mysticism;
  return rng.weightedPairs([
    [
      "pantheon",
      3 +
        (v.has("conquest") ? 1.2 : 0) +
        (v.has("revelry") ? 1 : 0) +
        (v.has("seafaring") ? 0.6 : 0) +
        (v.has("hospitality") ? 0.3 : 0),
    ],
    [
      "dualist",
      1 +
        mys * 0.6 +
        (v.has("piety") ? 0.7 : 0) +
        (v.has("austerity") ? 0.6 : 0) +
        (v.has("vengeance") ? 0.5 : 0) +
        (v.has("stoicism") ? 0.4 : 0),
    ],
    [
      "monist",
      1 +
        (v.has("piety") ? 1.4 : 0) +
        (v.has("learning") ? 0.9 : 0) +
        (v.has("austerity") ? 1 : 0) +
        (v.has("stoicism") ? 0.4 : 0),
    ],
    [
      "ancestor",
      1.1 +
        (v.has("kinship") ? 2.2 : 0) +
        (v.has("honor") ? 0.5 : 0) +
        (v.has("craftsmanship") ? 0.3 : 0),
    ],
    [
      "animist",
      (mys < 0.3 ? 0.4 : 0.9) +
        mys * 1.4 +
        (v.has("seafaring") ? 0.5 : 0) +
        (v.has("artistry") ? 0.3 : 0),
    ],
    ["mystery", (mys < 0.3 ? 0.2 : 0.5) + mys * 1.5 + (v.has("learning") ? 0.7 : 0)],
  ] as const);
}

function pickZeal(rng: Rng, culture: Culture, shape: ReligionShape): number {
  const base: Record<ReligionShape, number> = {
    pantheon: 0.35,
    dualist: 0.55,
    monist: 0.5,
    ancestor: 0.3,
    animist: 0.25,
    mystery: 0.45,
  };
  let z = base[shape];
  if (culture.values.includes("piety")) z += 0.15;
  if (culture.values.includes("austerity")) z += 0.08;
  if (culture.values.includes("revelry")) z -= 0.07;
  z += culture.attitudes.mysticism * 0.08;
  z += rng.range(-0.12, 0.12);
  return clamp(z, 0.05, 0.95);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// ---------------------------------------------------------------------------
// Deities
// ---------------------------------------------------------------------------

function makeDeity(
  world: World,
  name: string,
  epithet: string,
  domains: string[],
  temper: Temper,
): Deity {
  return { id: nextId(world, "deity") as DeityId, name, epithet, domains, temper };
}

/** Order the domain pool by cultural pull, with rng jitter. */
function orderedDomains(rng: Rng, culture: Culture): string[] {
  const favored = new Set<string>();
  for (const value of culture.values) {
    for (const key of VALUE_DOMAINS[value] ?? []) favored.add(key);
  }
  const scored = DOMAINS.map((d) => ({
    key: d.key,
    score: rng.next() + (favored.has(d.key) ? 0.9 : 0),
  }));
  scored.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  return scored.map((s) => s.key);
}

function epithetFor(rng: Rng, domainKey: string): string {
  const flavor = DOMAIN_BY_KEY.get(domainKey);
  return flavor ? rng.pick(flavor.epithets) : "the Unnamed";
}

function temperFor(rng: Rng, domainKey: string): Temper {
  const flavor = DOMAIN_BY_KEY.get(domainKey);
  return flavor ? rng.pick(flavor.tempers) : "distant";
}

function makeDeities(
  rng: Rng,
  world: World,
  lang: Language | undefined,
  culture: Culture,
  shape: ReligionShape,
): Deity[] {
  const out: Deity[] = [];
  const usedNames = new Set<string>();
  const name = (streamRng: Rng): string => {
    for (let i = 0; i < 6; i++) {
      const n = forgeName(streamRng, lang);
      if (!usedNames.has(n)) {
        usedNames.add(n);
        return n;
      }
    }
    const fallback = forgeName(streamRng, lang) + forgeWord(streamRng, lang, 1, 1);
    usedNames.add(fallback);
    return fallback;
  };

  switch (shape) {
    case "pantheon": {
      const count = rng.fork("count").intIn(4, 9);
      const pool = orderedDomains(rng.fork("order"), culture);
      let cursor = 0;
      for (let i = 0; i < count; i++) {
        const dRng = rng.fork("deity", i);
        const take = dRng.weightedPairs([
          [1, 1],
          [2, 2],
          [3, 1.1],
        ] as const);
        const domains = pool.slice(cursor, cursor + take);
        cursor += take;
        if (domains.length === 0) domains.push(pool[cursor % pool.length]);
        out.push(
          makeDeity(
            world,
            name(dRng.fork("name")),
            epithetFor(dRng.fork("epithet"), domains[0]),
            domains,
            temperFor(dRng.fork("temper"), domains[0]),
          ),
        );
      }
      break;
    }
    case "dualist": {
      const axis = rng.fork("axis").pick(DUALIST_AXES);
      const bRng = rng.fork("bright");
      const dRng = rng.fork("dark");
      out.push(
        makeDeity(
          world,
          name(bRng.fork("name")),
          bRng.fork("epithet").pick(axis.bright.epithets),
          axis.bright.domains.slice(),
          bRng.fork("temper").pick(axis.bright.tempers),
        ),
      );
      out.push(
        makeDeity(
          world,
          name(dRng.fork("name")),
          dRng.fork("epithet").pick(axis.dark.epithets),
          axis.dark.domains.slice(),
          dRng.fork("temper").pick(axis.dark.tempers),
        ),
      );
      break;
    }
    case "monist": {
      const gRng = rng.fork("godhead");
      out.push(
        makeDeity(
          world,
          name(gRng.fork("name")),
          gRng.fork("epithet").pick(MONIST_EPITHETS),
          gRng.fork("domains").pickN(MONIST_DOMAINS, gRng.fork("dcount").intIn(2, 3)),
          gRng.fork("temper").weightedPairs([
            ["distant", 2.2],
            ["kind", 1],
            ["stern", 1],
          ] as const),
        ),
      );
      break;
    }
    case "ancestor": {
      const count = rng.fork("count").intIn(2, 4);
      const epithets = rng.fork("epithets").pickN(ANCESTOR_EPITHETS, count);
      for (let i = 0; i < count; i++) {
        const aRng = rng.fork("ancestor", i);
        out.push(
          makeDeity(
            world,
            name(aRng.fork("name")),
            epithets[i],
            aRng.fork("domains").pickN(ANCESTOR_DOMAINS, aRng.fork("dcount").intIn(1, 2)),
            aRng.fork("temper").weightedPairs([
              ["kind", 1.4],
              ["stern", 1.2],
              ["distant", 1],
            ] as const),
          ),
        );
      }
      break;
    }
    case "animist": {
      const count = rng.fork("count").intIn(3, 6);
      const epithets = rng.fork("epithets").pickN(ANIMIST_EPITHETS, count);
      const domains = rng.fork("domains").pickN(ANIMIST_DOMAINS, count);
      for (let i = 0; i < count; i++) {
        const sRng = rng.fork("spirit", i);
        out.push(
          makeDeity(
            world,
            name(sRng.fork("name")),
            epithets[i],
            [domains[i % domains.length]],
            sRng.fork("temper").weightedPairs([
              ["capricious", 1.6],
              ["kind", 1],
              ["hungry", 0.8],
            ] as const),
          ),
        );
      }
      break;
    }
    case "mystery": {
      const vRng = rng.fork("veiled");
      out.push(
        makeDeity(
          world,
          name(vRng.fork("name")),
          vRng.fork("epithet").pick(MYSTERY_VEILED_EPITHETS),
          vRng.fork("domains").pickN(MYSTERY_VEILED_DOMAINS, vRng.fork("dcount").intIn(2, 3)),
          "distant",
        ),
      );
      if (rng.fork("guide").chance(0.55)) {
        const gRng = rng.fork("guide-deity");
        out.push(
          makeDeity(
            world,
            name(gRng.fork("name")),
            gRng.fork("epithet").pick(MYSTERY_GUIDE_EPITHETS),
            gRng.fork("domains").pickN(MYSTERY_GUIDE_DOMAINS, 1),
            gRng.fork("temper").pick(["kind", "capricious"] as const),
          ),
        );
      }
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Morals
// ---------------------------------------------------------------------------

function pickMorals(
  rng: Rng,
  culture: Culture,
  shape: ReligionShape,
): { virtues: string[]; sins: string[] } {
  const values = new Set<CultureValue>(culture.values);
  const score = (streamRng: Rng, entry: { values: CultureValue[]; shapes?: ReligionShape[] }) => {
    let s = streamRng.next();
    if (entry.values.some((v) => values.has(v))) s += 1.4;
    if (entry.shapes?.includes(shape)) s += 1.8;
    return s;
  };
  const vRng = rng.fork("virtues");
  const sRng = rng.fork("sins");
  const virtues = VIRTUE_POOL.map((e) => ({ text: e.text, s: score(vRng, e) }))
    .sort((a, b) => b.s - a.s || (a.text < b.text ? -1 : 1))
    .slice(0, rng.fork("vcount").intIn(4, 7))
    .map((e) => e.text);
  const sins = SIN_POOL.map((e) => ({ text: e.text, s: score(sRng, e) }))
    .sort((a, b) => b.s - a.s || (a.text < b.text ? -1 : 1))
    .slice(0, rng.fork("scount").intIn(4, 7))
    .map((e) => e.text);

  // Sometimes take a stand on a disputed doctrine, so schisms have live
  // material to invert.
  const pRng = rng.fork("pair");
  if (pRng.chance(0.75)) {
    const pair = pRng.pick(DOCTRINE_PAIRS);
    if (pRng.chance(0.5)) {
      if (!virtues.includes(pair.virtue)) {
        if (virtues.length >= 7) virtues.pop();
        virtues.push(pair.virtue);
      }
    } else if (!sins.includes(pair.sin)) {
      if (sins.length >= 7) sins.pop();
      sins.push(pair.sin);
    }
  }
  return { virtues, sins };
}

// ---------------------------------------------------------------------------
// Holy days
// ---------------------------------------------------------------------------

function seasonOfMonth(m: number): number {
  if (m >= 3 && m <= 5) return 0;
  if (m >= 6 && m <= 8) return 1;
  if (m >= 9 && m <= 11) return 2;
  return 3;
}

function makeHolyDays(
  rng: Rng,
  culture: Culture,
  shape: ReligionShape,
  deities: Deity[],
): HolyDay[] {
  const n = rng.fork("count").intIn(3, 5);
  // Stratified months: disjoint windows across the year, one pick per window,
  // so feasts spread instead of clumping.
  const months: number[] = [];
  for (let i = 0; i < n; i++) {
    const lo = Math.floor((i * 12) / n) + 1;
    const hi = Math.floor(((i + 1) * 12) / n);
    months.push(rng.fork("month", i).intIn(lo, Math.max(lo, hi)));
  }

  const seafolk = culture.values.includes("seafaring");
  const used = new Set<string>();
  const feastedGods = new Set<string>();
  const days: HolyDay[] = [];
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    const dRng = rng.fork("day", i);
    let day: HolyDay | null = null;
    // Occasionally the day belongs to a named god outright (one feast each).
    const unfeasted = deities.filter((d) => !feastedGods.has(d.name));
    if (unfeasted.length > 0 && dRng.fork("deity?").chance(0.25)) {
      const deity = dRng.fork("which").pick(unfeasted);
      const pattern = dRng.fork("pattern").pick(DEITY_DAY_PATTERNS);
      const dayName = pattern.replace("{d}", deity.name);
      if (!used.has(dayName)) {
        day = { name: dayName, month: m, theme: deity.domains[0] ?? "devotion" };
        feastedGods.add(deity.name);
      }
    }
    if (!day) {
      const season = SEASON_DAYS[seasonOfMonth(m)];
      // Sea-feasts belong to sea-minded folk; inland faiths mostly pass.
      const template = dRng.fork("template").weighted(
        season,
        season.map((t) => (t.theme.includes("sea") ? (seafolk ? 2.2 : 0.25) : 1)),
      );
      let dayName = dRng.fork("name").pick(template.names);
      if (used.has(dayName)) {
        const alternatives = template.names.filter((nm) => !used.has(nm));
        dayName = alternatives.length > 0 ? alternatives[0] : dayName + " Again";
      }
      day = { name: dayName, month: m, theme: template.theme };
    }
    used.add(day.name);
    days.push(day);
  }

  // Shape-required feasts: the honored dead, the mysteries, the balance.
  const required = SHAPE_DAYS[shape];
  if (required && !days.some((d) => d.theme === required[0].theme)) {
    const template = required[0];
    const rRng = rng.fork("required");
    const preferredMonth = shape === "dualist" ? (rRng.fork("side").chance(0.5) ? 3 : 9) : 11;
    // Replace the day whose month lies closest to the preferred month.
    let best = 0;
    for (let i = 1; i < days.length; i++) {
      if (Math.abs(days[i].month - preferredMonth) < Math.abs(days[best].month - preferredMonth)) {
        best = i;
      }
    }
    const candidates = template.names.filter((nm) => !used.has(nm));
    days[best] = {
      name: candidates.length > 0 ? rRng.fork("name").pick(candidates) : template.names[0],
      month: days[best].month,
      theme: template.theme,
    };
  }
  return days;
}

// ---------------------------------------------------------------------------
// Clergy
// ---------------------------------------------------------------------------

interface Clergy {
  title: string;
  gender: Religion["clergyGender"];
  celibate: boolean;
}

function pickClergy(
  rng: Rng,
  culture: Culture,
  shape: ReligionShape,
  zeal: number,
  lang: Language | undefined,
  noun: FaithNoun,
  chief: Deity | null,
): Clergy {
  const p = culture.attitudes.patriarchy;
  let gender: Religion["clergyGender"];
  if (shape === "ancestor") {
    // House elders keep the shrines; only hard patriarchy narrows it.
    gender = p > 0.75 ? "m" : "any";
  } else if (p > 0.65) {
    gender = rng.fork("gender").weightedPairs([
      ["m", 3],
      ["any", 1],
    ] as const);
  } else if (p < 0.3) {
    gender = rng.fork("gender").weightedPairs([
      ["any", 2.2],
      ["f", 2],
      ["m", 0.8],
    ] as const);
  } else {
    gender = rng.fork("gender").weightedPairs([
      ["any", 2.7],
      ["m", 1.2],
      ["f", 1.1],
    ] as const);
  }

  const celibacyBase: Record<ReligionShape, number> = {
    pantheon: 0.1,
    dualist: 0.2,
    monist: 0.3,
    ancestor: 0.02,
    animist: 0.05,
    mystery: 0.35,
  };
  const celibate = rng.fork("celibate").chance(clamp(celibacyBase[shape] + zeal * 0.2, 0, 0.9));

  const tRng = rng.fork("title");
  const root = tRng.fork("root").chance(0.45) ? noun.stem : tRng.fork("rootpick").pick(CLERGY_ROOTS);
  const native = cap(forgeWord(tRng.fork("native"), lang, 2, 3));
  let title: string;
  if (tRng.fork("native?").chance(0.3)) {
    title = native;
  } else if (gender === "f") {
    title = tRng.fork("pattern").weightedPairs([
      [`${root}mother`, 2.5],
      [`Daughter of ${noun.phrase}`, 1],
      [`the ${root}-veiled`, 0.8],
    ] as const);
  } else if (gender === "m") {
    title = tRng.fork("pattern").weightedPairs([
      [`${root}father`, 2.2],
      [`${root}-priest`, 1.4],
      [`Son of ${noun.phrase}`, 0.8],
    ] as const);
  } else {
    const voiceOf = chief ? `Voice of ${chief.name}` : `Voice of ${noun.phrase}`;
    title = tRng.fork("pattern").weightedPairs([
      [`${root}warden`, 1.8],
      [`Keeper of ${noun.phrase}`, 1.6],
      [`${root}-speaker`, 1.4],
      [voiceOf, 1],
    ] as const);
  }
  return { title, gender, celibate };
}

// ---------------------------------------------------------------------------
// Naming the faith
// ---------------------------------------------------------------------------

function pickFaithNoun(rng: Rng, shape: ReligionShape): FaithNoun {
  const weights = FAITH_NOUNS.map((n) =>
    !n.shapes ? 1 : n.shapes.includes(shape) ? 2.4 : 0.15,
  );
  return rng.weighted(FAITH_NOUNS, weights);
}

function nameFaith(
  rng: Rng,
  lang: Language | undefined,
  shape: ReligionShape,
  noun: FaithNoun,
  chief: Deity | null,
): { name: string; adherentName: string } {
  const native = cap(forgeWord(rng.fork("native"), lang, 2, 3));
  const patterns: [string, number][] = [
    [`The Way of ${noun.phrase}`, 3],
    [`The Creed of ${noun.phrase}`, 1.2],
    [`The Rite of ${noun.phrase}`, 1],
    [`The Faith of ${noun.phrase}`, 0.8],
    [`The Way of ${native}`, 1],
    [`The ${native} Creed`, 0.5],
  ];
  if (chief) patterns.push([`The House of ${chief.name}`, shape === "pantheon" ? 1.4 : 0.5]);
  for (const special of SHAPE_FAITH_NAMES[shape] ?? []) patterns.push([special, 0.5]);
  const name = rng.fork("name").weightedPairs(patterns);

  const adherentPatterns: [string, number][] = [
    [`${noun.stem}kind`, 2.2],
    [`${noun.stem}folk`, 1.5],
    [`${noun.stem}-sworn`, 1.2],
  ];
  if (chief) adherentPatterns.push([`Children of ${chief.name}`, 1.1]);
  const adherentName = rng.fork("adherent").weightedPairs(adherentPatterns);
  return { name, adherentName };
}

// ---------------------------------------------------------------------------
// Tenets
// ---------------------------------------------------------------------------

function pickTenets(
  rng: Rng,
  culture: Culture,
  shape: ReligionShape,
  tokens: ProseTokens,
): string[] {
  const values = new Set<CultureValue>(culture.values);
  const n = rng.fork("count").intIn(3, 6);
  const scoreRng = rng.fork("scores");
  const scored: { text: string; s: number; shapeTagged: boolean }[] = [];
  for (const entry of TENETS) {
    const draw = scoreRng.next(); // one draw per pool entry, pool order is static
    if (entry.shapes && !entry.shapes.includes(shape)) continue;
    if (entry.values && !entry.values.some((v) => values.has(v))) continue;
    let s = draw;
    if (entry.shapes) s += 1.1;
    if (entry.values) s += 0.7;
    scored.push({ text: entry.text, s, shapeTagged: !!entry.shapes });
  }
  scored.sort((a, b) => b.s - a.s || (a.text < b.text ? -1 : 1));
  const chosen = scored.slice(0, n);
  // Every faith carries at least one tenet that marks its shape.
  if (!chosen.some((c) => c.shapeTagged)) {
    const bestShape = scored.find((c) => c.shapeTagged);
    if (bestShape) chosen[chosen.length - 1] = bestShape;
  }
  return chosen.map((c) => fillTokens(c.text, tokens));
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function generateReligion(rng: Rng, world: World, culture: Culture): Religion {
  const lang = world.languages.get(culture.language);
  const shape = pickShape(rng.fork("shape"), culture);
  const zeal = pickZeal(rng.fork("zeal"), culture, shape);
  const deities = makeDeities(rng.fork("deities"), world, lang, culture, shape);
  const chief = deities.length > 0 ? deities[0] : null;
  const noun = pickFaithNoun(rng.fork("noun"), shape);
  const clergy = pickClergy(rng.fork("clergy"), culture, shape, zeal, lang, noun, chief);
  const { virtues, sins } = pickMorals(rng.fork("morals"), culture, shape);
  const holyDays = makeHolyDays(rng.fork("holydays"), culture, shape, deities);

  const tokens: ProseTokens = {
    chief: chief?.name,
    adversary: deities.length > 1 ? deities[1].name : undefined,
    clergy: clergy.title,
    holy: holyDays.length > 0 ? holyDays[0].name : undefined,
  };

  // Name the faith, avoiding collisions with faiths already in the world.
  let named = nameFaith(rng.fork("name"), lang, shape, noun, chief);
  for (let attempt = 0; attempt < 4; attempt++) {
    const taken = [...world.religions.values()].some((r) => r.name === named.name);
    if (!taken) break;
    named = nameFaith(rng.fork("name", attempt), lang, shape, noun, chief);
  }

  const funeralRite = fillTokens(rng.fork("funeral").pick(FUNERAL_RITES[shape]), tokens);
  const afterlife = fillTokens(rng.fork("afterlife").pick(AFTERLIVES[shape]), tokens);
  const tenets = pickTenets(rng.fork("tenets"), culture, shape, tokens);

  return {
    id: 0,
    name: named.name,
    adherentName: named.adherentName,
    shape,
    deities,
    virtues,
    sins,
    holyDays,
    clergyTitle: clergy.title,
    clergyCelibate: clergy.celibate,
    clergyGender: clergy.gender,
    funeralRite,
    afterlife,
    origin: culture.id,
    parent: null,
    founder: null,
    zeal,
    tenets,
  };
}
