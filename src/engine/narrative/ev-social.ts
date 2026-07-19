/**
 * Renderers for the social fabric: friendships, rivalries, loves, quarrels,
 * duels, oaths, and gifts.
 */

import type { EvRenderer } from "./cx";
import { cap } from "./text";

export const SOCIAL_RENDERERS: Record<string, EvRenderer> = {
  "friendship-formed": (c) => {
    const an = c.name("a", "one");
    const bn = c.name("b", "another");
    const bond = c.str("bond");
    const how = bond ? ` It began with ${bond}.` : "";
    return [
      `${an} and ${bn} became fast friends.${how}`,
      `A friendship took root between ${an} and ${bn}, the kind that outlasts weather.${how}`,
      `${an} found in ${bn} the friend who gets the truth first.${how}`,
    ];
  },

  "rivalry-formed": (c) => {
    const an = c.name("a", "one");
    const bn = c.name("b", "another");
    const over = c.str("over");
    const why = over ? ` At the bottom of it: ${over}.` : "";
    return [
      `Between ${an} and ${bn} a rivalry hardened, the kind neighbors learn to work around.${why}`,
      `${an} and ${bn} began keeping score against one another.${why}`,
      `Something curdled between ${an} and ${bn}; from that season they pulled against each other in all things.${why}`,
    ];
  },

  "romance-began": (c) => {
    const a = c.person("a", "lover");
    const b = c.person("b", "beloved");
    const an = c.nameOf(a, "one heart");
    const bn = c.nameOf(b, "another");
    const spark = c.str("spark");
    const how = spark ? ` It began with ${spark}.` : "";
    return [
      `${an} and ${bn} began walking out together.${how}`,
      `A courtship began between ${an} and ${bn}, watched with interest from every doorway${c.place()}.${how}`,
      `${cap(c.when(a ?? b))}, ${an} started finding reasons to pass ${bn}'s door.${how}`,
    ];
  },

  "affair-began": (c) => {
    const an = c.name("a", "one");
    const bn = c.name("b", "another");
    const spark = c.str("spark");
    const how = spark ? ` It began with ${spark}.` : "";
    // Written bare; the secret frame supplies the conspiratorial opening.
    return [
      `${an} and ${bn} have become lovers, though at least one of them is sworn elsewhere.${how}`,
      `${an} has taken to slipping away to meet ${bn} where no lamp reaches.${how}`,
      `there is more between ${an} and ${bn} than either's marriage vows allow.${how}`,
    ];
  },

  "affair-discovered": (c) => {
    const an = c.name("a", "one lover");
    const bn = c.name("b", "the other");
    const how = c.str("how");
    const found = how ? ` It came out through ${how}.` : "";
    return [
      `The affair between ${an} and ${bn} came into the light, and ${c.placeOr("the town")} talked of little else.${found}`,
      `What ${an} and ${bn} had hidden was hidden no longer.${found}`,
      `The truth about ${an} and ${bn} got loose ${c.when(null)}, as such truths do.${found}`,
    ];
  },

  quarrel: (c) => {
    const a = c.person("a", "instigator");
    const b = c.person("b", "target");
    const an = c.nameOf(a, "one");
    const bn = c.nameOf(b, "another");
    const over = c.str("over");
    const why = over ? ` The matter of it: ${over}.` : "";
    return [
      `Hard words between ${an} and ${bn}${c.place()}, loud enough for the street to hear.${why}`,
      `${an} and ${bn} quarreled bitterly.${why}`,
      `A falling-out: ${an} against ${bn}, and neither would yield the last word.${why}`,
    ];
  },

  reconciliation: (c) => {
    const an = c.name("a", "one");
    const bn = c.name("b", "the other");
    const manner = c.str("manner");
    const how = manner ? ` The way of it: ${manner}.` : "";
    return [
      `${an} and ${bn} made their peace at last.${how}`,
      `The old grievance between ${an} and ${bn} was set down and left where it lay.${how}`,
      `${an} crossed the street ${pDay(c)} and offered ${bn} a hand, and it was taken.${how}`,
    ];
  },

  duel: (c) => {
    const ch = c.person("challenger");
    const cd = c.person("challenged");
    const chn = c.nameOf(ch, "one duelist");
    const cdn = c.nameOf(cd, "the other");
    const over = c.strOr("over", "a matter of honor");
    const outcome = c.str("outcome");
    const victor = c.person("victor");
    const slain = c.person("slain");
    let end: string;
    if (outcome === "death" && slain) {
      end = ` Steel found its answer: ${c.nameOf(slain)} did not walk away.`;
    } else if (outcome === "death") {
      end = " One of them was carried from the ground.";
    } else if (outcome === "yield") {
      end = victor ? ` It ended at the yield, with ${c.nameOf(victor)} standing over the point.` : " It ended at the yield, honor fed and no grave dug.";
    } else {
      end = victor ? ` First blood went to ${c.nameOf(victor)}, and there it stopped.` : " It ended at first blood.";
    }
    return [
      `${chn} called ${cdn} out over ${over}, and they met with steel${c.place()}.${end}`,
      `A duel${c.place()}: ${chn} against ${cdn}, over ${over}.${end}`,
      `Over ${over}, ${chn} and ${cdn} went to the ground with blades ${c.when(ch ?? cd)}.${end}`,
    ];
  },

  brawl: (c) => {
    const a = c.person("a", "instigator");
    const b = c.person("b", "target");
    const an = c.nameOf(a, "one");
    const bn = c.nameOf(b, "another");
    const over = c.str("over");
    const why = over ? ` Ask what it was over and you will hear: ${over}.` : "";
    return [
      `Fists and overturned benches${c.place()}: ${an} and ${bn} came to blows.${why}`,
      `${an} and ${bn} brawled in the open, to the entertainment of everyone not related to them.${why}`,
      `A plain ugly scuffle between ${an} and ${bn}, ended by neighbors hauling them apart.${why}`,
    ];
  },

  insult: (c) => {
    const a = c.person("a", "instigator");
    const b = c.person("b", "target");
    const an = c.nameOf(a, "one");
    const bn = c.nameOf(b, "another");
    const slight = c.str("slight");
    const what = slight ? ` The offense, as told after: ${slight}.` : "";
    return [
      `${an} put an insult on ${bn} before witnesses, the kind that does not wash out.${what}`,
      `Words were thrown${c.place()}: ${an} shamed ${bn} in the open.${what}`,
      `${an} said a thing to ${bn} that the street repeated for a month.${what}`,
    ];
  },

  gift: (c) => {
    const g = c.person("giver");
    const r = c.person("receiver", "to");
    const gn = c.nameOf(g, "a well-wisher");
    const rn = c.nameOf(r, "a neighbor");
    const what = c.str("gift") ?? c.str("gesture");
    const thing = what ? `: ${what}` : "";
    return [
      `${gn} brought ${rn} a gift${thing}.`,
      `A kindness passed from ${gn} to ${rn}${thing}.`,
      `${gn} sent to ${rn}'s door with something well chosen${thing}.`,
    ];
  },

  "oath-sworn": (c) => {
    const a = c.person("a", "plotter", "subject");
    const b = c.person("b", "sworn", "target");
    const an = c.nameOf(a, "one");
    const oath = c.str("oath") ?? c.str("over");
    const what = oath ? ` The words of it: ${oath}.` : "";
    if (b) {
      const bn = c.nameOf(b);
      return [
        `${an} and ${bn} swore an oath to one another, with witnesses to hold them to it.${what}`,
        `Hands were clasped and words given: ${an} bound to ${bn} by oath.${what}`,
        `${an} swore to ${bn}${c.place()}, and such swearing is not lightly unsaid.${what}`,
      ];
    }
    return [
      `${an} swore a binding oath${c.place()}.${what}`,
      `An oath was given by ${an}, before witnesses who will remember it.${what}`,
    ];
  },

  "oath-broken": (c) => {
    const a = c.person("a", "subject");
    const an = c.nameOf(a, "an oathbreaker");
    const oath = c.str("oath") ?? c.str("over");
    const what = oath ? ` The oath in question: ${oath}.` : "";
    return [
      `${an} broke a sworn oath, and word of it traveled faster than ${c.pr(a).subj} did.${what}`,
      `The oath ${an} had given was found broken.${what}`,
      `${an} let a sworn word fall to the ground and stepped over it.${what}`,
    ];
  },

  "mentorship-began": (c) => {
    const ward = c.person("ward", "subject", "a");
    const mentor = c.person("mentor", "patron", "b");
    const wn = c.nameOf(ward, "a young one");
    const mn = c.nameOf(mentor, "an elder");
    const craft = c.str("craft");
    const of = craft ? ` in the ways of ${craft}` : "";
    return [
      `${mn} took ${wn} under wing${of}.`,
      `${wn} began learning at ${mn}'s elbow${of}.`,
      `An old head bent over a young one: ${mn} began teaching ${wn}${of}.`,
    ];
  },

  "bastard-acknowledged": (c) => {
    const father = c.person("father", "subject");
    const child = c.person("child", "target");
    const fn = c.nameOf(father, "the father");
    const cn = c.nameOf(child, "the child");
    return [
      `${fn} acknowledged ${cn} as ${c.pr(father).poss} own before witnesses, and the whispering had to find new material.`,
      `What the street had long said aloud was made formal: ${fn} owned ${cn} as ${c.pr(child).child === "daughter" ? "daughter" : "son"}.`,
      `${fn} gave ${cn} a name and a place at the table, late but given.`,
    ];
  },
};

/** Small day-flavor for reconciliation prose. */
function pDay(c: Parameters<EvRenderer>[0]): string {
  return c.pickFrom(["one market day", "one washing day", "one quiet morning"], "day");
}
