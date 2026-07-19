/**
 * Health: illness onset and course, evocative sickness names, plague
 * infection under settlement conditions, and the wounds of dangerous work.
 */

import type { Ctx, EventId, Illness, Person, ProfessionKey, Settlement } from "../core/types";
import type { Rng } from "../core/rng";
import { monthsBetween, seasonOf } from "../core/time";
import {
  F,
  type LocalConditions,
  ageOf,
  clamp,
  clamp01,
  hasRareTrait,
  whereabouts,
} from "./helpers";
import { kill } from "./death";

// ---------------------------------------------------------------------------
// Illness names
// ---------------------------------------------------------------------------

const ILL_ADJ = [
  "grey",
  "red",
  "white",
  "black",
  "weeping",
  "shaking",
  "burning",
  "creeping",
  "winter",
  "marsh",
  "harvest",
  "milk",
  "bone",
  "salt",
  "spotted",
  "wandering",
  "quaking",
  "sour",
];

const ILL_NOUN = [
  "ague",
  "cough",
  "fever",
  "flux",
  "pox",
  "sweat",
  "chill",
  "palsy",
  "wasting",
  "gripe",
  "blight",
  "shivers",
  "throat",
  "canker",
];

/**
 * Invent a sickness name: "marsh ague", "the grey cough", sometimes salted
 * with a word from the sufferer's own tongue ("the Vessa sweat").
 */
export function illnessName(rng: Rng, ctx: Ctx | null, p: Person | null): string {
  const roll = rng.next();
  if (roll < 0.16 && ctx && p) {
    const culture = ctx.world.cultures.get(p.culture);
    const lang = culture ? ctx.world.languages.get(culture.language) : undefined;
    if (lang) {
      const concept = rng.pick(["sickness", "fever", "cold", "marsh", "death"]);
      const w = ctx.services.language.word(rng.fork("word"), lang, concept);
      if (w && w.length >= 2) {
        const cap = w[0].toUpperCase() + w.slice(1);
        return `the ${cap} ${rng.pick(ILL_NOUN)}`;
      }
    }
  }
  const adj = rng.pick(ILL_ADJ);
  const noun = rng.pick(ILL_NOUN);
  if (roll < 0.55) return `the ${adj} ${noun}`;
  return `${adj} ${noun}`;
}

// ---------------------------------------------------------------------------
// Onset, plague, progression
// ---------------------------------------------------------------------------

function onsetBase(age: number): number {
  if (age < 3) return 0.013;
  if (age < 12) return 0.006;
  if (age < 50) return 0.0035;
  if (age < 65) return 0.007;
  return 0.013;
}

/** Monthly chance of falling ill (before plague, which rolls separately). */
export function illnessOnsetChance(
  age: number,
  constitution: number,
  season: number,
  conds: LocalConditions,
  ironConstitution: boolean,
): number {
  let p = onsetBase(age);
  if (season === 3) p *= 1.6; // winter
  else if (season === 2) p *= 1.15; // autumn
  p *= 1 + 2 * conds.famine;
  p *= 1 - 0.45 * clamp(constitution, -1, 1);
  if (ironConstitution) p *= 0.35;
  return clamp01(p);
}

function hasAcuteIllness(p: Person): boolean {
  return p.illnesses.some((i) => !i.chronic);
}

function illEventFlag(name: string): string {
  return F.illEventPrefix + name;
}

/** Monthly health step: plague, new illness, and the course of the sick. */
export function healthTick(
  ctx: Ctx,
  p: Person,
  rng: Rng,
  settlement: Settlement | null,
  conds: LocalConditions,
): void {
  const world = ctx.world;
  const age = ageOf(world, p);
  const season = seasonOf(world.now);
  const constitution = p.phenotype.constitution;
  const iron = hasRareTrait(p, "iron-constitution");

  // --- Plague infection (separate, harsher roll) ---
  if (conds.plagueName) {
    const name = conds.plagueName;
    const immune = p.flags[F.immunePrefix + name] === true;
    const already = p.illnesses.some((i) => i.name === name);
    if (!immune && !already) {
      let pInfect = 0.03 + 0.1 * conds.plagueSeverity;
      pInfect *= 1 - 0.35 * clamp(constitution, -1, 1);
      if (iron) pInfect *= 0.4;
      if (rng.fork("plague").chance(pInfect)) {
        const sevRng = rng.fork("plague-sev");
        const severity = clamp(0.55 + 0.35 * conds.plagueSeverity + sevRng.next() * 0.1, 0.4, 0.98);
        p.illnesses.push({ name, onset: world.now, severity, chronic: false });
        const ev = ctx.record({
          type: "illness",
          date: world.now,
          participants: { subject: p.id },
          data: { name, severity: Math.round(severity * 100) / 100, plague: true },
          ...whereabouts(world, p),
          importance: 9 + Math.round(conds.plagueSeverity * 4),
          causes: [],
          storyline: null,
          secret: false,
        });
        p.flags[illEventFlag(name)] = ev.id;
      }
    }
  }

  // --- Ordinary illness onset (one acute sickness at a time) ---
  if (!hasAcuteIllness(p)) {
    const pOnset = illnessOnsetChance(age, constitution, season, conds, iron);
    if (rng.fork("onset").chance(pOnset)) {
      const nameRng = rng.fork("ill-name");
      const name = illnessName(nameRng, ctx, p);
      const sevRng = rng.fork("severity");
      let severity = 0.15 + Math.pow(sevRng.next(), 1.7) * 0.65;
      if (age < 3 || age >= 65) severity = Math.min(0.9, severity * 1.2);
      severity = Math.round(severity * 100) / 100;
      p.illnesses.push({ name, onset: world.now, severity, chronic: false });
      // Only sickbeds worth remembering enter the chronicle.
      if (severity >= 0.5) {
        const ev = ctx.record({
          type: "illness",
          date: world.now,
          participants: { subject: p.id },
          data: { name, severity },
          ...whereabouts(world, p),
          importance: clamp(Math.round(4 + severity * 9), 4, 13),
          causes: [],
          storyline: null,
          secret: false,
        });
        p.flags[illEventFlag(name)] = ev.id;
      }
    }
  }

  // --- Course of existing illnesses ---
  const keep: Illness[] = [];
  for (const ill of p.illnesses) {
    if (ill.chronic) {
      keep.push(ill); // chronic ills linger; their weight lives in the hazard
      continue;
    }
    const months = monthsBetween(ill.onset, world.now);
    const courseRng = rng.fork("course", ill.name);
    let pRecover = 0.3 * (1 + 0.35 * clamp(constitution, -1, 1)) * (1 - 0.55 * ill.severity);
    if (iron) pRecover *= 1.6;
    pRecover = Math.max(0.05, pRecover);
    if (months >= 1 && courseRng.chance(pRecover)) {
      // Recovered.
      const flagKey = illEventFlag(ill.name);
      const onsetEv = p.flags[flagKey];
      if (typeof onsetEv === "number" && ill.severity >= 0.6) {
        ctx.record({
          type: "recovery",
          date: world.now,
          participants: { subject: p.id },
          data: { name: ill.name },
          ...whereabouts(world, p),
          importance: 4,
          causes: [onsetEv as EventId],
          storyline: null,
          secret: false,
        });
      }
      delete p.flags[flagKey];
      if (conds.plagueName === ill.name) p.flags[F.immunePrefix + ill.name] = true;
      continue; // dropped from the list
    }
    if (courseRng.chance(0.1)) {
      ill.severity = Math.min(1, ill.severity + 0.1 + courseRng.next() * 0.12);
    } else if (months >= 5 && courseRng.chance(0.1)) {
      // It never quite leaves: a chronic complaint.
      ill.chronic = true;
      ill.severity = Math.round(ill.severity * 0.55 * 100) / 100;
      delete p.flags[illEventFlag(ill.name)];
    }
    keep.push(ill);
  }
  p.illnesses = keep;
  if (p.illnesses.length > 4) {
    // A body can only carry so many complaints; keep the worst.
    p.illnesses.sort((a, b) => b.severity - a.severity || a.name.localeCompare(b.name));
    p.illnesses = p.illnesses.slice(0, 4);
  }
}

// ---------------------------------------------------------------------------
// Occupational injury
// ---------------------------------------------------------------------------

interface HazardProfile {
  /** Monthly mishap chance. */
  p: number;
  /** Of mishaps, fraction that kill outright. */
  fatal: number;
  wounds: string[];
  fatalCauses: string[];
}

const WORK_HAZARDS: Partial<Record<ProfessionKey, HazardProfile>> = {
  miner: {
    p: 0.0028,
    fatal: 0.2,
    wounds: [
      "a crushed left hand",
      "a crushed right hand",
      "a back bent crooked by a rockfall",
      "stone-dust settled in the lungs",
      "two fingers lost to a pit winch",
    ],
    fatalCauses: ["a rockfall in the deep gallery", "foul air in the shaft"],
  },
  soldier: {
    p: 0.0022,
    fatal: 0.15,
    wounds: [
      "a spear-scar across the ribs",
      "a shield-arm that never healed straight",
      "a cheek laid open in a border skirmish",
      "a limp from a pike-butt to the knee",
    ],
    fatalCauses: ["a wound gone sour after a skirmish", "a fall in the practice yard, badly landed"],
  },
  guard: {
    p: 0.0009,
    fatal: 0.12,
    wounds: ["a knife-scar from a night watch gone wrong", "a broken nose set crooked"],
    fatalCauses: ["a knife in the dark on the night watch"],
  },
  sailor: {
    p: 0.0026,
    fatal: 0.3,
    wounds: [
      "a hand ruined by wet rope",
      "a leg broken by a swinging boom, badly set",
      "salt-blind in one eye",
    ],
    fatalCauses: ["the sea, in a squall", "a fall from the rigging"],
  },
  fisher: {
    p: 0.0013,
    fatal: 0.25,
    wounds: ["a hook-torn palm that stiffened", "three toes lost to frost on the winter water"],
    fatalCauses: ["the sea, cold and sudden"],
  },
  hunter: {
    p: 0.0015,
    fatal: 0.18,
    wounds: ["a boar-tusk scar along the thigh", "an arrow-nicked ear", "a wolf-bitten forearm"],
    fatalCauses: ["a boar brought to bay", "a long fall in the high woods"],
  },
  smith: {
    p: 0.0012,
    fatal: 0.06,
    wounds: ["burn-scarred forearms", "a hammer-crushed thumb", "one ear gone deaf at the anvil"],
    fatalCauses: ["a scalding at the quench-trough"],
  },
  mason: {
    p: 0.0014,
    fatal: 0.18,
    wounds: ["a foot crushed under dressed stone", "mortar-cracked, aching hands"],
    fatalCauses: ["a fall from the scaffold"],
  },
  carpenter: {
    p: 0.0008,
    fatal: 0.08,
    wounds: ["an adze-cut across the knuckles", "a thumb lost to the saw"],
    fatalCauses: ["a felled beam"],
  },
};

/** Monthly work-injury step. May kill; check p.died afterwards. */
export function injuryTick(ctx: Ctx, p: Person, rng: Rng): void {
  const world = ctx.world;
  const prof = p.status.profession;
  const hazard = WORK_HAZARDS[prof];
  if (!hazard) return;
  let pMishap = hazard.p;
  if (hasRareTrait(p, "glass-bones")) pMishap *= 2;
  const roll = rng.fork("mishap");
  if (!roll.chance(pMishap)) return;

  if (roll.chance(hazard.fatal)) {
    kill(ctx, p, roll.pick(hazard.fatalCauses));
    return;
  }
  // A permanent mark. Avoid the exact same wound twice.
  let wound = roll.pick(hazard.wounds);
  if (p.injuries.includes(wound)) {
    wound = roll.pick(hazard.wounds);
    if (p.injuries.includes(wound)) return;
  }
  p.injuries.push(wound);
  ctx.record({
    type: "injury",
    date: world.now,
    participants: { subject: p.id },
    data: { wound, profession: prof },
    ...whereabouts(world, p),
    importance: 8 + roll.int(7), // 8..14
    causes: [],
    storyline: null,
    secret: false,
  });
}
