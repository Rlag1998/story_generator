/**
 * The monthly beat dispatcher. Every active storyline is checked: an
 * essential death interrupts the arc (per-arc handler first, then a
 * generic quiet close: even a broken tale gets a closing beat), and
 * storyline.nextBeat gates the stage machine's next move.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, Storyline } from "../core/types";
import { sortedIds } from "../core/world";
import { makeArc } from "./arcdef";
import { ARCS } from "./registry";
import { deathEventOf, endStoryline, regionOf } from "./helpers";

export function advanceBeats(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  // Snapshot ids: beats may spawn linked storylines mid-iteration.
  const ids = sortedIds(world.storylines);
  for (const sid of ids) {
    const s = world.storylines.get(sid);
    if (!s || s.resolved) continue;
    const beatRng = rng.fork("beat", s.id);
    const arc = makeArc(ctx, beatRng, s);
    const def = ARCS[s.kind];
    if (!def) {
      endStoryline(ctx, s, "was lost to the chronicle");
      continue;
    }

    // Essential cast deaths interrupt regardless of the beat timer. Each
    // death is handled exactly once (the arc may then continue with a
    // replacement, or be closed).
    const broken = essentialDeath(world, s, def.essential);
    if (broken) {
      s.data[`griefHandled:${broken.role}:${broken.person.id}`] = true;
      const handled = def.onCastDeath?.(arc, broken.role, broken.person) ?? false;
      if (s.resolved) continue;
      if (!handled) {
        genericDeathClose(ctx, arc, broken.role, broken.person);
        continue;
      }
    }

    if (world.now < s.nextBeat) continue;
    const stageFn = def.stages[s.stage];
    if (!stageFn) {
      endStoryline(ctx, s, "trailed off mid-telling");
      continue;
    }
    stageFn(arc);
    // A stage that neither advanced nor ended (cast missing, world moved
    // on) gets one polite retry window before a quiet close.
    if (!s.resolved && s.nextBeat <= world.now) {
      const stalls = ((s.data["stalls"] as number | undefined) ?? 0) + 1;
      s.data["stalls"] = stalls;
      if (stalls >= 3) {
        quietClose(ctx, arc);
      } else {
        s.nextBeat = world.now + 3;
      }
    } else if (!s.resolved) {
      s.data["stalls"] = 0;
    }
  }
}

function essentialDeath(
  world: Ctx["world"],
  s: Storyline,
  essential: string[],
): { role: string; person: Person } | null {
  for (const role of essential) {
    const id = s.cast[role];
    if (id == null) continue;
    const p = world.people.get(id);
    if (p && p.died !== null && s.data[`griefHandled:${role}:${p.id}`] !== true) {
      return { role, person: p };
    }
  }
  return null;
}

/** The tale goes into the ground with its bearer: a quiet closing beat. */
function genericDeathClose(
  ctx: Ctx,
  arc: ReturnType<typeof makeArc>,
  role: string,
  person: Person,
): void {
  const s = arc.s;
  const dev = deathEventOf(ctx.world, person);
  const prior = s.events.length > 0 ? s.events[s.events.length - 1] : null;
  const causes = [dev, prior].filter((x): x is number => x != null);
  ctx.record({
    type: "tale-ended",
    date: ctx.world.now,
    participants: { of: person.id },
    // of + reason: death closed this thread of the tale.
    data: { of: person.id, role, reason: "the tale went to the grave with its bearer" },
    location: person.location ?? ((s.data["home"] as number | undefined) ?? null),
    region: regionOf(ctx.world, person.location ?? ((s.data["home"] as number | undefined) ?? null)),
    importance: 4,
    causes,
    storyline: s.id,
    secret: false,
  });
  endStoryline(ctx, s, `was cut short by the death of ${person.givenName}`);
}

/** A stalled arc fades from talk; even that gets its closing beat. */
function quietClose(ctx: Ctx, arc: ReturnType<typeof makeArc>): void {
  const s = arc.s;
  const prior = s.events.length > 0 ? s.events[s.events.length - 1] : null;
  ctx.record({
    type: "tale-ended",
    date: ctx.world.now,
    participants: {},
    data: { reason: "the thread frayed and the telling moved on" },
    location: (s.data["home"] as number | undefined) ?? null,
    region: regionOf(ctx.world, (s.data["home"] as number | undefined) ?? null),
    importance: 3,
    causes: prior != null ? [prior] : [],
    storyline: s.id,
    secret: false,
  });
  endStoryline(ctx, s, "frayed and was forgotten");
}
