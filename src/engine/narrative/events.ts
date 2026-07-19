/**
 * renderEvent: the chronicle's voice. A pure function of (world, event);
 * variant choice comes from fnv1a(String(ev.id)), never from an Rng.
 */

import { fnv1a } from "../core/rng";
import type { EventRecord, EventType, World } from "../core/types";
import { Cx, type EvRenderer } from "./cx";
import { DEEDS_RENDERERS } from "./ev-deeds";
import { EXTRA_RENDERERS } from "./ev-extra";
import { FAITH_RENDERERS } from "./ev-faith";
import { LIFECYCLE_RENDERERS } from "./ev-lifecycle";
import { POLITICS_RENDERERS } from "./ev-politics";
import { SOCIAL_RENDERERS } from "./ev-social";
import { WORLD_RENDERERS } from "./ev-world";
import { cap, finishSentence, lcClause } from "./text";

/**
 * Every canonical EventType, kept in compile-time lockstep with core/types.ts
 * (see the assertions below the list).
 */
export const CANONICAL_EVENT_TYPES = [
  // lifecycle
  "birth", "death", "coming-of-age", "betrothal", "wedding", "divorce",
  "pregnancy-loss", "took-profession", "apprenticed", "retired", "moved",
  "emigrated", "illness", "recovery", "injury", "twin-birth",
  // social
  "friendship-formed", "rivalry-formed", "romance-began", "affair-began",
  "affair-discovered", "quarrel", "reconciliation", "duel", "brawl", "insult",
  "gift", "oath-sworn", "oath-broken", "mentorship-began",
  "bastard-acknowledged",
  // deeds & drama
  "heroic-rescue", "crime-theft", "crime-murder", "crime-discovered", "trial",
  "execution", "exile", "return-from-exile", "disappearance", "beast-attack",
  "masterwork-created", "song-composed", "prophecy-spoken",
  "curse-pronounced", "vision", "conversion", "pilgrimage-departed",
  "pilgrimage-returned", "founded-settlement", "nickname-earned",
  // politics
  "coronation", "succession-crisis", "claim-pressed", "plot-formed",
  "plot-exposed", "assassination", "coup", "abdication", "war-declared",
  "battle", "siege", "peace-made", "alliance-formed", "title-granted",
  "title-revoked", "house-founded", "house-cadet-founded", "house-extinct",
  "feud-began", "feud-ended",
  // religion & culture
  "festival", "omen", "heresy-preached", "schism", "temple-built",
  "relic-found", "persecution", "miracle-claimed",
  // world
  "plague-outbreak", "plague-ended", "famine", "bountiful-harvest", "fire",
  "flood", "storm", "earthquake", "comet", "trade-boom", "road-built",
] as const;

type Canonical = (typeof CANONICAL_EVENT_TYPES)[number];
// Compile-time exhaustiveness: adding an EventType without a list entry (or a
// stray entry that is not an EventType) fails the typecheck here.
type MissingFromList = Exclude<EventType, Canonical>;
type NotInUnion = Exclude<Canonical, EventType>;
const _allCovered: MissingFromList extends never ? true : never = true;
const _noStrays: NotInUnion extends never ? true : never = true;
void _allCovered;
void _noStrays;

const RENDERERS: Record<string, EvRenderer> = {
  ...LIFECYCLE_RENDERERS,
  ...SOCIAL_RENDERERS,
  ...DEEDS_RENDERERS,
  ...POLITICS_RENDERERS,
  ...FAITH_RENDERERS,
  ...WORLD_RENDERERS,
  ...EXTRA_RENDERERS,
};

/** True when a bespoke (non-fallback) renderer exists for this type key. */
export function hasRenderer(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(RENDERERS, type);
}

// ---------------------------------------------------------------------------
// Secret framing & gravity
// ---------------------------------------------------------------------------

const SECRET_FRAMES: ((s: string) => string)[] = [
  (s) => `None yet know that ${lcClause(s)}`,
  (s) => `None yet know it: ${s}`,
  (s) => `It is kept dark, for now: ${s}`,
  (s) => `Only the night knows it yet: ${s}`,
];

const GRAVITY_TAILS = [
  "The year wears the mark of it.",
  "Folk will divide time into before and after.",
  "Nothing afterward sat quite where it had.",
];

// ---------------------------------------------------------------------------
// Generic fallback for unknown type strings
// ---------------------------------------------------------------------------

/** Data keys scanned, in order, for a quotable detail string. */
const DETAIL_KEYS = [
  "matter", "manner", "word", "act", "what", "how", "reason", "over", "sign",
  "deed", "description", "sermon", "charge", "title", "name", "goal", "feat",
  "found", "watched", "where", "by", "spark", "bond", "crime", "gift",
  "gesture", "slight", "oath", "text", "words", "cause", "wares",
  "dedication", "theme", "interpretation", "lastSeen",
];

function firstDetail(c: Cx): string | null {
  for (const k of DETAIL_KEYS) {
    const v = c.str(k);
    if (v !== null) return v;
  }
  return null;
}

function aOrAn(s: string): string {
  return /^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`;
}

function genericRender(c: Cx): string[] {
  const label = String(c.ev.type).replace(/-/g, " ").trim() || "happening";
  const p = c.primary();
  const who = p ? `, with ${c.nameOf(p)} named in the telling` : "";
  const detail = firstDetail(c);
  const tail = detail ? ` The entry adds: ${detail}.` : "";
  return [
    `The chronicle sets down ${aOrAn(label)}${c.place()}${who}.${tail}`,
    `Word of ${aOrAn(label)}${c.place()} found its way into the record${who}.${tail}`,
    `Among the year's entries: ${aOrAn(label)}${c.place()}${who}.${tail}`,
  ];
}

// ---------------------------------------------------------------------------
// renderEvent
// ---------------------------------------------------------------------------

export function renderEvent(world: World, ev: EventRecord): string {
  const c = new Cx(world, ev);
  const renderer = RENDERERS[ev.type] ?? genericRender;
  let variants: string[];
  try {
    variants = renderer(c);
  } catch {
    variants = genericRender(c);
  }
  if (variants.length === 0) variants = genericRender(c);
  let text = variants[fnv1a(String(ev.id)) % variants.length];
  if (ev.secret) {
    const frame = SECRET_FRAMES[c.h("secret") % SECRET_FRAMES.length];
    text = frame(text);
  }
  if (ev.importance >= 70 && c.h("gravity") % 3 !== 0) {
    text = `${text} ${GRAVITY_TAILS[c.h("gravity-pick") % GRAVITY_TAILS.length]}`;
  }
  return finishSentence(cap(text));
}
