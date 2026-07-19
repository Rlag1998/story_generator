/**
 * Engine orchestrator: worldgen pipeline + the monthly tick loop.
 *
 * This is the only file that imports all module services. Modules never
 * import each other — they receive the `Services` registry via Ctx.
 */

import { Rng } from "./core/rng";
import { MONTHS_PER_YEAR, yearOf } from "./core/time";
import type {
  Culture,
  CultureId,
  Ctx,
  Language,
  Region,
  RegionId,
  Religion,
  ReligionId,
  Services,
  Settlement,
  SettlementId,
  World,
  WorldParams,
} from "./core/types";
import { createEmptyWorld, nextId, recordEvent } from "./core/world";

import { createLanguageService } from "./gen/language";
import { createCultureService } from "./gen/culture";
import { createReligionService } from "./gen/religion";
import { createGeneticsService } from "./genetics";
import { createPortraitService } from "./portrait";
import { createPeopleService } from "./people";
import { createSocialService } from "./social";
import { createPoliticsService } from "./politics";
import { createStoryService } from "./story";
import { createEconomyService } from "./economy";
import { createNarrativeService } from "./narrative";

export interface Engine {
  world: World;
  services: Services;
  /** Advance one month. */
  tick(): void;
  runMonths(n: number): void;
  runYears(n: number): void;
}

export function createServices(): Services {
  return {
    language: createLanguageService(),
    culture: createCultureService(),
    religion: createReligionService(),
    genetics: createGeneticsService(),
    portrait: createPortraitService(),
    people: createPeopleService(),
    social: createSocialService(),
    politics: createPoliticsService(),
    story: createStoryService(),
    economy: createEconomyService(),
    narrative: createNarrativeService(),
  };
}

export const DEFAULT_PARAMS: Omit<WorldParams, "seed"> = {
  startPop: 600,
  popCap: 2600,
  regions: 7,
  cultures: 3,
  startYear: 1,
};

const BIOMES = [
  "coast",
  "plains",
  "forest",
  "hills",
  "mountains",
  "marsh",
  "steppe",
  "highlands",
] as const;

export function createEngine(seed: string, overrides?: Partial<WorldParams>): Engine {
  const params: WorldParams = { ...DEFAULT_PARAMS, seed, ...overrides };
  const world = createEmptyWorld(params);
  const services = createServices();
  const root = new Rng(params.seed, `world:${params.seed}`);

  generateWorld(root, world, services);

  const engine: Engine = {
    world,
    services,
    tick: () => tickOnce(root, world, services),
    runMonths(n: number) {
      for (let i = 0; i < n; i++) this.tick();
    },
    runYears(n: number) {
      this.runMonths(n * MONTHS_PER_YEAR);
    },
  };
  return engine;
}

// ---------------------------------------------------------------------------
// Worldgen pipeline
// ---------------------------------------------------------------------------

function generateWorld(root: Rng, world: World, services: Services): void {
  const rng = root.fork("worldgen");

  // 1. Languages — one family tree; some cultures share a family.
  const langRng = rng.fork("languages");
  const languages: Language[] = [];
  const nCultures = world.params.cultures;
  let rootLang: Language | null = null;
  for (let i = 0; i < nCultures; i++) {
    let lang: Language;
    if (rootLang && langRng.chance(0.45)) {
      lang = services.language.derive(langRng.fork("derive", i), rootLang);
    } else {
      lang = services.language.generate(langRng.fork("gen", i));
      if (!rootLang) rootLang = lang;
    }
    lang.id = nextId(world, "language");
    world.languages.set(lang.id, lang);
    languages.push(lang);
  }

  // 2. Cultures.
  const cultRng = rng.fork("cultures");
  const cultures: Culture[] = [];
  for (let i = 0; i < nCultures; i++) {
    const culture = services.culture.generate(cultRng.fork(i), world, languages[i]);
    culture.id = nextId(world, "culture");
    world.cultures.set(culture.id, culture);
    cultures.push(culture);
  }

  // 3. Religions — one per culture (schisms come later, in history).
  const relRng = rng.fork("religions");
  const religions: Religion[] = [];
  for (let i = 0; i < cultures.length; i++) {
    const religion = services.religion.generate(relRng.fork(i), world, cultures[i]);
    religion.id = nextId(world, "religion");
    religion.origin = cultures[i].id;
    world.religions.set(religion.id, religion);
    religions.push(religion);
  }

  // 4. Regions — a connected chain/web of named regions with biomes.
  const geoRng = rng.fork("regions");
  const regionIds: RegionId[] = [];
  const nRegions = world.params.regions;
  for (let i = 0; i < nRegions; i++) {
    const cultureIdx = Math.min(cultures.length - 1, Math.floor((i * cultures.length) / nRegions));
    const lang = languages[cultureIdx];
    const id = nextId(world, "region") as RegionId;
    const region: Region = {
      id,
      name: services.language.placeName(geoRng.fork("name", i), lang, "region"),
      biome: geoRng.fork("biome", i).pick(BIOMES),
      adjacent: [],
      settlements: [],
      x: 12 + (i % 4) * 25 + geoRng.fork("x", i).range(-6, 6),
      y: 15 + Math.floor(i / 4) * 30 + geoRng.fork("y", i).range(-8, 8),
    };
    world.regions.set(id, region);
    regionIds.push(id);
  }
  // Adjacency: chain plus extra links for a web.
  for (let i = 1; i < regionIds.length; i++) {
    link(world, regionIds[i - 1], regionIds[i]);
  }
  for (let i = 0; i < regionIds.length; i++) {
    const extra = geoRng.fork("extra", i);
    if (extra.chance(0.5)) {
      const j = extra.int(regionIds.length);
      if (j !== i) link(world, regionIds[i], regionIds[j]);
    }
  }

  // 5. Settlements — 2-3 per region, culture assigned geographically.
  const setRng = rng.fork("settlements");
  const settlementsByCulture: Map<CultureId, SettlementId[]> = new Map();
  for (let i = 0; i < regionIds.length; i++) {
    const region = world.regions.get(regionIds[i])!;
    const cultureIdx = Math.min(cultures.length - 1, Math.floor((i * cultures.length) / nRegions));
    const culture = cultures[cultureIdx];
    const lang = languages[cultureIdx];
    const count = setRng.fork("count", i).intIn(2, 3);
    for (let s = 0; s < count; s++) {
      const id = nextId(world, "settlement") as SettlementId;
      const kindRng = setRng.fork("kind", i, s);
      const kind =
        s === 0
          ? kindRng.chance(0.5)
            ? ("town" as const)
            : ("stronghold" as const)
          : region.biome === "coast" && kindRng.chance(0.5)
            ? ("port" as const)
            : ("village" as const);
      const settlement: Settlement = {
        id,
        name: services.language.placeName(setRng.fork("name", i, s), lang, "settlement"),
        kind,
        region: region.id,
        polity: 0, // assigned by politics.found()
        abstractPop: kind === "village" ? setRng.fork("pop", i, s).intIn(80, 250) : setRng.fork("pop", i, s).intIn(300, 900),
        founded: world.now,
        economy: economyTags(setRng.fork("econ", i, s), region.biome),
        conditions: {},
      };
      world.settlements.set(id, settlement);
      region.settlements.push(id);
      const list = settlementsByCulture.get(culture.id) ?? [];
      list.push(id);
      settlementsByCulture.set(culture.id, list);
    }
  }

  // 6. Polities, noble houses, courts.
  services.politics.found(rng.fork("politics"), world, services);

  // 7. Founder population.
  const popRng = rng.fork("population");
  const perCulture = Math.floor(world.params.startPop / cultures.length);
  for (let ci = 0; ci < cultures.length; ci++) {
    const culture = cultures[ci];
    const religion = religions[ci];
    const spots = settlementsByCulture.get(culture.id) ?? [];
    if (spots.length === 0) continue;
    seedFounderFamilies(popRng.fork(ci), world, services, culture.id, religion.id, spots, perCulture);
  }

  // 8. Run a few "quiet years" to knit the social fabric before history opens.
  //    (Events during warmup are kept — they're the world's deep past.)
}

function link(world: World, a: RegionId, b: RegionId): void {
  const ra = world.regions.get(a)!;
  const rb = world.regions.get(b)!;
  if (!ra.adjacent.includes(b)) ra.adjacent.push(b);
  if (!rb.adjacent.includes(a)) rb.adjacent.push(a);
}

function economyTags(rng: Rng, biome: string): string[] {
  const base: Record<string, string[]> = {
    coast: ["fishing", "shipwrights", "salt"],
    plains: ["grain", "horses", "wool"],
    forest: ["timber", "furs", "charcoal"],
    hills: ["ore", "quarries", "vineyards"],
    mountains: ["ore", "gems", "goats"],
    marsh: ["reeds", "eels", "peat"],
    steppe: ["horses", "herds", "hides"],
    highlands: ["wool", "cattle", "barley"],
  };
  const opts = base[biome] ?? ["grain"];
  return rng.pickN(opts, 2);
}

function seedFounderFamilies(
  rng: Rng,
  world: World,
  services: Services,
  culture: CultureId,
  religion: ReligionId,
  spots: SettlementId[],
  target: number,
): void {
  let created = 0;
  let fi = 0;
  while (created < target) {
    const location = spots[fi % spots.length];
    const famRng = rng.fork("family", fi);
    // A founding couple (some singles too).
    const single = famRng.chance(0.18);
    const wife = services.people.createFounder(famRng.fork("w"), world, services, {
      culture,
      religion,
      location,
      house: null,
      sex: "f",
      ageYears: famRng.fork("wage").intIn(18, 34),
    });
    created++;
    if (!single) {
      const husband = services.people.createFounder(famRng.fork("h"), world, services, {
        culture,
        religion,
        location,
        house: null,
        sex: "m",
        ageYears: famRng.fork("hage").intIn(20, 40),
      });
      created++;
      // Marry them quietly (pre-history; no event recorded).
      wife.marriages.push({ spouse: husband.id, date: world.now, active: true });
      husband.marriages.push({ spouse: wife.id, date: world.now, active: true });
      // Some founding couples already have children.
      const kids = famRng.fork("kids").weightedPairs([
        [0, 3],
        [1, 3],
        [2, 2.5],
        [3, 1.5],
        [4, 0.6],
      ] as const);
      for (let k = 0; k < kids && created < target + 3; k++) {
        services.people.createChild(famRng.fork("kid", k), world, services, wife, husband);
        created++;
      }
    }
    fi++;
    if (fi > target * 3) break; // safety
  }
}

// ---------------------------------------------------------------------------
// Tick loop
// ---------------------------------------------------------------------------

function tickOnce(root: Rng, world: World, services: Services): void {
  world.now += 1;
  world.stats.year = yearOf(world.now);
  const tickRng = root.fork("tick", world.now);
  const ctx: Ctx = {
    world,
    services,
    rng: tickRng,
    record: (ev) => recordEvent(world, ev),
  };
  // Fixed order — never reorder (determinism + causal sanity).
  services.economy.tick(ctx);
  services.religion.tick(ctx);
  services.politics.tick(ctx);
  services.story.tick(ctx);
  services.social.tick(ctx);
  services.people.marriageTick(ctx);
  services.people.tick(ctx);
  world.stats.alive = world.alive.size;
}
