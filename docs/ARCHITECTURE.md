# Architecture

## Layers

```
src/engine/core/     rng, time, types (ALL shared contracts), world+chronicle
src/engine/gen/      worldgen generators: language, culture, religion
src/engine/          simulation modules: genetics, portrait, people, social,
                     politics, story, economy, narrative
src/engine/engine.ts orchestrator: worldgen pipeline + monthly tick loop
src/cli/             headless runners (chronicle printer)
src/ui/              React observer app (reads the world object directly)
```

## Principles

1. **Deterministic fishtank.** One seed → one history, byte-identical across
   runs. All randomness is labeled-substream forking from a root `Rng`
   (`core/rng.ts`); systems can add draws without perturbing each other.
2. **Observer-only.** There is no player input into the simulation — only
   time controls and navigation. The UI never mutates the world.
3. **Stories over dice.** Isolated random events feel like noise. The story
   module runs multi-year arcs (state machines with beats and escalation)
   whose beats are recorded as chronicle events with `causes` links, so a
   life reads as connected narrative and the UI can answer "why?".
4. **Everything is connected.** Culture informs naming, marriage, events;
   religion schedules festivals and fuels schisms; genetics feeds portraits,
   temperament, twins, health; politics consumes kinship (succession) and
   produces war-drama that feeds back into personal grief, feuds, epithets.
5. **Bounded scale, unbounded depth.** Simulated population is soft-capped
   (~2–3k living); the world stays century-scale runnable in a browser while
   individual histories stay deep.

## Tick order (monthly)

economy → religion → politics → story → social → marriage → people
(aging/health/pregnancy/death). Deaths cascade: succession, inheritance,
widowing, grief memories, storyline reactions.

## Determinism rules

- All Map iteration in id order (`sortedIds`, `livingIds`).
- Rng streams forked with stable labels (never loop-index-dependent when the
  loop's contents can change length across code versions — prefer entity ids).
- No wall-clock, no `Math.random`, no async in the engine.

## The chronicle

`world.events` is the single source of history. Events carry participants
(role→person), location, importance, `causes`/`consequences` edges, optional
`storyline`, and `secret` flags (observer sees all; the world may not).
Narrative rendering is a pure function of (world, event) — prose is never
stored, so memory stays bounded.
