/**
 * Schisms: a heresy splits from a parent faith, keeping a strong family
 * resemblance while mutating one to three doctrines. The heresiarch is
 * recorded as founder; the new faith names itself after the founder or the
 * point of contention (heresies always name themselves flatteringly).
 *
 * This module does NOT record chronicle events; the story module drives
 * heresy arcs and records "heresy-preached"/"schism" beats itself.
 */

import type { Rng } from "../../core/rng";
import type { HolyDay, Person, Religion, ReligionId, World } from "../../core/types";
import { nextId } from "../../core/world";
import { monthOf } from "../../core/time";
import { AFTERLIVES, DOCTRINE_PAIRS, FUNERAL_RITES } from "./pools";
import { fillTokens } from "./generate";

export interface SchismReport {
  religion: Religion;
  /** Stable keys of the doctrine mutations applied (1-3). */
  mutations: string[];
  /** Human-readable point of contention, e.g. "the marriage of the clergy". */
  contention: string;
}

type MutationKey =
  | "elevate-deity"
  | "demote-deity"
  | "invert-doctrine"
  | "flip-celibacy"
  | "open-clergy"
  | "add-holy-day"
  | "drop-holy-day"
  | "recast-afterlife"
  | "recast-rite";

const EXALTED_EPITHETS = ["the Highest", "First of the Court", "the True Face", "the Crowned"];

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Deep-copy the mutable parts of a religion so the parent is never touched. */
function cloneDoctrine(parent: Religion): Religion {
  return {
    ...parent,
    deities: parent.deities.map((d) => ({ ...d, domains: [...d.domains] })),
    virtues: [...parent.virtues],
    sins: [...parent.sins],
    holyDays: parent.holyDays.map((h) => ({ ...h })),
    tenets: [...parent.tenets],
  };
}

function stripLeadingThe(name: string): string {
  return name.startsWith("The ") ? name.slice(4) : name;
}

/** Retitle clergy when the mantle changes shoulders. */
function retitleClergy(title: string, gender: Religion["clergyGender"]): string {
  if (gender === "m") {
    return title
      .replace(/mother\b/g, "father")
      .replace(/\bDaughter\b/g, "Son")
      .replace(/-veiled\b/g, "-priest");
  }
  if (gender === "f") {
    return title.replace(/father\b/g, "mother").replace(/\bSon\b/g, "Daughter").replace(/-priest\b/g, "-veiled");
  }
  return title;
}

function founderStem(founder: Person): string {
  const given = founder.givenName.length > 0 ? founder.givenName : "the Founder";
  return given;
}

/** "Kaera" -> "Kaerites", "Aldwin" -> "Aldwinites". */
function adherentFromFounder(founder: Person): string {
  const given = founderStem(founder);
  const stem = /[aeiouy]$/i.test(given) ? given.slice(0, -1) : given;
  return `${stem}ites`;
}

export function makeSchism(
  rng: Rng,
  world: World,
  parent: Religion,
  founder: Person,
): Religion {
  return schismWithReport(rng, world, parent, founder).religion;
}

export function schismWithReport(
  rng: Rng,
  world: World,
  parent: Religion,
  founder: Person,
): SchismReport {
  const r = cloneDoctrine(parent);
  const contentions: string[] = [];
  const mutations: MutationKey[] = [];
  const newTenets: string[] = [];
  let elevatedDeityName: string | null = null;

  // Which quarrels are even possible with this parent.
  const applicable: MutationKey[] = [];
  if (r.deities.length >= 2) applicable.push("elevate-deity");
  if (r.deities.length >= 3) applicable.push("demote-deity");
  if (
    DOCTRINE_PAIRS.some((p) => r.sins.includes(p.sin) || r.virtues.includes(p.virtue))
  ) {
    applicable.push("invert-doctrine");
  }
  applicable.push("flip-celibacy", "open-clergy");
  if (r.holyDays.length < 6) applicable.push("add-holy-day");
  if (r.holyDays.length > 3) applicable.push("drop-holy-day");
  applicable.push("recast-afterlife");
  if (FUNERAL_RITES[r.shape].length > 1) applicable.push("recast-rite");

  const howMany = Math.min(rng.fork("count").intIn(1, 3), applicable.length);
  const chosen = rng.fork("which").pickN(applicable, howMany);

  for (const key of chosen) {
    const mRng = rng.fork("mutate", key);
    switch (key) {
      case "elevate-deity": {
        const idx = mRng.fork("who").intIn(1, r.deities.length - 1);
        const deity = r.deities[idx];
        r.deities.splice(idx, 1);
        r.deities.unshift(deity);
        deity.epithet = mRng.fork("epithet").pick(EXALTED_EPITHETS);
        elevatedDeityName = deity.name;
        contentions.push(`the primacy of ${deity.name}`);
        newTenets.push(`There is no head of the table but ${deity.name}.`);
        break;
      }
      case "demote-deity": {
        // Never denounce the very god this same schism just elevated.
        let idx = mRng.fork("who").int(r.deities.length);
        if (elevatedDeityName && r.deities[idx].name === elevatedDeityName) {
          idx = (idx + 1) % r.deities.length;
        }
        const [gone] = r.deities.splice(idx, 1);
        contentions.push(`the false godhood of ${gone.name}`);
        newTenets.push(`${gone.name} is no god. Strike the name from lintel and prow.`);
        break;
      }
      case "invert-doctrine": {
        const live = DOCTRINE_PAIRS.filter(
          (p) => r.sins.includes(p.sin) || r.virtues.includes(p.virtue),
        );
        const pair = mRng.fork("pair").pick(live);
        if (r.sins.includes(pair.sin)) {
          r.sins = r.sins.filter((s) => s !== pair.sin);
          if (!r.virtues.includes(pair.virtue)) r.virtues.push(pair.virtue);
        } else {
          r.virtues = r.virtues.filter((v) => v !== pair.virtue);
          if (!r.sins.includes(pair.sin)) r.sins.push(pair.sin);
        }
        contentions.push(`the matter of ${pair.subject}`);
        break;
      }
      case "flip-celibacy": {
        r.clergyCelibate = !r.clergyCelibate;
        contentions.push(
          r.clergyCelibate ? "the purity of the clergy" : "the marriage of the clergy",
        );
        newTenets.push(
          r.clergyCelibate
            ? "Who serves the god weds no other."
            : "The {clergy} may wed as any other. The god grudges no one a hearth.",
        );
        break;
      }
      case "open-clergy": {
        const prev = r.clergyGender;
        if (prev === "any") {
          r.clergyGender = mRng.fork("close").chance(0.5) ? "m" : "f";
        } else if (prev === "m") {
          r.clergyGender = mRng.fork("open").chance(0.6) ? "any" : "f";
        } else {
          r.clergyGender = mRng.fork("open").chance(0.6) ? "any" : "m";
        }
        r.clergyTitle = retitleClergy(r.clergyTitle, r.clergyGender);
        contentions.push("who may wear the mantle");
        break;
      }
      case "add-holy-day": {
        let month = monthOf(world.now);
        const taken = new Set(r.holyDays.map((h) => h.month));
        for (let guard = 0; guard < 12 && taken.has(month); guard++) {
          month = (month % 12) + 1;
        }
        const day: HolyDay = {
          name: mRng.fork("name").weightedPairs([
            [`The Vigil of ${founderStem(founder)}`, 2],
            ["The Feast of the Revealing", 1.2],
            ["The Night of the Second Word", 0.8],
          ] as const),
          month,
          theme: "the revealing",
        };
        r.holyDays.push(day);
        r.holyDays.sort((a, b) => a.month - b.month || (a.name < b.name ? -1 : 1));
        contentions.push("the keeping of feasts");
        break;
      }
      case "drop-holy-day": {
        const idx = mRng.fork("which").int(r.holyDays.length);
        const [gone] = r.holyDays.splice(idx, 1);
        contentions.push(`the false feast called ${gone.name}`);
        newTenets.push(`${gone.name} is no feast of ours. Let its lamps go dark.`);
        break;
      }
      case "recast-afterlife": {
        const options = AFTERLIVES[r.shape].filter(
          (a) => fillTokens(a, { chief: r.deities[0]?.name }) !== r.afterlife,
        );
        const pool = options.length > 0 ? options : AFTERLIVES[r.shape];
        r.afterlife = fillTokens(mRng.fork("pick").pick(pool), {
          chief: r.deities[0]?.name,
        });
        contentions.push("what waits beyond");
        break;
      }
      case "recast-rite": {
        const options = FUNERAL_RITES[r.shape].filter(
          (f) => fillTokens(f, { chief: r.deities[0]?.name }) !== r.funeralRite,
        );
        const pool = options.length > 0 ? options : FUNERAL_RITES[r.shape];
        r.funeralRite = fillTokens(mRng.fork("pick").pick(pool), {
          chief: r.deities[0]?.name,
        });
        contentions.push("the right keeping of the dead");
        break;
      }
    }
    mutations.push(key);
  }

  // Zeal moves, more often up than down: heresies burn hot.
  const dz = rng.fork("zeal").range(0.12, 0.32) * (rng.fork("zealsign").chance(0.62) ? 1 : -1);
  r.zeal = clamp(parent.zeal + dz, 0.05, 0.98);

  // Name the new faith after the founder or the quarrel.
  const nRng = rng.fork("name");
  const trunk = stripLeadingThe(parent.name);
  const namePatterns: [string, number][] = [
    [`The True ${trunk}`, 2],
    [`The Old ${trunk}`, 1],
    [`The Way of ${founderStem(founder)}`, 1.4],
    [`${founderStem(founder)}'s Creed`, 0.8],
  ];
  if (elevatedDeityName) namePatterns.push([`The House of ${elevatedDeityName}`, 1.6]);
  r.name = nRng.weightedPairs(namePatterns);
  if (r.name === parent.name) r.name = `The True ${trunk}`;

  const aRng = rng.fork("adherent");
  r.adherentName = aRng.weightedPairs([
    [adherentFromFounder(founder), 1.6],
    [`True ${parent.adherentName}`, 1.2],
    [`${founderStem(founder)}'s Folk`, 1],
  ] as const);

  // Lineage.
  r.parent = parent.id;
  r.founder = founder.id;
  r.origin = founder.culture;

  // New tenets remember the quarrel; the inherited body is kept, trimmed
  // from its tail only if the sum would sprawl.
  const filledNew = newTenets.map((t) => fillTokens(t, { clergy: r.clergyTitle }));
  const keepInherited = Math.max(2, 7 - filledNew.length);
  r.tenets = [...r.tenets.slice(0, keepInherited), ...filledNew];

  // Register the new faith. The engine assigns ids for worldgen religions;
  // schisms happen mid-history at the story module's request, so the id is
  // allocated (deterministically) and the faith registered here.
  const id = nextId(world, "religion") as ReligionId;
  r.id = id;
  world.religions.set(id, r);

  return { religion: r, mutations, contention: contentions[0] ?? "old grievances" };
}
