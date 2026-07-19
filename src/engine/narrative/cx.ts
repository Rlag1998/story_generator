/**
 * The render context: one small object handed to every event renderer.
 *
 * Rendering is a PURE function of (world, event). All variation is driven by
 * fnv1a hashes of the event id, never by an Rng, so the same event always
 * reads the same way.
 */

import { fnv1a } from "../core/rng";
import { SEASON_NAMES, monthOf, seasonOf, yearOf, yearsBetween } from "../core/time";
import type {
  Culture,
  CultureId,
  EventRecord,
  Language,
  Person,
  PersonId,
  Polity,
  Region,
  Religion,
  Settlement,
  Tradition,
  World,
} from "../core/types";
import { shortName, titledName } from "./names";
import { type Pronouns, inNthYear, pronouns } from "./text";

/** Roles checked, in order, when a renderer asks for "the main person". */
const PRIMARY_ROLES = [
  "subject", "a", "bride", "victim", "condemned", "accused", "deceased",
  "ruler", "founder", "convert", "preacher", "keeper", "plotter", "killer",
  "curser", "creator", "rescuer", "hero", "giver", "lover", "instigator",
  "challenger", "usurper", "heir", "ward", "witness", "officiant", "survivor",
  "of", "first", "claimant1",
];

/** A per-type renderer returns its variant sentences; one is hash-picked. */
export type EvRenderer = (c: Cx) => string[];

export class Cx {
  readonly world: World;
  readonly ev: EventRecord;

  constructor(world: World, ev: EventRecord) {
    this.world = world;
    this.ev = ev;
  }

  // -- deterministic variation ----------------------------------------------

  /** Hash for this event (optionally salted per prose slot). */
  h(salt = ""): number {
    return fnv1a(salt.length === 0 ? String(this.ev.id) : `${this.ev.id}:${salt}`);
  }

  /** Pick one option, stable per event id + salt. */
  pickFrom<T>(arr: readonly T[], salt = "x"): T {
    return arr[this.h(salt) % arr.length];
  }

  // -- people ---------------------------------------------------------------

  /** First person found under any of the given roles. Falls back to a
   * numeric person id stored under the same key in `data` — used for people
   * referenced by an event without being credited in their own chronicle
   * (e.g. the granter of a routine title). */
  person(...roles: string[]): Person | null {
    for (const r of roles) {
      const id = this.ev.participants[r];
      if (id !== undefined) {
        const p = this.world.people.get(id);
        if (p) return p;
      }
      const did = this.ev.data[r];
      if (typeof did === "number") {
        const p = this.world.people.get(did);
        if (p) return p;
      }
    }
    return null;
  }

  /** Best guess at the event's central figure. */
  primary(): Person | null {
    const p = this.person(...PRIMARY_ROLES);
    if (p) return p;
    for (const key of Object.keys(this.ev.participants).sort()) {
      const q = this.world.people.get(this.ev.participants[key]);
      if (q) return q;
    }
    return null;
  }

  /** Everyone else besides the primary, sorted by id. */
  others(primary: Person | null): Person[] {
    const seen = new Set<PersonId>();
    const out: Person[] = [];
    for (const key of Object.keys(this.ev.participants).sort()) {
      const id = this.ev.participants[key];
      if (primary && id === primary.id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const p = this.world.people.get(id);
      if (p) out.push(p);
    }
    out.sort((a, b) => a.id - b.id);
    return out;
  }

  /** Short display name for a role, with an evocative fallback. */
  name(role: string, fallback = "one whose name the record lost"): string {
    const p = this.person(role);
    return p ? shortName(this.world, p) : fallback;
  }

  /** Titled name for a role ("King Kaerel the Unbowed"). */
  titled(role: string, fallback = "one whose name the record lost"): string {
    const p = this.person(role);
    return p ? titledName(this.world, p) : fallback;
  }

  nameOf(p: Person | null, fallback = "one whose name the record lost"): string {
    return p ? shortName(this.world, p) : fallback;
  }

  pr(p: Person | null): Pronouns {
    return pronouns(p ? p.sex : "m");
  }

  /** Whole years old at the event's date. */
  age(p: Person): number {
    return Math.max(0, yearsBetween(p.born, this.ev.date));
  }

  /** "in her nineteenth year". */
  agePhrase(p: Person): string {
    return inNthYear(this.pr(p).poss, this.age(p));
  }

  // -- data accessors (defensive: other modules own these payloads) ---------

  str(key: string): string | null {
    const v = this.ev.data[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  }

  strOr(key: string, fallback: string): string {
    return this.str(key) ?? fallback;
  }

  num(key: string): number | null {
    const v = this.ev.data[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }

  bool(key: string): boolean {
    return this.ev.data[key] === true;
  }

  idList(key: string): PersonId[] {
    const v = this.ev.data[key];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is PersonId => typeof x === "number");
  }

  strList(key: string): string[] {
    const v = this.ev.data[key];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === "string");
  }

  /** Names for a list of person ids in data (e.g. the fallen of a battle). */
  namesFromIds(key: string, limit = 4): string[] {
    return this.idList(key)
      .slice(0, limit)
      .map((id) => {
        const p = this.world.people.get(id);
        return p ? shortName(this.world, p) : "";
      })
      .filter((s) => s.length > 0);
  }

  // -- places ---------------------------------------------------------------

  settlement(): Settlement | null {
    return this.ev.location !== null ? (this.world.settlements.get(this.ev.location) ?? null) : null;
  }

  region(): Region | null {
    if (this.ev.region !== null) {
      const r = this.world.regions.get(this.ev.region);
      if (r) return r;
    }
    const s = this.settlement();
    return s ? (this.world.regions.get(s.region) ?? null) : null;
  }

  /** Bare place name, preferring the settlement. Empty when placeless. */
  placeName(): string {
    return this.settlement()?.name ?? this.region()?.name ?? "";
  }

  /** " at Velle" / " in the Harrowmarch" / "" (leading space included). */
  place(): string {
    const s = this.settlement();
    if (s) return ` at ${s.name}`;
    const r = this.region();
    if (r) return ` in ${r.name}`;
    return "";
  }

  /** Place name with a fallback for prose slots that need something. */
  placeOr(fallback: string): string {
    const n = this.placeName();
    return n.length > 0 ? n : fallback;
  }

  // -- time -----------------------------------------------------------------

  year(): number {
    return yearOf(this.ev.date);
  }

  season(): string {
    return SEASON_NAMES[seasonOf(this.ev.date)];
  }

  /** The month's name in a culture's tongue, if that culture is known. */
  monthName(cultureId: CultureId | null | undefined): string | null {
    if (cultureId === null || cultureId === undefined) return null;
    const culture = this.world.cultures.get(cultureId);
    if (!culture) return null;
    const lang = this.world.languages.get(culture.language);
    if (!lang) return null;
    const m = lang.monthNames[monthOf(this.ev.date) - 1];
    return typeof m === "string" && m.length > 0 ? m : null;
  }

  /**
   * "in the month of Veshtir" when the subject's culture (and so its
   * calendar) is known; otherwise a seasonal phrase.
   */
  when(p?: Person | null): string {
    const m = this.monthName(p ? p.culture : this.primary()?.culture);
    if (m) return `in the month of ${m}`;
    const season = this.season();
    const flavor = this.pickFrom(
      season === "winter"
        ? ["in the dead of winter", "in deep winter", "one winter"]
        : season === "spring"
          ? ["in the first thaw of spring", "one spring", "as spring opened"]
          : season === "summer"
            ? ["at the height of summer", "one summer", "in high summer"]
            : ["as the leaves turned", "one autumn", "in the fading of the year"],
      "when",
    );
    return flavor;
  }

  // -- world lookups --------------------------------------------------------

  cultureOf(p: Person | null): Culture | null {
    return p ? (this.world.cultures.get(p.culture) ?? null) : null;
  }

  religionOf(p: Person | null): Religion | null {
    return p ? (this.world.religions.get(p.religion) ?? null) : null;
  }

  langOf(culture: Culture | null): Language | null {
    return culture ? (this.world.languages.get(culture.language) ?? null) : null;
  }

  /** Polity from a data field holding its id. */
  polityFromData(key: string): Polity | null {
    const id = this.num(key);
    return id !== null ? (this.world.polities.get(id) ?? null) : null;
  }

  polityName(key: string, fallback = "the realm"): string {
    return this.polityFromData(key)?.name ?? fallback;
  }

  houseName(key: string, fallback = "an old house"): string {
    const id = this.num(key);
    if (id === null) return this.str(key.replace(/^house$/, "houseName")) ?? fallback;
    return this.world.houses.get(id)?.name ?? fallback;
  }

  regionNameFromData(key: string, fallback = "the countryside"): string {
    const id = this.num(key);
    if (id === null) return fallback;
    return this.world.regions.get(id)?.name ?? fallback;
  }

  settlementNameFromData(key: string, fallback = "another town"): string {
    const id = this.num(key);
    if (id === null) return fallback;
    return this.world.settlements.get(id)?.name ?? fallback;
  }

  /** A culture tradition matching a hook tag, chosen stably per event. */
  tradition(culture: Culture | null, hook: string): Tradition | null {
    if (!culture) return null;
    const matches = culture.traditions.filter((t) => t.hooks.includes(hook));
    if (matches.length === 0) return null;
    return matches[this.h(`trad:${hook}`) % matches.length];
  }
}
