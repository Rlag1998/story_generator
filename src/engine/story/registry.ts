/**
 * The arc registry: every StorylineKind mapped to its state machine.
 * Order here fixes iteration order everywhere (determinism).
 */

import type { StorylineKind } from "../core/types";
import type { ArcDef } from "./arcdef";
import { feudArc } from "./arc-feud";
import { loveArc } from "./arc-love";
import { rivalryArc } from "./arc-rivalry";
import { ambitionArc } from "./arc-ambition";
import { revengeArc } from "./arc-revenge";
import { mysteryArc } from "./arc-mystery";
import { prodigyArc } from "./arc-prodigy";
import { downfallArc } from "./arc-downfall";
import { usurpationArc } from "./arc-usurpation";
import { heresyArc } from "./arc-heresy";
import { curseArc } from "./arc-curse";
import { masterworkArc } from "./arc-masterwork";
import { successionArc } from "./arc-succession";
import { redemptionArc } from "./arc-redemption";
import { wandererArc } from "./arc-wanderer";

/** Fixed, deterministic order. */
export const ARC_LIST: ArcDef[] = [
  feudArc,
  loveArc,
  rivalryArc,
  ambitionArc,
  revengeArc,
  mysteryArc,
  prodigyArc,
  downfallArc,
  usurpationArc,
  heresyArc,
  curseArc,
  masterworkArc,
  successionArc,
  redemptionArc,
  wandererArc,
];

export const ARCS: Record<StorylineKind, ArcDef> = Object.fromEntries(
  ARC_LIST.map((def) => [def.kind, def]),
) as Record<StorylineKind, ArcDef>;
