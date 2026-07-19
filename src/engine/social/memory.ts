/**
 * Personal memories: a bounded list per person (~24). New memories push
 * out the weakest old ones; a yearly decay pass fades everything, with
 * deep grudges fading slowest. Memories carry event ids, which lets the
 * chronicle answer "why does she hate him" with an actual scene.
 */

import type { Memory, PersonId, World } from "../core/types";
import { livingIds } from "../core/world";

export const MAX_MEMORIES = 24;

/** Yearly retention for ordinary memories. */
const FADE = 0.85;
/** Yearly retention for heavy grudges (feeling <= -0.6, weight >= 2). */
const GRUDGE_FADE = 0.95;
/** Below this weight a memory is gone for good. */
const FORGOTTEN = 0.12;

export function addMemory(world: World, person: PersonId, memory: Memory): void {
  if (!world.people.has(person)) return;
  const list = world.memories.get(person) ?? [];
  list.push(memory);
  if (list.length > MAX_MEMORIES) {
    // Drop the weakest; the first minimum is the oldest among equals.
    let weakest = 0;
    for (let i = 1; i < list.length; i++) {
      if (list[i].weight < list[weakest].weight) weakest = i;
    }
    list.splice(weakest, 1);
  }
  world.memories.set(person, list);
}

/** Yearly: memories fade; grudges hold on; the trivial is forgotten. */
export function decayMemories(world: World): void {
  for (const id of livingIds(world)) {
    const list = world.memories.get(id);
    if (!list || list.length === 0) continue;
    const kept: Memory[] = [];
    for (const m of list) {
      const grudge = m.feeling <= -0.6 && m.weight >= 2;
      m.weight *= grudge ? GRUDGE_FADE : FADE;
      if (m.weight >= FORGOTTEN) kept.push(m);
    }
    if (kept.length === list.length) continue;
    if (kept.length === 0) world.memories.delete(id);
    else world.memories.set(id, kept);
  }
}
