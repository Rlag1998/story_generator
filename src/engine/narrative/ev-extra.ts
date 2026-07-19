/**
 * Renderers for the story module's working vocabulary: beats that are not in
 * the canonical EventType union but appear in real chronicles (fortune turns,
 * rumors, kept griefs, secret meetings). Truly unknown types still fall to
 * the generic renderer in events.ts.
 */

import type { EvRenderer } from "./cx";
import { cap, lcClause } from "./text";

export const EXTRA_RENDERERS: Record<string, EvRenderer> = {
  "ambition-kindled": (c) => {
    const p = c.person("subject") ?? c.primary();
    const n = c.nameOf(p, "one of the townsfolk");
    const patron = c.person("patron");
    const goal = c.str("goal");
    const aim =
      goal === "wealth" ? "wealth, real wealth, the kind with a gate"
      : goal === "mastery" ? "mastery of the craft, whole and acknowledged"
      : goal === "office" ? "a seat where decisions are made"
      : goal ? goal : "something more than the given portion";
    const backed = patron ? ` ${c.nameOf(patron)} saw it and chose to feed it.` : "";
    return [
      `A hunger woke in ${n} that would not sit quiet again. The object of it: ${aim}.${backed}`,
      `${n} looked at ${c.pr(p).poss} lot, found it small, and set ${c.pr(p).poss} eyes higher: ${aim}.${backed}`,
      `Somewhere in these months a resolve set hard in ${n}: ${aim}.${backed}`,
    ];
  },

  "contest-held": (c) => {
    const a = c.person("a");
    const b = c.person("b");
    const victor = c.person("victor");
    const an = c.nameOf(a, "one rival");
    const bn = c.nameOf(b, "the other");
    const form = c.str("form");
    const bout = form ? `: ${form}` : "";
    const won = victor ? ` The day went to ${c.nameOf(victor)}, and the other went home counting reasons.` : "";
    return [
      `${an} and ${bn} put their rivalry to the test${bout}.${won}`,
      `A contest${c.place()}, with the whole street judging${bout}.${won}`,
      `The old question of ${an} against ${bn} was asked again in the open${bout}.${won}`,
    ];
  },

  "fortune-turn": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "one of the townsfolk");
    const matter = c.str("matter");
    const rise = c.str("direction") === "rise";
    const what = matter ? ` ${cap(matter)}.` : "";
    if (rise) {
      return [
        `Fortune turned toward ${n}.${what}`,
        `Things began going ${n}'s way at last.${what}`,
        `A good turn in ${n}'s affairs.${what}`,
      ];
    }
    return [
      `Fortune turned against ${n}.${what}`,
      `A stumble in ${n}'s road.${what}`,
      `The luck went out of ${n}'s year.${what}`,
    ];
  },

  rumor: (c) => {
    const of = c.num("of") !== null ? c.world.people.get(c.num("of")!) : null;
    const about = of ? c.nameOf(of) : c.nameOf(c.primary(), "an absent name");
    const word = c.str("word");
    const what = word ? ` The word going round: ${word}` : "";
    return [
      `Rumor moved through ${c.placeOr("the district")} concerning ${about}.${what}`,
      `Talk of ${about} passed from stall to stall${c.place()}.${what}`,
      `${about} was the subject at every well and washing stone.${what}`,
    ];
  },

  "grief-kept": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "the bereaved");
    const against = c.num("against") !== null ? c.world.people.get(c.num("against")!) : c.person("against");
    const manner = c.str("manner");
    const at = against ? `, and its edge points at ${c.nameOf(against)}` : "";
    const how = manner ? ` ${cap(manner)}.` : "";
    return [
      `${n} did not set the grief down${at}.${how}`,
      `The mourning ended; the grief did not. ${n} keeps it close${at}.${how}`,
      `${n} folded the loss away where it would stay sharp${at}.${how}`,
    ];
  },

  "tale-ended": (c) => {
    const reason = c.str("reason");
    const of = c.num("of") !== null ? c.world.people.get(c.num("of")!) : null;
    const whose = of ? ` of ${c.nameOf(of)}` : "";
    const why = reason ? ` ${cap(reason)}.` : "";
    return [
      `So ends that tale${whose}.${why}`,
      `The thread${whose} runs out here.${why}`,
      `The chronicle closes the matter${whose}.${why}`,
    ];
  },

  stalking: (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "someone");
    const watched = c.str("watched");
    const detail = watched ? ` ${cap(watched)}.` : "";
    return [
      `${n} has been watching, and waiting, and telling no one.${detail}`,
      `${n} kept to the edges of things, eyes fixed on one door.${detail}`,
    ];
  },

  "penance-done": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "a penitent");
    const act = c.str("act");
    const what = act ? ` The penance: ${act}.` : "";
    return [
      `${n} did penance.${what}`,
      `Quietly, and without being told to, ${n} set about atonement.${what}`,
      `${n} bent to penance ${c.when(p)}.${what}`,
    ];
  },

  "lovers-parted": (c) => {
    const a = c.person("a", "lover");
    const b = c.person("b", "beloved");
    const an = c.nameOf(a, "one heart");
    const bn = c.nameOf(b, "the other");
    const by = c.str("by");
    const cause = by ? ` What parted them: ${by}.` : "";
    return [
      `${an} and ${bn} were parted.${cause}`,
      `It ended between ${an} and ${bn}, and not because either wished it.${cause}`,
      `The road forked for ${an} and ${bn}, and they took different branches.${cause}`,
    ];
  },

  "plot-ripened": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "the plotters");
    const word = c.str("word");
    const state = word ? ` ${cap(word)}.` : "";
    return [
      `the design of ${n} has ripened toward action.${state}`,
      `${n} moved from grievance to preparation.${state}`,
    ];
  },

  "secret-meeting": (c) => {
    const a = c.person("a", "lover", "subject");
    const b = c.person("b", "beloved");
    const an = c.nameOf(a, "one");
    const bn = c.nameOf(b, "another");
    const where = c.str("where");
    const at = where ? ` The place: ${where}.` : "";
    return [
      `${an} and ${bn} met where no one was meant to see.${at}`,
      `a lamp was shuttered and a door left off the latch for ${an} and ${bn}.${at}`,
    ];
  },

  "search-mounted": (c) => {
    const found = c.str("found");
    const result = found ? ` What it turned up: ${found}.` : "";
    return [
      `A search was mounted from ${c.placeOr("the village")}, lanterns strung out across the dark fields.${result}`,
      `They walked the woods in lines and dragged the pools.${result}`,
      `Every able hand turned out to search.${result}`,
    ];
  },

  sabotage: (c) => {
    const saboteur = c.person("saboteur", "culprit");
    const victim = c.person("victim", "target");
    const sn = c.nameOf(saboteur, "an envious hand");
    const work = c.str("work");
    const how = c.str("how");
    const target = victim ? `${c.nameOf(victim)}'s ${work ?? "work"}` : (work ?? "the work");
    const way = how ? ` The method: ${how}.` : "";
    return [
      `${sn} put a quiet ruin into ${target}.${way}`,
      `it was ${sn} who spoiled ${target}, by night and on purpose.${way}`,
    ];
  },

  recanted: (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "the accused");
    const manner = c.str("manner");
    const how = manner ? ` The way of it: ${manner}.` : "";
    return [
      `${n} recanted.${how}`,
      `Faced with the full weight of the temple, ${n} unsaid it all.${how}`,
    ];
  },

  "work-ruined": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "the maker");
    const work = c.str("work");
    const how = c.str("how");
    const thing = work ? `the ${work}` : "the work of years";
    const way = how ? ` The ruin came by ${how}.` : "";
    return [
      `${thing[0].toUpperCase() + thing.slice(1)} of ${n} was ruined.${way}`,
      `${n} stood a long time looking at what was left of ${thing}.${way}`,
    ];
  },

  "wonder-shown": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "a child of the town");
    const feat = c.str("feat");
    const what = feat ? ` Witnesses tell it plainly: ${feat}.` : "";
    return [
      `${n} did a thing that made the grown masters go quiet.${what}`,
      `Word spread of ${n}'s gift.${what}`,
      `${n} showed what the gift could do.${what}`,
    ];
  },

  "support-courted": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "the claimant");
    const realm = c.polityName("polity", "the crown");
    const how = c.str("how");
    const way = how ? ` The courting went thus: ${how}.` : "";
    return [
      `${n} went quietly among the discontented of ${realm}, counting hands.${way}`,
      `over wine and grievance, ${n} courted support against ${realm}.${way}`,
    ];
  },

  "great-work-begun": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "an artisan");
    const title = c.str("title");
    const work = c.str("work");
    const named = title ? `, already privately called ${title},` : "";
    const kind = work ? ` in the ${work}'s art` : "";
    return [
      `${n} began a great work${kind}${named} and stopped taking small commissions.`,
      `Something ambitious took shape on ${n}'s bench${named}.`,
      `${n} set hand to the piece${named} that would take years and prove everything.`,
    ];
  },

  "gift-revealed": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "a child");
    const gift = c.str("gift");
    const how = c.str("how");
    const what = gift ? ` The gift is for ${gift}.` : "";
    // Discovery phrases arrive subjectless ("set a dog's leg so cleanly...").
    const discovered = how ? ` It came out when ${c.pr(p).subj} ${lcClause(how)}.` : "";
    return [
      `A gift showed itself in ${n}.${what}${discovered}`,
      `${n} turned out to have a talent nobody planted.${what}${discovered}`,
    ];
  },

  "fortune-made": (c) => {
    const p = c.primary();
    const n = c.nameOf(p, "a bold trader");
    const how = c.str("how");
    const way = how ? ` The making of it: ${how}.` : "";
    return [
      `${n} came into real money.${way}`,
      `The ventures paid at last: ${n} is wealthy now, and learning what that costs.${way}`,
    ];
  },
};
