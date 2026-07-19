/**
 * Descriptive prose for biographies: appearance from phenotype (with family
 * resemblance), temperament from personality axes, and cultural diction.
 */

import { fnv1a } from "../core/rng";
import {
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_TEXTURES,
  rareTraitDef,
} from "../core/appearance";
import type { Culture, CultureValue, Person, Phenotype, World } from "../core/types";
import { cap, joinList, pronouns } from "./text";

// ---------------------------------------------------------------------------
// Appearance vocabularies (indices are archetype ids; wrap by length)
// ---------------------------------------------------------------------------

const FACE_SHAPES = ["long", "round", "broad", "narrow", "square", "heart-shaped"];
const NOSES = ["straight", "hawkish", "blunt", "fine", "once-broken", "wide"];
const JAWS = ["soft", "firm", "heavy", "pointed", "square"];
const BROWS = ["level", "arched", "heavy", "fine"];
const MOUTHS = ["wide", "thin-lipped", "full", "small"];

function idx<T>(arr: readonly T[], i: number): T {
  const n = arr.length;
  return arr[((Math.round(i) % n) + n) % n];
}

export function hairColorName(ph: Phenotype): string {
  return idx(HAIR_COLORS, ph.hairColor).name;
}

export function eyeColorName(ph: Phenotype): string {
  return idx(EYE_COLORS, ph.eyeColor).name;
}

function statureWord(ph: Phenotype): string {
  const h = ph.heightScore;
  const b = ph.buildScore;
  const height = h > 1.8 ? "towering" : h > 0.9 ? "tall" : h < -1.8 ? "very short" : h < -0.9 ? "short" : "";
  const build = b > 1.8 ? "heavy-set" : b > 0.9 ? "broad" : b < -1.8 ? "reed-thin" : b < -0.9 ? "slight" : "";
  if (height && build) return `${height} and ${build}`;
  return height || build || "of middling frame";
}

/** Family features clearly shared with a parent, for "her mother's red hair". */
function sharedFeatures(world: World, p: Person): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  const pr = pronouns(p.sex);
  const mother = p.mother !== null ? world.people.get(p.mother) : undefined;
  const father = p.father !== null ? world.people.get(p.father) : undefined;
  const check = (parent: Person | undefined, word: string) => {
    if (!parent) return;
    if (out.length >= 2) return;
    if (!used.has("hair") && parent.phenotype.hairColor === p.phenotype.hairColor) {
      used.add("hair");
      out.push(`${pr.poss} ${word}'s ${hairColorName(p.phenotype)} hair`);
      return;
    }
    if (!used.has("eyes") && parent.phenotype.eyeColor === p.phenotype.eyeColor) {
      used.add("eyes");
      out.push(`${pr.poss} ${word}'s ${eyeColorName(p.phenotype)} eyes`);
      return;
    }
    if (!used.has("face") && parent.phenotype.faceShape === p.phenotype.faceShape) {
      used.add("face");
      out.push(`the same ${idx(FACE_SHAPES, p.phenotype.faceShape)} face as ${pr.poss} ${word}`);
      return;
    }
    if (!used.has("chin") && parent.phenotype.cleftChin && p.phenotype.cleftChin) {
      used.add("chin");
      out.push(`the cleft chin of ${pr.poss} ${word}'s line`);
    }
  };
  check(mother, "mother");
  check(father, "father");
  return out.slice(0, 2);
}

/** 2-4 sentence appearance paragraph from phenotype and parentage. */
export function appearanceParagraph(world: World, p: Person): string {
  const ph = p.phenotype;
  const pr = pronouns(p.sex);
  const h = fnv1a(`bio-look:${p.id}`);
  const sentences: string[] = [];

  const hair = `${idx(HAIR_TEXTURES, ph.hairTexture)} ${hairColorName(ph)} hair`;
  const eyes = `${eyeColorName(ph)} eyes`;
  const openers = [
    `${pr.Subj} was ${statureWord(ph)}, with ${hair} and ${eyes}`,
    `Those who describe ${pr.obj} agree on the essentials: ${statureWord(ph)}, ${hair}, ${eyes}`,
    `In person ${pr.subj} was ${statureWord(ph)}, with ${eyes} under ${hair}`,
  ];
  sentences.push(openers[h % openers.length] + ".");

  const featurePool = [
    `a ${idx(NOSES, ph.noseShape)} nose`,
    `a ${idx(JAWS, ph.jawShape)} jaw`,
    `${idx(BROWS, ph.browShape)} brows`,
    `a ${idx(MOUTHS, ph.mouthShape)} mouth`,
  ];
  const f1 = featurePool[h % featurePool.length];
  const f2 = featurePool[(h >>> 3) % featurePool.length];
  const marks: string[] = [f1];
  if (f2 !== f1) marks.push(f2);
  if (ph.freckles) marks.push("freckles that no season fully faded");
  if (ph.dimples) marks.push("dimples that undercut every attempt at sternness");
  sentences.push(`The face was ${idx(FACE_SHAPES, ph.faceShape)}, with ${joinList(marks.slice(0, 3))}.`);

  const shared = sharedFeatures(world, p);
  if (shared.length > 0) {
    sentences.push(`Anyone who knew the family saw ${joinList(shared)}.`);
  }

  const visibleRare = ph.rareTraits.map((k) => rareTraitDef(k)).find((d) => d?.visible);
  if (visibleRare) {
    sentences.push(`And there was the mark that strangers noticed first: ${visibleRare.name.toLowerCase()}. ${visibleRare.description}`);
  }
  if (p.injuries.length > 0) {
    sentences.push(`Life left its own marks: ${joinList(p.injuries.slice(0, 2))}.`);
  }
  return sentences.join(" ");
}

// ---------------------------------------------------------------------------
// Temperament
// ---------------------------------------------------------------------------

interface AxisPhrase {
  score: (p: Person) => number;
  text: (p: Person) => string;
}

const AXES: AxisPhrase[] = [
  {
    score: (p) => (p.personality.volatility > 0.35 && p.personality.wrath > 0.5 ? p.personality.volatility + p.personality.wrath : 0),
    text: () => "quick to anger and slow to forget",
  },
  {
    score: (p) => (p.personality.volatility < -0.4 ? -p.personality.volatility : 0),
    text: () => "steady as a doorpost, hard to rattle and harder to hurry",
  },
  {
    score: (p) => Math.max(0, p.personality.courage - 0.45),
    text: () => "afraid of very little, which worried the people who loved them",
  },
  {
    score: (p) => Math.max(0, -p.personality.courage - 0.4),
    text: () => "careful to a fault; the unkind said craven, the kind said long-lived",
  },
  {
    score: (p) => Math.max(0, p.personality.ambition - 0.55),
    text: (p) => `hungry for more than ${pronouns(p.sex).poss} portion, and not patient about it`,
  },
  {
    score: (p) => Math.max(0, p.personality.piety - 0.6),
    text: () => "devout in the marrow, first at the shrine and last to leave",
  },
  {
    score: (p) => Math.max(0, p.personality.honor - 0.5),
    text: () => "a keeper of given words, even the expensive ones",
  },
  {
    score: (p) => Math.max(0, -p.personality.honor - 0.4),
    text: () => "flexible about promises in ways that kept surprising people",
  },
  {
    score: (p) => Math.max(0, p.personality.compassion - 0.55),
    text: () => "soft-handed with the weak, whatever it cost",
  },
  {
    score: (p) => Math.max(0, p.personality.greed - 0.55),
    text: () => "tight-fisted; coins entered that purse and learned to live there",
  },
  {
    score: (p) => Math.max(0, p.personality.sociability - 0.5),
    text: () => "at home in any crowd, collecting names and debts of kindness",
  },
  {
    score: (p) => Math.max(0, -p.personality.sociability - 0.45),
    text: () => "happiest at the edge of the lamplight, watching rather than talking",
  },
  {
    score: (p) => Math.max(0, p.personality.diligence - 0.5),
    text: () => "worked like weather, steadily and without discussion",
  },
  {
    score: (p) => Math.max(0, p.personality.openness - 0.55),
    text: () => "curious past the point of sense, forever asking what lay over the hill",
  },
  {
    score: (p) => Math.max(0, p.personality.lust - 0.65),
    text: () => "warm-blooded, and the subject of certain songs",
  },
];

/** 2-3 sentence temperament paragraph from personality axes and trait labels. */
export function temperamentParagraph(p: Person): string {
  const pr = pronouns(p.sex);
  const h = fnv1a(`bio-temper:${p.id}`);
  const scored = AXES.map((a, i) => ({ i, s: a.score(p), t: a.text(p) }))
    .filter((e) => e.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, 3);

  const openers = [
    `In temper ${pr.subj} was`,
    `As for ${pr.poss} nature: ${pr.subj} was`,
    `Those who shared a roof with ${pr.obj} knew ${pr.obj} as`,
  ];
  let out: string;
  if (scored.length === 0) {
    out = `${openers[h % openers.length]} even-keeled, neither the first to laugh nor the last to forgive, the sort the village forgets to gossip about.`;
  } else {
    // These phrases carry their own commas, so a clause list reads cleaner
    // than a serial "and" once there is more than one.
    const joined = scored.length === 1 ? scored[0].t : scored.map((e) => e.t).join("; ");
    out = `${openers[h % openers.length]} ${joined}.`;
  }
  const labels = p.personality.traits.slice(0, 2);
  if (labels.length > 0) {
    const call = [
      `Neighbors put it more shortly: ${joinList(labels)}.`,
      `The word most often used of ${pr.obj} was ${joinList(labels.slice(0, 1))}.`,
      `Folk summed ${pr.obj} up as ${joinList(labels)}.`,
    ];
    out += " " + call[(h >>> 4) % call.length];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cultural diction
// ---------------------------------------------------------------------------

const VALUE_WORLDVIEW: Record<CultureValue, string> = {
  honor: "a name kept clean was worth more than bread",
  hospitality: "no traveler was turned from the door, whatever the pantry said",
  learning: "a letter learned was treasure no fire could take",
  piety: "the gods were counted present at every table",
  craftsmanship: "a thing worth making was worth making past complaint",
  kinship: "blood answered for blood and sheltered it too",
  conquest: "the strong took, and the songs agreed with them",
  seafaring: "the sea was the first and last fact of every year",
  trade: "everything had a price, and knowing it was a virtue",
  austerity: "wanting little was the only wealth that could not be stolen",
  artistry: "a life without beauty in it was counted half-lived",
  vengeance: "an unpaid wrong gathered interest by the season",
  stoicism: "complaint was spent sparingly, like winter candles",
  revelry: "any excuse for a feast was a good excuse",
};

/** "raised among Vessari folk, for whom the sea was the first and last fact". */
export function upbringingClause(culture: Culture | null): string {
  if (!culture || culture.values.length === 0) return "";
  const v = culture.values[0];
  const view = VALUE_WORLDVIEW[v];
  if (!view) return "";
  return `raised among ${culture.demonym} folk, for whom ${view}`;
}

/** A closing image colored by the culture's leading value. */
export function legacyImage(culture: Culture | null, h: number): string {
  if (!culture) return "";
  for (const v of culture.values) {
    switch (v) {
      case "seafaring":
        return h % 2 === 0
          ? "The name is still spoken on the water, where names last."
          : "Like a sail gone over the horizon, the memory grows small but does not sink.";
      case "honor":
        return "The name was kept clean, which among that folk is the whole of a monument.";
      case "kinship":
        return "The blood remembers, as that folk say, even when the stones forget.";
      case "learning":
        return "A line in a ledger, a name in a margin: by the measure of that folk, enough.";
      case "vengeance":
        return "Debts and dues were all settled, or are still being counted by someone.";
      case "craftsmanship":
        return "The work outlasts the worker; among that folk this is the preferred arrangement.";
      case "piety":
        return "The temple keeps the name in its prayers for the dead, which is a kind of forever.";
      case "revelry":
        return "There are still toasts drunk to the memory, which would have pleased them.";
      default:
        continue;
    }
  }
  return "";
}

/** Season phrasing for chapters, lightly colored by culture. */
export function chapterOpener(bandIndex: number, h: number): string {
  const options: string[][] = [
    ["The childhood years", "The early years", "The first years"],
    ["Youth came on", "The young years followed", "Grown but not yet settled"],
    ["The middle years", "In the full stride of life", "The strong years"],
    ["The later years", "Age came on", "In the last stretch of the road"],
  ];
  const row = options[Math.min(bandIndex, options.length - 1)];
  return row[h % row.length];
}
