/**
 * renderLife: a person's biography, three to eight paragraphs, built from
 * their chronicle. Storyline arcs lead each chapter; standalone events fill
 * in behind them. Pure function of (world, person).
 */

import { fnv1a } from "../core/rng";
import { yearOf, yearsBetween } from "../core/time";
import type {
  Culture,
  EventRecord,
  Person,
  Storyline,
  StorylineKind,
  World,
} from "../core/types";
import { eventsOf } from "../core/world";
import { rareTraitDef } from "../core/appearance";
import {
  appearanceParagraph,
  chapterOpener,
  legacyImage,
  temperamentParagraph,
  upbringingClause,
} from "./describe";
import { renderEvent } from "./events";
import { fullName, livingChildren, shortName, spouseOf } from "./names";
import { tradeThing } from "./ev-lifecycle";
import {
  cap,
  deThe,
  finishSentence,
  inNthYear,
  joinList,
  lcClause,
  numberWord,
  ordinalWord,
  pronouns,
  sanitize,
} from "./text";

export function renderLife(world: World, person: Person): string {
  const paragraphs: string[] = [];
  const chron = eventsOf(world, person.id);

  paragraphs.push(birthParagraph(world, person, chron));
  paragraphs.push(appearanceParagraph(world, person));
  paragraphs.push(natureParagraph(world, person));
  for (const chapter of chapterParagraphs(world, person, chron)) {
    paragraphs.push(chapter);
  }
  paragraphs.push(finalParagraph(world, person, chron));

  return paragraphs
    .map((p) => finishSentence(sanitize(p)))
    .filter((p) => p.length > 0)
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// 1. Birth & blood
// ---------------------------------------------------------------------------

function birthMonthPhrase(world: World, p: Person): string {
  const culture = world.cultures.get(p.culture);
  const lang = culture ? world.languages.get(culture.language) : undefined;
  const m = lang?.monthNames[((p.born % 12) + 12) % 12];
  const year = yearOf(p.born);
  // Founders born before the chronicle's first year get no ugly negative date.
  if (year < 1) {
    return m && m.length > 0
      ? `in the month of ${m}, in the years before this chronicle opens`
      : "in the years before this chronicle opens";
  }
  if (m && m.length > 0) return `in the month of ${m} of the year ${year}`;
  return `in the year ${year}`;
}

function birthParagraph(world: World, p: Person, chron: EventRecord[]): string {
  const pr = pronouns(p.sex);
  const h = fnv1a(`bio-birth:${p.id}`);
  const sentences: string[] = [];

  const birthEv = chron.find((e) => e.type === "birth" && e.participants["subject"] === p.id);
  const where = birthPlace(world, p, birthEv);
  const mother = p.mother !== null ? world.people.get(p.mother) : undefined;
  const father = p.father !== null ? world.people.get(p.father) : undefined;
  const legal = p.legalFather !== null ? world.people.get(p.legalFather) : undefined;

  let parentage: string | null;
  if (mother && father) {
    parentage = `to ${shortName(world, mother)} and ${shortName(world, father)}`;
  } else if (mother) {
    parentage = `to ${shortName(world, mother)}`;
  } else if (father) {
    parentage = `to ${shortName(world, father)}`;
  } else {
    parentage = null;
  }
  // fullName already carries the house ("Kaerel the Unbowed of House Maren").
  if (parentage) {
    const openers = [
      `${fullName(world, p)} was born${where} ${birthMonthPhrase(world, p)}, ${parentage}.`,
      `The chronicle opens on ${fullName(world, p)}, born ${parentage}${where} ${birthMonthPhrase(world, p)}.`,
    ];
    sentences.push(openers[h % openers.length]);
  } else {
    sentences.push(
      `${fullName(world, p)} was born${where} ${birthMonthPhrase(world, p)}. Of ${pr.poss} parents the record says nothing.`,
    );
  }

  // Bastardy and hidden fathers: the observer's chronicle knows the truth.
  if (father && legal && father.id !== legal.id) {
    sentences.push(
      `The register names ${shortName(world, legal)} as father; the blood, the chronicle knows, was ${shortName(world, father)}'s.`,
    );
  } else if (!father && !legal) {
    if (mother) sentences.push(`No father was set down in the register.`);
  }

  // Twins.
  if (p.litterMates.length > 0) {
    const mates = p.litterMates
      .map((id) => world.people.get(id))
      .filter((q): q is Person => q !== undefined)
      .map((q) => shortName(world, q));
    if (mates.length > 0) {
      sentences.push(`${pr.Subj} came into the world in the same hour as ${joinList(mates)}.`);
      const culture = world.cultures.get(p.culture);
      const trad = twinTradition(culture, p.id);
      if (trad) sentences.push(trad.description);
    }
  }

  // Birth-marks the world cannot see: caul, sight, constitution.
  const hidden = p.phenotype.rareTraits
    .map((k) => rareTraitDef(k))
    .filter((d): d is NonNullable<typeof d> => d !== undefined && !d.visible);
  if (hidden.length > 0) {
    const d = hidden[0];
    sentences.push(`There was more to the birth than showed: the child carried the mark folk call ${midSentenceName(d.name)}. ${d.description}`);
  }

  return sentences.join(" ");
}

/** "The Sight" -> "the Sight" for mid-sentence use; other names unchanged. */
function midSentenceName(name: string): string {
  return /^The\s/.test(name) ? `the ${name.slice(4)}` : name;
}

function birthPlace(world: World, p: Person, birthEv: EventRecord | undefined): string {
  const locId = birthEv?.location ?? p.location;
  if (locId !== null && locId !== undefined) {
    const s = world.settlements.get(locId);
    if (s) return ` at ${s.name}`;
  }
  return "";
}

function twinTradition(culture: Culture | undefined, personId: number) {
  if (!culture) return null;
  const matches = culture.traditions.filter((t) => t.hooks.includes("twins"));
  if (matches.length === 0) return null;
  return matches[fnv1a(`bio-twin:${personId}`) % matches.length];
}

// ---------------------------------------------------------------------------
// 3. Nature (upbringing + temperament)
// ---------------------------------------------------------------------------

function natureParagraph(world: World, p: Person): string {
  const age = yearsBetween(p.born, p.died ?? world.now);
  const culture = world.cultures.get(p.culture) ?? null;
  const upbringing = upbringingClause(culture);
  if (p.died === null && age < 10) {
    const pr = pronouns(p.sex);
    const early = upbringing.length > 0 ? `${cap(upbringing)}, ${pr.subj} is still small` : `${pr.Subj} is still small`;
    return `${early}, and it is early to say what ${pr.subj} will be. The household watches, as households do.`;
  }
  if (p.died !== null && age < 10) {
    // Those who died as children get no adult character sketch; what they
    // were is exactly what was taken.
    const pr = pronouns(p.sex);
    const opening = upbringing.length > 0 ? `${cap(upbringing)}. ` : "";
    return `${opening}What ${pr.subj} might have grown into, no chronicle can say. The record keeps only the beginning.`;
  }
  const temper = temperamentParagraph(p);
  if (upbringing.length > 0) {
    return `${cap(upbringing)}. ${temper}`;
  }
  return temper;
}

// ---------------------------------------------------------------------------
// 4+. Life chapters
// ---------------------------------------------------------------------------

/** Types that earn a place in a biography even at low importance. */
const KEEP_TYPES = new Set([
  "coming-of-age", "took-profession", "apprenticed", "wedding", "betrothal",
  "moved", "retired", "nickname-earned", "conversion", "emigrated",
]);

/** Types never retold in chapters (handled elsewhere or pure noise). */
const SKIP_TYPES = new Set(["birth", "twin-birth", "death", "festival", "rumor"]);

interface Band {
  index: number;
  from: number; // age in years, inclusive
  to: number; // exclusive
}

function bandsFor(world: World, p: Person): Band[] {
  const culture = world.cultures.get(p.culture);
  const adult = culture?.adulthoodAge ?? 16;
  return [
    { index: 0, from: 0, to: adult },
    { index: 1, from: adult, to: 35 },
    { index: 2, from: 35, to: 55 },
    { index: 3, from: 55, to: 1000 },
  ];
}

function chapterParagraphs(world: World, p: Person, chron: EventRecord[]): string[] {
  const out: string[] = [];
  const bands = bandsFor(world, p);
  const storylines = p.storylines
    .slice()
    .sort((a, b) => a - b)
    .map((id) => world.storylines.get(id))
    .filter((s): s is Storyline => s !== undefined);

  // Events eligible for chapters.
  const eligible = chron.filter((ev) => {
    if (SKIP_TYPES.has(String(ev.type))) return false;
    if (ev.type === "birth") return false;
    // Skip a betrothal when the wedding to the same partner is also on record.
    if (ev.type === "betrothal") {
      const pair = [ev.participants["bride"], ev.participants["groom"]].sort();
      const wed = chron.some((w) => {
        if (w.type !== "wedding") return false;
        const wp = [w.participants["bride"], w.participants["groom"]].sort();
        return wp[0] === pair[0] && wp[1] === pair[1];
      });
      if (wed) return false;
    }
    return ev.importance >= 8 || KEEP_TYPES.has(String(ev.type));
  });

  for (const band of bands) {
    const inBand = (d: number) => {
      const age = yearsBetween(p.born, d);
      return age >= band.from && age < band.to;
    };
    const bandEvents = eligible.filter((ev) => inBand(ev.date));
    const bandArcs = storylines.filter((s) => inBand(s.started));
    if (bandEvents.length === 0 && bandArcs.length === 0) continue;

    const h = fnv1a(`bio-ch:${p.id}:${band.index}`);
    const bits: string[] = [];

    // Lead with the arcs.
    const arcEventIds = new Set<number>();
    for (const s of bandArcs.slice(0, 2)) {
      bits.push(arcSentence(world, p, s));
      for (const eid of s.events) arcEventIds.add(eid);
      // One key beat from the arc, told compactly.
      const beats = bandEvents
        .filter((ev) => ev.storyline === s.id)
        .sort((a, b) => b.importance - a.importance || a.id - b.id);
      if (beats.length > 0 && beats[0].importance >= 15) {
        bits.push(lifeLine(world, p, beats[0]));
      }
    }
    // Other arcs' events are already spoken for.
    for (const s of storylines) for (const eid of s.events) arcEventIds.add(eid);

    // Children born in this band, compressed to one line.
    const childBirths = chron.filter(
      (ev) =>
        ev.type === "birth" &&
        (ev.participants["mother"] === p.id || ev.participants["father"] === p.id || ev.participants["legalFather"] === p.id) &&
        inBand(ev.date),
    );
    if (childBirths.length > 0) {
      bits.push(childrenLine(world, p, childBirths, h));
    }

    // Then the strongest standalone events, retold in date order.
    const standalone = bandEvents
      .filter((ev) => !arcEventIds.has(ev.id) && ev.type !== "birth")
      .sort((a, b) => b.importance - a.importance || a.id - b.id)
      .slice(0, 3)
      .sort((a, b) => a.date - b.date || a.id - b.id);
    for (const ev of standalone) {
      bits.push(lifeLine(world, p, ev));
    }

    if (bits.length === 0) continue;
    const opener = `${chapterOpener(band.index, h)}:`;
    out.push(`${opener} ${bits.join(" ")}`);
  }
  return out.slice(0, 4);
}

const ARC_PHRASES: Record<StorylineKind, (world: World, p: Person, s: Storyline) => string> = {
  feud: (world, p, s) => {
    const houses = s.houses.map((id) => world.houses.get(id)?.name).filter((n): n is string => !!n);
    return houses.length >= 2
      ? `${pronouns(p.sex).Subj} was drawn into the feud between ${houses[0]} and ${houses[1]}.`
      : `${pronouns(p.sex).Subj} was drawn into a feud that outlived its first cause.`;
  },
  "forbidden-love": (world, p, s) => {
    const other = castOther(world, p, s);
    return other
      ? `${pronouns(p.sex).Subj} loved ${shortName(world, other)}, and the families forbade it.`
      : `${pronouns(p.sex).Subj} loved where the families forbade.`;
  },
  rivalry: (world, p, s) => {
    const other = castOther(world, p, s);
    return other
      ? `A long rivalry with ${shortName(world, other)} ran through these years like a seam of iron.`
      : `A long rivalry ran through these years like a seam of iron.`;
  },
  ambition: (world, p) => `${pronouns(p.sex).Subj} set ${pronouns(p.sex).poss} eyes above ${pronouns(p.sex).poss} station and began to climb.`,
  revenge: (world, p, s) => {
    const other = castOther(world, p, s);
    return other
      ? `${pronouns(p.sex).Subj} kept a grief sharpened toward ${shortName(world, other)}.`
      : `${pronouns(p.sex).Subj} kept a grief sharpened, and waited.`;
  },
  "mystery-disappearance": (world, p, s) => {
    const other = castOther(world, p, s);
    return other
      ? `The vanishing of ${shortName(world, other)} hung over this stretch of ${pronouns(p.sex).poss} life.`
      : `A vanishing hung over this stretch of ${pronouns(p.sex).poss} life.`;
  },
  prodigy: (world, p) => `The gift in ${pronouns(p.sex).obj} showed early, and the town began to expect things.`,
  downfall: (world, p) => `Somewhere in these years the ground began to tilt under ${pronouns(p.sex).obj}, slowly at first.`,
  "usurpation-plot": (world, p) => `${pronouns(p.sex).Subj} was drawn into a design against the crown, the kind whispered behind two shut doors.`,
  heresy: (world, p) => `A vision led ${pronouns(p.sex).obj} away from the temple's road, and others followed.`,
  curse: (world, p) => `A spoken curse shadowed the family through these years, and every misfortune wore its name.`,
  masterwork: (world, p) => `${pronouns(p.sex).Subj} bent these years toward a single great work.`,
  "succession-struggle": (world, p) => `The struggle over an empty high seat pulled ${pronouns(p.sex).obj} in, as such struggles pull.`,
  redemption: (world, p) => `${pronouns(p.sex).Subj} set about unmaking an old shame, one plain deed at a time.`,
  wanderer: (world, p) => `${pronouns(p.sex).Subj} left, and was long in returning, and came back altered.`,
};

function castOther(world: World, p: Person, s: Storyline): Person | null {
  for (const role of Object.keys(s.cast).sort()) {
    const id = s.cast[role];
    if (id !== p.id) {
      const q = world.people.get(id);
      if (q) return q;
    }
  }
  return null;
}

function arcSentence(world: World, p: Person, s: Storyline): string {
  const phrase = ARC_PHRASES[s.kind];
  let out = phrase ? phrase(world, p, s) : `A long tale of ${String(s.kind).replace(/-/g, " ")} ran through these years.`;
  if (s.resolved && s.outcome && s.outcome.length > 0) {
    out += ` The chronicle closes it thus: ${lcClause(s.outcome)}.`;
  } else if (!s.resolved && s.ended === null) {
    out += " That tale is not yet done.";
  }
  return out;
}

function childrenLine(world: World, p: Person, births: EventRecord[], h: number): string {
  const pr = pronouns(p.sex);
  const names = births
    .map((ev) => (ev.participants["subject"] !== undefined ? world.people.get(ev.participants["subject"]) : undefined))
    .filter((q): q is Person => q !== undefined)
    .map((q) => q.givenName);
  if (names.length === 0) return "";
  if (names.length === 1) {
    const child = births[0].participants["subject"] !== undefined ? world.people.get(births[0].participants["subject"]) : undefined;
    const word = child ? pronouns(child.sex).child : "child";
    return `In ${yearOf(births[0].date)} a ${word}, ${names[0]}, was born to ${pr.obj}.`;
  }
  const y1 = yearOf(births[0].date);
  const y2 = yearOf(births[births.length - 1].date);
  if (y1 === y2) {
    return `The year ${y1} brought ${numberWord(names.length)} children at once: ${joinList(names)}.`;
  }
  const styles = [
    `The years ${y1} to ${y2} brought ${numberWord(names.length)} children: ${joinList(names)}.`,
    `${cap(numberWord(names.length))} children came between ${y1} and ${y2}: ${joinList(names)}.`,
  ];
  return styles[h % styles.length];
}

// ---------------------------------------------------------------------------
// Compact person-centric event lines for chapters
// ---------------------------------------------------------------------------

function lifeLine(world: World, p: Person, ev: EventRecord): string {
  const pr = pronouns(p.sex);
  const year = yearOf(ev.date);
  const age = Math.max(0, yearsBetween(p.born, ev.date));
  const other = otherName(world, p, ev);
  const d = (k: string): string | null => {
    const v = ev.data[k];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  switch (ev.type) {
    case "coming-of-age":
      return `At ${numberWord(age)} ${pr.subj} was counted grown.`;
    case "took-profession":
      return `${pr.Subj} took up ${tradeThing(d("profession") ?? "laborer")}.`;
    case "apprenticed":
      return other ? `${pr.Subj} was prenticed to ${other}.` : `${pr.Subj} went to prentice.`;
    case "wedding": {
      const love = ev.data["loveMatch"] === true ? ", a love match" : "";
      return other
        ? `${cap(inNthYear(pr.poss, age))} ${pr.subj} wed ${other}${love}.`
        : `${cap(inNthYear(pr.poss, age))} ${pr.subj} was wed${love}.`;
    }
    case "betrothal":
      return other ? `${pr.Subj} was promised to ${other}.` : `${pr.Subj} was betrothed.`;
    case "divorce":
      return other ? `The marriage to ${other} ended, and not gently.` : `${pr.Poss} marriage ended.`;
    case "pregnancy-loss":
      return `A child was lost before it could be born, and the house was quiet a while.`;
    case "moved":
      return `${pr.Subj} moved to ${settlementName(world, ev, "to") ?? "a new town"}.`;
    case "emigrated":
      return `Then ${pr.subj} left the land altogether, and the record thins.`;
    case "illness":
      return `The ${deThe(d("name") ?? "sickness")} took hold of ${pr.obj} ${inNthYear(pr.poss, age)}.`;
    case "recovery":
      return `${pr.Subj} fought off the ${deThe(d("name") ?? "sickness")} and stood back up.`;
    case "injury":
      return `A hurt from those years stayed with ${pr.obj}: ${d("wound") ?? "a lasting mark"}.`;
    case "duel": {
      const over = d("over") ?? "a point of honor";
      const outcome = d("outcome");
      const end = outcome === "death" ? "and it was settled in blood" : outcome === "yield" ? "and took the yield" : "to first blood";
      return other ? `${pr.Subj} met ${other} with steel over ${over}, ${end}.` : `${pr.Subj} fought a duel over ${over}, ${end}.`;
    }
    case "nickname-earned": {
      const reason = d("reason");
      return `It was in these years ${pr.subj} earned the name ${d("epithet") ?? "folk gave"}${reason ? `: ${reason}.` : "."}`;
    }
    case "title-granted":
      return `${pr.Subj} was raised up: ${d("title") ?? "a new dignity"}.`;
    case "coronation":
      return `${pr.Subj} was crowned${crownedRealm(world, ev)}.`;
    case "heroic-rescue":
      return other ? `${pr.Subj} pulled ${other} out of certain death, and the tale is still told.` : `${pr.Subj} saved a life at real cost, and the tale is still told.`;
    case "exile":
      return `Exile came ${inNthYear(pr.poss, age)}; gate and hearth were barred to ${pr.obj}.`;
    case "return-from-exile":
      return `In the year ${year} the exile ended and ${pr.subj} came home.`;
    case "conversion":
      return `${pr.Subj} changed faiths, which cost some friendships and made others.`;
    case "oath-sworn":
      return other ? `${pr.Subj} swore an oath to ${other}, and meant it.` : `${pr.Subj} swore a binding oath.`;
    case "friendship-formed":
      return other ? `A friendship with ${other} began that would bear weight later.` : `A lasting friendship began.`;
    case "rivalry-formed":
      return other ? `Between ${pr.obj} and ${other}, something hardened into rivalry.` : `A rivalry hardened in these years.`;
    case "romance-began":
      return other ? `${pr.Subj} began walking out with ${other}.` : `A courtship began.`;
    case "battle": {
      const name = d("name");
      return name ? `${pr.Subj} stood in the ${lcBattle(name)} and lived to be asked about it.` : `${pr.Subj} stood in a battle and lived.`;
    }
    case "war-declared": {
      const atk = polityNameOf(world, ev, "attacker");
      const def = polityNameOf(world, ev, "defender");
      return atk && def ? `In the year ${year} came war between ${atk} and ${def}, and it ran through ${pr.poss} days like a cold current.` : `In the year ${year} came war, and it ran through ${pr.poss} days like a cold current.`;
    }
    case "peace-made": {
      const atk = polityNameOf(world, ev, "attacker");
      const def = polityNameOf(world, ev, "defender");
      return atk && def ? `The peace between ${atk} and ${def}, when it came, was signed with ${pr.obj} in the room.` : `Peace, when it came, was signed with ${pr.obj} in the room.`;
    }
    case "affair-began":
      return other ? `There was, the chronicle must record, more between ${pr.obj} and ${other} than vows allowed.` : `There was, the chronicle must record, a love kept behind shutters.`;
    case "affair-discovered":
      return other ? `What ${pr.subj} and ${other} had hidden came into the light, with all that follows.` : `A hidden love came into the light, with all that follows.`;
    case "quarrel":
      return other ? `There were hard words with ${other}, loud enough to be remembered.` : `There were hard words that year, loud enough to be remembered.`;
    case "brawl":
      return other ? `${pr.Subj} and ${other} came to open blows.` : `${pr.Subj} was in a brawl the street still describes.`;
    case "reconciliation":
      return other ? `In time ${pr.subj} and ${other} made their peace.` : `In time the old quarrel was set down.`;
    case "gift":
      return other ? `A well-chosen gift passed between ${pr.obj} and ${other}.` : `A kindness of ${pr.poss} was long remembered.`;
    default:
      return renderEvent(world, ev);
  }
}

function otherName(world: World, p: Person, ev: EventRecord): string | null {
  for (const role of Object.keys(ev.participants).sort()) {
    const id = ev.participants[role];
    if (id !== p.id) {
      const q = world.people.get(id);
      if (q) return shortName(world, q);
    }
  }
  return null;
}

function settlementName(world: World, ev: EventRecord, key: string): string | null {
  const v = ev.data[key];
  if (typeof v !== "number") return null;
  return world.settlements.get(v)?.name ?? null;
}

function polityNameOf(world: World, ev: EventRecord, key: string): string | null {
  const v = ev.data[key];
  if (typeof v !== "number") return null;
  return world.polities.get(v)?.name ?? null;
}

function crownedRealm(world: World, ev: EventRecord): string {
  const v = ev.data["polity"];
  if (typeof v !== "number") return "";
  const pol = world.polities.get(v);
  return pol ? ` in ${pol.name}` : "";
}

function lcBattle(s: string): string {
  return /^(Battle|Siege|The)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

// ---------------------------------------------------------------------------
// Final: death & legacy, or the present state
// ---------------------------------------------------------------------------

function finalParagraph(world: World, p: Person, chron: EventRecord[]): string {
  const pr = pronouns(p.sex);
  const h = fnv1a(`bio-final:${p.id}`);
  const culture = world.cultures.get(p.culture) ?? null;

  if (p.died !== null) {
    const sentences: string[] = [];
    const age = yearsBetween(p.born, p.died);
    const cause = p.deathCause;
    const causeNote = cause ? ` The cause set down: ${cause}.` : "";
    const deathOpeners = [
      `${shortName(world, p)} died ${inNthYear(pr.poss, age)}, in the year ${yearOf(p.died)}.${causeNote}`,
      `Death found ${shortName(world, p)} ${inNthYear(pr.poss, age)}, in the year ${yearOf(p.died)}.${causeNote}`,
    ];
    sentences.push(deathOpeners[h % deathOpeners.length]);

    const rel = world.religions.get(p.religion);
    if (rel && rel.funeralRite.length > 0) sentences.push(rel.funeralRite);

    const spouse = widowAtDeath(world, p);
    const kids = livingChildren(world, p);
    const survivors: string[] = [];
    if (spouse) survivors.push(`${pr.poss} ${pronouns(spouse.sex).spouse} ${shortName(world, spouse)}`);
    if (kids.length > 0) survivors.push(kids.length === 1 ? `one child, ${kids[0].givenName}` : `${numberWord(kids.length)} children`);
    if (survivors.length > 0) sentences.push(`Left behind: ${joinList(survivors)}.`);

    if (p.epithet.length > 0) {
      sentences.push(`The chronicle keeps ${pr.obj} as ${p.givenName} ${p.epithet}; the name outlived the face.`);
    } else {
      const remembered = [
        `What the chronicle keeps is the shape of a life, plainly lived and plainly ended.`,
        `The rest is entries in a ledger, and this account, which is more than most get.`,
      ];
      sentences.push(remembered[(h >>> 3) % remembered.length]);
    }
    const image = legacyImage(culture, h);
    if (image.length > 0) sentences.push(image);
    return sentences.join(" ");
  }

  // The living get a present-state paragraph.
  const sentences: string[] = [];
  const age = yearsBetween(p.born, world.now);
  const prof = p.status.profession;
  const an = /^[aeiou]/.test(prof) ? "an" : "a";
  const profNote = prof !== "none" ? `, ${prof === "ruler" || prof === "noble" ? "a person of rank" : `${an} ${prof}`}` : "";
  const placeName = p.location !== null ? world.settlements.get(p.location)?.name : undefined;
  const at = placeName ? ` at ${placeName}` : p.location === null ? ", somewhere beyond the map's edge" : "";
  sentences.push(`So the chronicle stands for now. ${shortName(world, p)} is in ${pr.poss} ${ordinalYearWord(age)} year${profNote}${at}.`);

  const spouse = spouseOf(world, p);
  const kids = livingChildren(world, p);
  if (spouse) {
    const kidNote = kids.length > 0 ? `; ${numberWord(kids.length)} ${kids.length === 1 ? "child lives" : "children live"} under the roof or near it` : "";
    sentences.push(`${pr.Subj} is married to ${shortName(world, spouse)}${kidNote}.`);
  } else {
    const buried = p.marriages.find((m) => m.endReason === "death");
    if (buried) {
      const lost = world.people.get(buried.spouse);
      const word = lost ? pronouns(lost.sex).spouse : "spouse";
      sentences.push(`${pr.Subj} has buried a ${word} and not taken another.`);
    }
    if (kids.length > 0) {
      sentences.push(`${cap(numberWord(kids.length))} ${kids.length === 1 ? "child keeps" : "children keep"} ${pr.obj} busy.`);
    }
  }

  const open = p.storylines
    .slice()
    .sort((a, b) => a - b)
    .map((id) => world.storylines.get(id))
    .find((s) => s && !s.resolved && s.ended === null);
  if (open) {
    sentences.push(`One tale around ${pr.obj} is still unspooling, and the chronicler keeps the page open.`);
  } else {
    const closers = [
      `Whatever comes next has not happened yet.`,
      `The ink on ${pr.poss} page is not dry.`,
    ];
    sentences.push(closers[(h >>> 5) % closers.length]);
  }
  return sentences.join(" ");
}

function widowAtDeath(world: World, p: Person): Person | null {
  for (const m of p.marriages) {
    if (m.endReason === "death" && m.endDate === p.died) {
      const s = world.people.get(m.spouse);
      if (s && s.died === null) return s;
    }
    if (m.active) {
      const s = world.people.get(m.spouse);
      if (s && s.died === null) return s;
    }
  }
  return null;
}

function ordinalYearWord(age: number): string {
  // "in her fortieth year" reads better than "aged thirty-nine".
  return ordinalWord(Math.max(1, age));
}
