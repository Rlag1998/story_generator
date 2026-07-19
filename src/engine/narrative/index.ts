/**
 * The narrative module: the chronicler of Aeonspire.
 *
 * Turns the event stream into prose. Rendering is a pure function of
 * (world, event/person): nothing here consumes an Rng or mutates the world,
 * so prose is never stored and always re-derivable, byte-identical.
 */

import type { EventRecord, NarrativeService, Person, World } from "../core/types";
import { renderEvent } from "./events";
import { renderHeadline } from "./headlines";
import { renderLife } from "./life";
import { shortName } from "./names";

export function createNarrativeService(): NarrativeService {
  return {
    renderEvent(world: World, ev: EventRecord): string {
      return renderEvent(world, ev);
    },
    renderHeadline(world: World, ev: EventRecord): string {
      return renderHeadline(world, ev);
    },
    renderLife(world: World, person: Person): string {
      return renderLife(world, person);
    },
    shortName(world: World, p: Person): string {
      return shortName(world, p);
    },
  };
}

// Helper surface for tests and the UI layer.
export { CANONICAL_EVENT_TYPES, hasRenderer, renderEvent } from "./events";
export { renderHeadline } from "./headlines";
export { renderLife } from "./life";
export { fullName, honorific, shortName, titledName } from "./names";
export { joinList, numberWord, ordinalWord, pronouns, sanitize } from "./text";
