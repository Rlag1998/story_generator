# Module Contracts

The engine is a set of isolated modules wired together by `src/engine/engine.ts`.

## Hard rules (all modules)

1. **No cross-module imports.** A module imports ONLY from `src/engine/core/*`.
   Everything else it needs arrives via `Ctx.services` (see `core/types.ts`).
   *Single exception:* `gen/culture` and `gen/religion` MAY import the public
   API of `gen/language` (a strict DAG: language ← culture ← religion), since
   worldgen calls happen before the services registry is available.
2. **Exact factory export.** Each module's `index.ts` exports exactly the
   factory named in the table below, returning its service interface from
   `core/types.ts`. Internal files/helpers are free-form within the module dir.
3. **Determinism.** No `Math.random`, `Date.now`, `new Date()`, or object-key
   iteration whose order matters. All randomness comes from the `Rng` passed in
   (fork substreams with stable labels: `rng.fork("beat", storyline.id)`).
   Iterate Maps via `sortedIds()`/`livingIds()` from `core/world.ts`.
4. **Events.** Record events via `ctx.record({...})`. Always set: `type`,
   `date: ctx.world.now`, `participants`, `location`, `region`, `importance`,
   `causes` (event ids when a causal parent exists — this powers the UI's
   "why did this happen" chains), `storyline` (or null), `secret`, `data: {}`.
5. **Do not modify** `core/*`, `engine.ts`, other modules, or configs. If you
   need a contract change, note it in your final report instead.
6. **Tests.** Add `*.test.ts` in your module dir (vitest, node env) covering
   your core logic + determinism (same rng seed → same output).

## Module ownership

| Directory | Factory | Interface |
|---|---|---|
| `src/engine/gen/language/` | `createLanguageService()` | `LanguageService` |
| `src/engine/gen/culture/` | `createCultureService()` | `CultureService` |
| `src/engine/gen/religion/` | `createReligionService()` | `ReligionService` |
| `src/engine/genetics/` | `createGeneticsService()` | `GeneticsService` |
| `src/engine/portrait/` | `createPortraitService()` | `PortraitService` |
| `src/engine/people/` | `createPeopleService()` | `PeopleService` |
| `src/engine/social/` | `createSocialService()` | `SocialService` |
| `src/engine/politics/` | `createPoliticsService()` | `PoliticsService` |
| `src/engine/story/` | `createStoryService()` | `StoryService` |
| `src/engine/economy/` | `createEconomyService()` | `EconomyService` |
| `src/engine/narrative/` | `createNarrativeService()` | `NarrativeService` |

## Shared conventions

- **Time**: monthly ticks; `SimDate` = absolute month. Ages via
  `services.people.age(world, p)`.
- **Importance scale** (0–100): 2–5 routine (took profession, moved),
  8–15 personal milestones (wedding, birth), 18–30 dramatic (duel, affair
  discovered, heroic rescue), 35–60 major (murder, coronation, battle),
  70–100 world-shaking (regicide, schism, plague, war's end).
- **Secrets**: affairs, murders, conspiracies start `secret: true`. The social
  module may reveal them later (`revealEvent` in `core/world.ts`) — reveals
  should themselves record a public event (e.g. `affair-discovered`) with the
  secret event in `causes`.
- **Person flags**: namespaced keys (`"story.cursed"`, `"pol.claimant"`).
  `"story.masterwork-done"` carries the masterwork EVENT ID (number) so the
  eventual title grant can cite it as a cause.
- **Absence**: `person.location === null` means "beyond the map" (emigrated,
  vanished, eloped, exiled, wandering). Absent people must not be crowned,
  betrothed, matched, or conceive with a present spouse; use presence checks,
  not just `world.alive`.
- **Population cap**: `world.params.popCap`. The people module dampens
  fertility and emits `emigrated` events as `alive` approaches the cap.

## Event `data` payloads (canonical fields)

- `birth`: `{ litter: number, litterIndex: number }` — litter > 1 also emits one `twin-birth` event for the set.
- `death`: `{ cause: string, ageYears: number }`
- `wedding`/`betrothal`: participants `{ bride, groom }` (or `{ a, b }`).
- `duel`: `{ over: string, outcome: "wound" | "death" | "yield" }`, participants `{ challenger, challenged, victor?, slain? }`
- `battle`: `{ name: string, attacker: PolityId, defender: PolityId, outcome: "attacker" | "defender" | "draw", fallen: PersonId[] }`
- `coronation`: `{ polity: PolityId }`, participants `{ ruler }`
- `plague-outbreak`: `{ name: string, region: RegionId }`
- `omen`: `{ sign: string, interpretation: string }`
- `nickname-earned`: `{ epithet: string, reason: string }` — ALSO set `person.epithet`.
- `masterwork-created`: `{ kind: string, title: string }`
- `prophecy-spoken`: `{ text: string, concerning?: PersonId }`

Unlisted event types: choose sensible fields, document with a comment, keep
values JSON-serializable (no Maps inside `data`; person references as ids).

## Determinism litmus test

Running `createEngine("seed-1").runYears(50)` twice must produce identical
`world.events` (the CI test hashes the event log). Any use of unordered
iteration or out-of-stream randomness breaks this.
