import React, { createContext, useContext, useSyncExternalStore } from "react";
import type { SimController } from "./sim";
import type { World, Services } from "../engine/core/types";
import type { Engine } from "../engine/engine";

const Ctx = createContext<SimController | null>(null);

export function WorldProvider({
  controller,
  children,
}: {
  controller: SimController;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={controller}>{children}</Ctx.Provider>;
}

export interface WorldHandle {
  controller: SimController;
  engine: Engine;
  world: World;
  services: Services;
  version: number;
}

/** Subscribes the component to sim updates. */
export function useWorld(): WorldHandle {
  const controller = useContext(Ctx);
  if (!controller) throw new Error("useWorld outside WorldProvider");
  const version = useSyncExternalStore(controller.subscribe, controller.getVersion);
  return {
    controller,
    engine: controller.engine,
    world: controller.engine.world,
    services: controller.engine.services,
    version,
  };
}

// ---------------------------------------------------------------------------
// Followed people (observer bookmarks), persisted per seed.
// ---------------------------------------------------------------------------

export function followKey(seed: string): string {
  return `aeonspire:follow:${seed}`;
}

export function getFollowed(seed: string): number[] {
  try {
    return JSON.parse(localStorage.getItem(followKey(seed)) ?? "[]");
  } catch {
    return [];
  }
}

export function setFollowed(seed: string, ids: number[]): void {
  localStorage.setItem(followKey(seed), JSON.stringify(ids));
}

export function toggleFollow(seed: string, id: number): number[] {
  const cur = getFollowed(seed);
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  setFollowed(seed, next);
  return next;
}
