/**
 * FEUD — two houses trade insults, then blood, until one is broken or both
 * grow weary. Stages: insults -> first-blood -> escalation (bounded loop of
 * killings and reprisals) -> weary -> peace | smolder. A feud that ends hot
 * leaves heat on House.feuds for the social module (and the next
 * generation) to carry.
 */

import type { Rng } from "../core/rng";
import type { Ctx, House, Person, PersonId, Storyline } from "../core/types";
import { sortedIds } from "../core/world";
import type { Arc, ArcDef, SpawnAids } from "./arcdef";
import {
  addCastMember,
  ageOf,
  beginStoryline,
  bestowEpithet,
  castable,
  cultureOf,
  isAdult,
  livingPerson,
} from "./helpers";

const SLIGHTS = [
  "a toast left undrunk at the harvest table",
  "a bride price called an insult before witnesses",
  "a boundary stone moved in the night",
  "a horse returned lame and unapologized for",
  "an old debt named aloud at the temple door",
  "a seat taken above the salt that was not offered",
];

const DUEL_GROUNDS = [
  "the honor of the house",
  "words that could not be unsaid",
  "the old grievance between their houses",
];

/** A living adult of the house fit to stand as champion, wrathful first. */
function champion(ctx: Ctx, world: Ctx["world"], houseId: number, exclude: PersonId[]): Person | null {
  let best: Person | null = null;
  let bestScore = -Infinity;
  for (const id of [...world.alive].sort((a, b) => a - b)) {
    const p = world.people.get(id);
    if (!p || p.house !== houseId || exclude.includes(id)) continue;
    if (!isAdult(world, p) || p.location == null) continue;
    if (ageOf(world, p) > 55) continue;
    const score =
      p.personality.wrath * 2 +
      p.personality.courage +
      (p.phenotype.aptitudes["war"] ?? 0) * 0.5 -
      p.storylines.length * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/** The star's house and a house it hates (or a fresh cross-house grudge). */
function pickHouses(ctx: Ctx, rng: Rng, star: Person): { ha: House; hb: House; fresh: boolean } | null {
  const world = ctx.world;
  if (star.house == null) return null;
  const ha = world.houses.get(star.house);
  if (!ha) return null;
  // Prefer a house already hated.
  const hot: House[] = [];
  for (const oid of sortedIds(ha.feuds)) {
    if ((ha.feuds.get(oid) ?? 0) >= 0.08) {
      const hb = world.houses.get(oid);
      if (hb) hot.push(hb);
    }
  }
  if (hot.length > 0) return { ha, hb: rng.fork("hot").pick(hot), fresh: false };
  // Else: a rival of the star from another house seeds a fresh feud.
  const rels = world.relationships.get(star.id);
  if (rels) {
    for (const oid of sortedIds(rels)) {
      const rel = rels.get(oid)!;
      if (rel.kind !== "rival" && rel.kind !== "nemesis") continue;
      const other = livingPerson(world, oid);
      if (other && other.house != null && other.house !== ha.id) {
        const hb = world.houses.get(other.house);
        if (hb) return { ha, hb, fresh: true };
      }
    }
  }
  return null;
}

function bumpHouseFeud(world: Ctx["world"], ha: House, hb: House, amount: number): void {
  const next = Math.max(0, Math.min(1, Math.max(ha.feuds.get(hb.id) ?? 0, hb.feuds.get(ha.id) ?? 0) + amount));
  ha.feuds.set(hb.id, next);
  hb.feuds.set(ha.id, next);
}

function duelBeat(a: Arc, challenger: Person, challenged: Person, deadly: number): { slain: Person | null } {
  const world = a.world;
  const roll = a.rng.fork("duel", challenger.id, challenged.id);
  const skillA = (challenger.phenotype.aptitudes["war"] ?? 0) + challenger.personality.courage;
  const skillB = (challenged.phenotype.aptitudes["war"] ?? 0) + challenged.personality.courage;
  const aWins = roll.fork("victor").chance(0.5 + (skillA - skillB) * 0.12);
  const victor = aWins ? challenger : challenged;
  const loser = aWins ? challenged : challenger;
  const death = roll.fork("death").chance(deadly);
  const outcome: "wound" | "death" | "yield" = death
    ? "death"
    : roll.fork("yield").chance(0.5)
      ? "yield"
      : "wound";
  const participants: Record<string, PersonId> = {
    challenger: challenger.id,
    challenged: challenged.id,
    victor: victor.id,
  };
  if (outcome === "death") participants.slain = loser.id;
  const ev = a.beat({
    type: "duel",
    participants,
    // Canonical duel payload: over + outcome.
    data: { over: roll.fork("over").pick(DUEL_GROUNDS), outcome },
    importance: outcome === "death" ? 34 : 20,
  });
  if (outcome === "death") {
    a.ctx.services.people.kill(a.ctx, loser, "cut down in a duel of honor", {
      killer: victor.id,
      event: ev.id,
    });
    return { slain: loser };
  }
  if (outcome === "wound" && roll.fork("scar").chance(0.4)) {
    loser.injuries.push("a dueling scar across the cheek");
  }
  void world;
  return { slain: null };
}

export const feudArc: ArcDef = {
  kind: "feud",
  essential: ["a", "b"],

  weight(ctx: Ctx, star: Person): number {
    const world = ctx.world;
    if (star.house == null || !isAdult(world, star)) return 0;
    const culture = cultureOf(world, star);
    const violence = culture?.attitudes.violence ?? 0.4;
    const house = world.houses.get(star.house);
    let hot = 0;
    if (house) {
      for (const oid of sortedIds(house.feuds)) hot = Math.max(hot, house.feuds.get(oid) ?? 0);
    }
    return (0.35 + Math.max(0, star.personality.wrath) * 0.9 + hot * 2.5) * (0.5 + violence);
  },

  spawn(ctx: Ctx, rng: Rng, star: Person, _aids: SpawnAids): Storyline | null {
    const world = ctx.world;
    const houses = pickHouses(ctx, rng.fork("houses"), star);
    if (!houses) return null;
    const { ha, hb, fresh } = houses;
    const rival = champion(ctx, world, hb.id, [star.id]);
    if (!rival || !castable(world, rival, "feud") || !castable(world, star, "feud")) return null;
    const slight = rng.fork("slight").pick(SLIGHTS);
    const s = beginStoryline(ctx, {
      kind: "feud",
      cast: { a: star.id, b: rival.id },
      houses: [ha.id, hb.id],
      data: {
        star: star.id,
        starRank: star.status.rank,
        home: star.location,
        houseA: ha.id,
        houseB: hb.id,
        cycles: 0,
        blood: 0,
        slight,
      },
      stage: "insults",
      firstBeatIn: rng.fork("first").intIn(2, 5),
    });
    if (fresh) bumpHouseFeud(world, ha, hb, 0.1);
    // Opening beat: the slight, spoken where all could hear.
    const ev = ctx.record({
      type: "insult",
      date: world.now,
      participants: { subject: star.id, target: rival.id },
      // slight: what was done; houses: the two houses now at odds.
      data: { slight, houses: [ha.id, hb.id] },
      location: star.location,
      region: star.location != null ? (world.settlements.get(star.location)?.region ?? null) : null,
      importance: 7,
      causes: [],
      storyline: s.id,
      secret: false,
    });
    void ev;
    ctx.services.social.adjustOpinion(world, rival.id, star.id, -18);
    return s;
  },

  stages: {
    /** Words grow teeth: answer in kind, or steel comes out early. */
    insults(a: Arc): void {
      const A = a.living("a");
      const B = a.living("b");
      if (!A || !B) return;
      const roll = a.rng.fork("outcome");
      const pick = roll.weightedPairs([
        ["answer", 3],
        ["steel", 2 + Math.max(0, B.personality.wrath) * 2],
        ["cool", 1.2],
      ] as const);
      if (pick === "cool") {
        // Fizzle: the quarrel goes cold before blood is drawn.
        a.beat({
          type: "reconciliation",
          participants: { a: A.id, b: B.id },
          data: { manner: "cooler heads carried gifts between the two doors" },
          importance: 6,
        });
        a.end("words were traded, and wiser heads buried them");
        return;
      }
      if (pick === "answer") {
        a.beat({
          type: "insult",
          participants: { subject: B.id, target: A.id },
          // slight: the answering offense.
          data: { slight: a.rng.fork("slight").pick(SLIGHTS) },
          importance: 7,
        });
        a.ctx.services.social.adjustOpinion(a.world, A.id, B.id, -14);
        a.go("first-blood", 2, 8);
        return;
      }
      a.go("first-blood", 1, 2);
    },

    /** The first duel between champions. */
    "first-blood"(a: Arc): void {
      const A = a.living("a");
      const B = a.living("b");
      if (!A || !B) return;
      const { slain } = duelBeat(a, A, B, 0.18);
      const ha = a.world.houses.get(a.s.data["houseA"] as number);
      const hb = a.world.houses.get(a.s.data["houseB"] as number);
      if (ha && hb) bumpHouseFeud(a.world, ha, hb, slain ? 0.3 : 0.15);
      if (slain) {
        a.s.data["blood"] = (a.s.data["blood"] as number) + 1;
        a.go("reprisal", 3, 10);
      } else {
        a.go("escalation", 4, 12);
      }
    },

    /** After first blood: a killing in the dark, or the elders step in. */
    escalation(a: Arc): void {
      const A = a.living("a");
      const B = a.living("b");
      if (!A || !B) return;
      const violence = cultureOf(a.world, A)?.attitudes.violence ?? 0.4;
      const pick = a.rng.fork("outcome").weightedPairs([
        ["killing", 1.5 + violence * 2],
        ["weary", 1.6],
        ["duel", 1.4],
      ] as const);
      if (pick === "weary") {
        a.go("weary", 1, 3);
        return;
      }
      if (pick === "duel") {
        const { slain } = duelBeat(a, B, A, 0.22);
        if (slain) {
          a.s.data["blood"] = (a.s.data["blood"] as number) + 1;
          a.go("reprisal", 3, 10);
        } else {
          a.go("weary", 6, 14);
        }
        return;
      }
      // A killing: ambush by night, laid at no one's door at first.
      const killer = a.rng.fork("who").chance(0.5) ? A : B;
      const victim = killer.id === A.id ? B : A;
      const deed = a.beat({
        type: "crime-murder",
        participants: { killer: killer.id, victim: victim.id },
        // method: how it was done; feud: the houses it serves.
        data: {
          method: a.rng.fork("method").pick([
            "an arrow from the treeline on the mill road",
            "a knife in the crowd at the autumn fair",
            "hands in the dark and the river to keep the secret",
          ]),
          feud: [a.s.data["houseA"], a.s.data["houseB"]],
        },
        importance: 40,
        secret: true,
      });
      a.ctx.services.people.kill(a.ctx, victim, "found dead on the road, and every tongue named the feud", {
        killer: killer.id,
        event: deed.id,
      });
      a.s.data["blood"] = (a.s.data["blood"] as number) + 1;
      const ha = a.world.houses.get(a.s.data["houseA"] as number);
      const hb = a.world.houses.get(a.s.data["houseB"] as number);
      if (ha && hb) bumpHouseFeud(a.world, ha, hb, 0.35);
      a.go("reprisal", 4, 12);
    },

    /** The bereaved house answers, or bends. New champions step forward. */
    reprisal(a: Arc): void {
      const world = a.world;
      const cycles = a.s.data["cycles"] as number;
      // Refill empty champion slots from the houses (feuds outlive men).
      for (const [role, houseKey] of [
        ["a", "houseA"],
        ["b", "houseB"],
      ] as const) {
        if (!a.living(role)) {
          const next = champion(a.ctx, world, a.s.data[houseKey] as number, []);
          if (next && castable(world, next, "feud")) addCastMember(world, a.s, role, next);
        }
      }
      const A = a.living("a");
      const B = a.living("b");
      if (!A || !B) {
        // One house has no one left to carry it: the feud is spent in blood.
        const survivor = A ?? B;
        a.beat({
          type: "feud-ended",
          participants: survivor ? { survivor: survivor.id } : {},
          // houses: the two houses; manner: how it ended.
          data: {
            houses: [a.s.data["houseA"], a.s.data["houseB"]],
            manner: "one hall stood empty, and there was no one left to hate",
          },
          importance: 16,
        });
        a.echo("song", 3, 9, "the feud that emptied a hall");
        a.end("ended when one house had no more blood to give");
        return;
      }
      if (cycles >= 2) {
        a.go("weary", 2, 6);
        return;
      }
      const pick = a.rng.fork("outcome").weightedPairs([
        ["strike-back", 2 + Math.max(0, B.personality.wrath)],
        ["weary", 1.4 + cycles],
      ] as const);
      if (pick === "weary") {
        a.go("weary", 2, 8);
        return;
      }
      a.s.data["cycles"] = cycles + 1;
      const { slain } = duelBeat(a, B, A, 0.3);
      if (slain) a.s.data["blood"] = (a.s.data["blood"] as number) + 1;
      a.go(slain ? "reprisal" : "weary", 4, 12);
    },

    /** Elders and empty chairs argue for peace. */
    weary(a: Arc): void {
      const world = a.world;
      const A = a.living("a");
      const B = a.living("b");
      const ha = world.houses.get(a.s.data["houseA"] as number);
      const hb = world.houses.get(a.s.data["houseB"] as number);
      const blood = a.s.data["blood"] as number;
      if (!A || !B || !ha || !hb) return;
      const pick = a.rng.fork("outcome").weightedPairs([
        ["peace", 2.5 + Math.max(0, A.personality.compassion + B.personality.compassion)],
        ["smolder", 1.5 + blood * 0.5],
      ] as const);
      if (pick === "peace") {
        const manner =
          blood > 0
            ? "weregild was weighed out in silver and the dead were named together at the shrine"
            : "the heads of both houses drank from one cup before witnesses";
        a.beat({
          type: "reconciliation",
          participants: { a: A.id, b: B.id },
          data: { manner, houses: [ha.id, hb.id] },
          importance: blood > 0 ? 16 : 10,
        });
        bumpHouseFeud(world, ha, hb, -0.6);
        a.ctx.services.social.adjustOpinion(world, A.id, B.id, 25);
        a.ctx.services.social.adjustOpinion(world, B.id, A.id, 25);
        if (blood >= 2) {
          bestowEpithet(a.ctx, a.rng, a.s, A, "grim", `carried the feud with ${hb.name} to its weary end`, a.last());
          a.echo("song", 4, 12, `the feud of ${ha.name} and ${hb.name}`);
        }
        a.end(
          blood > 0
            ? `ended in a weary peace after ${blood} ${blood === 1 ? "death" : "deaths"}`
            : "ended in a wary peace before blood was spilled",
        );
        return;
      }
      // Smolder: no peace, only exhaustion. The heat remains for the young.
      a.beat({
        type: "quarrel",
        participants: { a: A.id, b: B.id },
        // manner: the failed parley.
        data: { manner: "the parley broke over an unforgiven name, and both sides went home armed" },
        importance: 9,
      });
      bumpHouseFeud(world, ha, hb, 0.1);
      a.echo("omen", 2, 6, `old blood between ${ha.name} and ${hb.name}`);
      a.end("no peace was made; the hatred was banked like coals for another generation");
    },
  },

  onCastDeath(a: Arc, role: string, person: Person): boolean {
    // A champion's death outside the arc's own beats feeds the feud rather
    // than ending it: the reprisal stage refills the slot.
    if (a.s.stage === "weary" || a.s.stage === "insults") return false;
    void person;
    void role;
    a.go("reprisal", 2, 6);
    return true;
  },
};
