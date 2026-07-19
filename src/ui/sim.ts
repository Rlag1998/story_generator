/**
 * SimController — owns the engine on the main thread, advances time in
 * requestAnimationFrame chunks so the UI stays responsive, and notifies
 * subscribers (via version counter) after every batch of ticks.
 * The UI never mutates the world; this is the only driver.
 */

import { createEngine, type Engine } from "../engine/engine";
import type { WorldParams } from "../engine/core/types";

export type SpeedKey = "paused" | "slow" | "normal" | "fast" | "blur";

/** Months advanced per second of real time. */
const SPEEDS: Record<SpeedKey, number> = {
  paused: 0,
  slow: 2,
  normal: 8,
  fast: 30,
  blur: 120,
};

export class SimController {
  engine: Engine;
  seed: string;
  version = 0;
  speed: SpeedKey = "paused";
  /** Non-null while a fast-forward job is running: {done, total}. */
  ff: { done: number; total: number } | null = null;

  private listeners = new Set<() => void>();
  private rafId: number | null = null;
  private acc = 0;
  private lastT = 0;

  constructor(seed: string, overrides?: Partial<WorldParams>) {
    this.seed = seed;
    this.engine = createEngine(seed, overrides);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private bump(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  setSpeed(s: SpeedKey): void {
    this.speed = s;
    this.lastT = 0;
    this.acc = 0;
    if (s !== "paused" && this.rafId == null) this.loop();
    this.bump();
  }

  /** Fast-forward n years, chunked to keep the frame alive. */
  fastForward(years: number): void {
    if (this.ff) return;
    const total = years * 12;
    this.ff = { done: 0, total };
    this.bump();
    const step = () => {
      if (!this.ff) return;
      const chunk = Math.min(6, this.ff.total - this.ff.done);
      for (let i = 0; i < chunk; i++) this.engine.tick();
      this.ff.done += chunk;
      if (this.ff.done >= this.ff.total) {
        this.ff = null;
        this.bump();
        return;
      }
      this.bump();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame((t) => {
      const mps = SPEEDS[this.speed];
      if (mps === 0 || this.ff) {
        this.rafId = null;
        return;
      }
      if (this.lastT === 0) this.lastT = t;
      const dt = Math.min(0.25, (t - this.lastT) / 1000);
      this.lastT = t;
      this.acc += dt * mps;
      let n = Math.floor(this.acc);
      this.acc -= n;
      // Bound per-frame work.
      n = Math.min(n, 24);
      if (n > 0) {
        for (let i = 0; i < n; i++) this.engine.tick();
        this.bump();
      }
      this.loop();
    });
  };
}
