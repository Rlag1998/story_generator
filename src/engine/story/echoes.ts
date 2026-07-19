/**
 * Echoes: years after an arc resolves, the world remembers it in a small
 * way. A bard sets the feud to verse; the site of a vanishing stays
 * uncanny; a martyr's grave works a modest miracle. Low importance by
 * design; they exist so old stories keep faint ripples in the chronicle.
 */

import type { Rng } from "../core/rng";
import type { Ctx, Person, PersonId } from "../core/types";
import type { EchoPlan } from "./helpers";
import { regionOf, storyState } from "./helpers";

const SONG_FORMS = [
  "a round the children skip to, its origins politely unexamined",
  "a long-verse lament the old ones still stand up for",
  "a tavern ballad with three endings, sung according to who is present",
];

const MIRACLE_SIGNS = [
  "a fever broken after a night's vigil at the grave",
  "a candle that would not gutter in the open wind there",
  "a barren tree above the spot heavy with fruit out of season",
];

/** A living singer near the echo's home, if any (lowest id: stable). */
function findVoice(ctx: Ctx, location: number | null): Person | null {
  const world = ctx.world;
  let fallback: Person | null = null;
  for (const id of [...world.alive].sort((a, b) => a - b)) {
    const p = world.people.get(id);
    if (!p) continue;
    if (p.status.profession === "bard" || p.status.profession === "artist") {
      if (location != null && p.location === location) return p;
      if (!fallback) fallback = p;
    }
  }
  return fallback;
}

export function emitEchoes(ctx: Ctx, rng: Rng): void {
  const world = ctx.world;
  const state = storyState(world);
  if (state.echoes.length === 0) return;
  const due: EchoPlan[] = [];
  const rest: EchoPlan[] = [];
  for (const e of state.echoes) (e.due <= world.now ? due : rest).push(e);
  if (due.length === 0) return;
  state.echoes = rest;
  due.sort((a, b) => a.due - b.due || a.seq - b.seq);
  for (const echo of due) {
    const s = world.storylines.get(echo.storyline);
    if (!s) continue;
    const eRng = rng.fork("echo", echo.seq);
    const causes = echo.cause != null && world.events.has(echo.cause) ? [echo.cause] : [];
    if (echo.kind === "song") {
      const voice = findVoice(ctx, echo.location);
      const participants: Record<string, PersonId> = voice ? { singer: voice.id } : {};
      ctx.record({
        type: "song-composed",
        date: world.now,
        participants,
        // title/theme: what the song remembers; form: how it survives.
        data: { theme: echo.theme, form: eRng.fork("form").pick(SONG_FORMS), of: s.kind },
        location: voice?.location ?? echo.location,
        region: regionOf(world, voice?.location ?? echo.location),
        importance: 5,
        causes,
        storyline: s.id,
        secret: false,
      });
    } else if (echo.kind === "miracle") {
      ctx.record({
        type: "miracle-claimed",
        date: world.now,
        participants: {},
        // sign: the modest wonder; theme: whose memory it honors.
        data: { sign: eRng.fork("sign").pick(MIRACLE_SIGNS), theme: echo.theme },
        location: echo.location,
        region: regionOf(world, echo.location),
        importance: 8,
        causes,
        storyline: s.id,
        secret: false,
      });
    } else {
      ctx.record({
        type: "omen",
        date: world.now,
        participants: {},
        // Canonical omen payload: sign + interpretation.
        data: {
          sign: "the place is still given a wide berth after dark",
          interpretation: echo.theme,
        },
        location: echo.location,
        region: regionOf(world, echo.location),
        importance: 4,
        causes,
        storyline: s.id,
        secret: false,
      });
    }
  }
}
