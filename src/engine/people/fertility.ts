/**
 * Pregnancy and birth: conception by age curve and heritable fertility,
 * spacing between births, population-cap damping, gestation, loss, twins,
 * childbed danger, and the quiet scandal of illicit conception.
 */

import type { Ctx, Person, PersonId, Settlement } from "../core/types";
import type { Rng } from "../core/rng";
import { sortedIds } from "../core/world";
import {
  F,
  type LocalConditions,
  activeMarriages,
  ageOf,
  clamp,
  clamp01,
  hasRareTrait,
  livingPerson,
  numFlag,
  whereabouts,
} from "./helpers";
import { createChildInternal, linkLitter } from "./child";
import { kill } from "./death";

export const GESTATION_MONTHS = 9;
/** Months after a delivery before conception is possible again. */
export const BIRTH_SPACING_MONTHS = 15;

/** Fecundity by the mother's age: ramps in the late teens, peaks through
 *  the twenties, and fades to nothing by the mid-forties. */
export function conceptionAgeFactor(age: number): number {
  if (age < 16 || age >= 46) return 0;
  if (age < 20) return ((age - 15) / 5) * 0.9;
  if (age <= 28) return 1;
  if (age <= 35) return 1 - (age - 28) * (0.5 / 7);
  if (age <= 40) return 0.5 - (age - 35) * (0.3 / 5);
  return Math.max(0, 0.2 - (age - 40) * (0.2 / 6));
}

/**
 * Fertility damping as the simulated population nears the cap.
 * 1 well below the cap, fading to 0 at the cap; equilibrium settles a
 * little under it, with emigration pressure covering the rest.
 */
export function capDamping(alive: number, popCap: number): number {
  const ratio = alive / Math.max(1, popCap);
  return clamp01(1.8 * (1 - Math.pow(ratio, 2.5)));
}

/** Base monthly chance a fertile married couple conceives, before damping. */
export const BASE_CONCEPTION = 0.085;

export interface ConceptionOpts {
  /** "spouse" is the full rate; lovers are furtive and less frequent. */
  kind: "spouse" | "lover";
}

/** Monthly conception probability for a specific pairing (0 if barred). */
export function computeConceptionChance(
  worldAlive: number,
  popCap: number,
  mother: Person,
  father: Person,
  motherAge: number,
  fatherAge: number,
  lastBirth: number | null,
  now: number,
  opts: ConceptionOpts,
): number {
  if (mother.pregnancy) return 0;
  if (lastBirth !== null && now - lastBirth < BIRTH_SPACING_MONTHS) return 0;
  if (fatherAge < 16 || fatherAge > 72) return 0;
  const ageF = conceptionAgeFactor(motherAge);
  if (ageF <= 0) return 0;
  const damp = capDamping(worldAlive, popCap);
  if (damp <= 0) return 0;
  let p = BASE_CONCEPTION * ageF * damp;
  p *= clamp(mother.phenotype.fertilityMod, 0, 2.5);
  p *= Math.sqrt(clamp(father.phenotype.fertilityMod, 0.1, 2.5));
  if (opts.kind === "lover") p *= 0.4;
  return clamp01(p);
}

/** Living opposite-sex lovers of a person, ascending id (via social module). */
export function loversOf(ctx: Ctx, p: Person): Person[] {
  const rels = ctx.world.relationships.get(p.id);
  if (!rels) return [];
  const out: Person[] = [];
  for (const otherId of sortedIds(rels)) {
    const rel = ctx.services.social.getRelation(ctx.world, p.id, otherId);
    if (!rel || rel.kind !== "lover") continue;
    const other = livingPerson(ctx.world, otherId);
    if (other && other.sex !== p.sex) out.push(other);
  }
  return out;
}

/**
 * Monthly womb step for one woman: carry, lose, deliver, or conceive.
 * May kill the mother (childbed); check p.died afterwards.
 */
export function pregnancyTick(
  ctx: Ctx,
  p: Person,
  rng: Rng,
  settlement: Settlement | null,
  conds: LocalConditions,
): void {
  if (p.sex !== "f") return;
  const world = ctx.world;
  const now = world.now;
  const age = ageOf(world, p);

  if (p.pregnancy) {
    // Loss before term.
    const preg = p.pregnancy;
    let pLoss = 0.011;
    if (age >= 38) pLoss += 0.01;
    pLoss += conds.famine * 0.02;
    if (p.illnesses.some((i) => i.severity >= 0.5)) pLoss += 0.02;
    if (now < preg.due && rng.fork("loss").chance(pLoss)) {
      recordPregnancyLoss(ctx, p, false);
      p.pregnancy = null;
      return;
    }
    if (now >= preg.due) deliver(ctx, p, rng.fork("delivery"), conds);
    return;
  }

  // Conception.
  const lastBirth = numFlag(p, F.lastBirth);
  if (lastBirth !== null && now - lastBirth < BIRTH_SPACING_MONTHS) return;
  if (conceptionAgeFactor(age) <= 0) return;

  const husband = livingPerson(world, activeMarriages(p)[0]?.spouse ?? null);
  // A husband beyond the map (vanished, wandering, exiled) fathers nothing.
  if (husband && husband.sex === "m" && husband.location !== null) {
    const chance = computeConceptionChance(
      world.alive.size,
      world.params.popCap,
      p,
      husband,
      age,
      ageOf(world, husband),
      lastBirth,
      now,
      { kind: "spouse" },
    );
    if (rng.fork("conceive").chance(chance)) {
      conceive(ctx, p, husband, rng.fork("litter"), false);
      return;
    }
  }

  // A lover's child, conceived in secret.
  const lovers = loversOf(ctx, p).filter((l) => l.id !== husband?.id);
  if (lovers.length > 0) {
    const lover = lovers[0];
    const chance = computeConceptionChance(
      world.alive.size,
      world.params.popCap,
      p,
      lover,
      age,
      ageOf(world, lover),
      lastBirth,
      now,
      { kind: "lover" },
    );
    if (rng.fork("conceive-lover").chance(chance)) {
      conceive(ctx, p, lover, rng.fork("litter-lover"), true);
    }
  }
}

function conceive(ctx: Ctx, mother: Person, father: Person, rng: Rng, illicit: boolean): void {
  const litter = clamp(ctx.services.genetics.litterSize(rng, mother.phenotype), 1, 3);
  mother.pregnancy = {
    father: father.id,
    conceived: ctx.world.now,
    due: ctx.world.now + GESTATION_MONTHS,
    litter,
    illicit,
  };
}

function recordPregnancyLoss(ctx: Ctx, mother: Person, stillborn: boolean): number {
  const world = ctx.world;
  const preg = mother.pregnancy!;
  const husbandId = activeMarriages(mother)[0]?.spouse ?? null;
  const scandalous = preg.illicit && husbandId != null && husbandId !== preg.father;
  const participants: Record<string, PersonId> = { mother: mother.id };
  const fatherP = world.people.get(preg.father);
  if (fatherP) participants.father = fatherP.id;
  const ev = ctx.record({
    type: "pregnancy-loss",
    date: world.now,
    participants,
    data: stillborn
      ? { stillborn: true, litter: preg.litter }
      : { monthsAlong: world.now - preg.conceived },
    ...whereabouts(world, mother),
    importance: 10,
    causes: [],
    storyline: null,
    secret: scandalous,
  });
  return ev.id;
}

function deliver(ctx: Ctx, mother: Person, rng: Rng, conds: LocalConditions): void {
  const world = ctx.world;
  const preg = mother.pregnancy!;
  const age = ageOf(world, mother);
  const father = world.people.get(preg.father) ?? null; // may be dead (posthumous)

  // Stillbirth: the whole labor goes wrong.
  let pStill = 0.035 + 0.028 * (preg.litter - 1);
  if (age >= 38) pStill += 0.02;
  pStill += conds.famine * 0.04;
  if (rng.fork("stillbirth").chance(pStill)) {
    const lossEv = recordPregnancyLoss(ctx, mother, true);
    mother.pregnancy = null;
    mother.flags[F.lastBirth] = world.now;
    if (rng.fork("childbed-still").chance(0.02)) {
      kill(ctx, mother, "childbed", { event: lossEv });
    }
    return;
  }

  // Living births.
  const babyIds: PersonId[] = [];
  const birthEventIds: number[] = [];
  let firstBirthEvent: number | null = null;
  for (let i = 0; i < preg.litter; i++) {
    const res = createChildInternal(rng.fork("baby", i), world, ctx.services, mother, father, {
      litterIndex: i,
      litterMates: [...babyIds],
      litter: preg.litter,
      illicit: preg.illicit,
    });
    babyIds.push(res.person.id);
    birthEventIds.push(res.birthEvent.id);
    if (firstBirthEvent === null) firstBirthEvent = res.birthEvent.id;
  }
  linkLitter(world, babyIds);

  // Twins are an omen, for good or ill; one event marks the set.
  if (preg.litter > 1) {
    const first = world.people.get(babyIds[0])!;
    const ackFather = first.legalFather ?? first.father;
    const participants: Record<string, PersonId> = { mother: mother.id };
    if (ackFather != null) participants.father = ackFather;
    const roles = ["first", "second", "third"];
    for (let i = 0; i < babyIds.length; i++) participants[roles[i]] = babyIds[i];
    const scandalous = preg.illicit && first.legalFather != null;
    ctx.record({
      type: "twin-birth",
      date: world.now,
      participants,
      data: { litter: preg.litter },
      ...whereabouts(world, mother),
      importance: 15,
      causes: birthEventIds,
      storyline: null,
      secret: scandalous,
    });
  }

  mother.pregnancy = null;
  mother.flags[F.lastBirth] = world.now;

  // Childbed claims mothers still.
  let pChildbed = 0.012 + 0.012 * (preg.litter - 1);
  if (age >= 38) pChildbed += 0.012;
  pChildbed += conds.famine * 0.012;
  if (hasRareTrait(mother, "glass-bones")) pChildbed += 0.01;
  if (rng.fork("childbed").chance(pChildbed)) {
    kill(ctx, mother, "childbed", firstBirthEvent !== null ? { event: firstBirthEvent } : undefined);
  }
}
