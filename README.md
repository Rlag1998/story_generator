# Aeonspire

**An observer-only procedural story generator.** Seed a world; watch centuries
of interlocking lives unfold — dynasties, faiths, feuds, prodigies, plagues,
exiles, masterworks — deterministically, with every event traceable to its
causes. Inspired by Dwarf Fortress's Legends mode, RimWorld, and Crusader
Kings, but built purely to be *watched*: a fishtank of fates.

## What makes a world

- **Languages** are generated phoneme-up; every name — person, place, god,
  month — is spoken in a tongue that did not exist before your seed.
- **Cultures** carry values, naming orders, marriage and inheritance customs,
  rites, taboos, and traditions that event systems actually consult.
- **Religions** have generated pantheons, virtues, sins, holy days, funerary
  rites, clergy — and history: heresies, schisms, persecutions, miracles.
- **Inheritance** is an abstract game-genetics system: heritable appearance,
  temperament, aptitudes, rare traits, twin lineages, family resemblance you
  can *see* in procedurally drawn portraits.
- **Lives** are driven by multi-year storyline arcs — feuds, forbidden love,
  revenge, ambition, downfall, redemption — not isolated dice rolls, so every
  person's chronicle reads like a story with rising action and consequences.
- **Determinism**: the same seed always produces the same centuries, event for
  event. Events carry cause→consequence links you can walk in the UI.

## Running

```bash
npm install
npm run dev          # observer UI at http://localhost:5173
npm test             # engine test suite
npm run chronicle -- --seed myworld --years 120   # headless: print a life
```

## Architecture

See `docs/ARCHITECTURE.md` and `docs/CONTRACTS.md`. The engine
(`src/engine/`) is pure, dependency-free TypeScript; the UI (`src/ui/`) is a
React observer over a world object. Modules (language, culture, religion,
genetics, portraits, people, social, politics, story, economy, narrative)
communicate only through typed service contracts.
