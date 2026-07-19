/**
 * Renderers for lifecycle events: births, deaths, marriages, work, sickness.
 */

import type { Person } from "../core/types";
import type { Cx, EvRenderer } from "./cx";
import { shortName, spouseOf, titledName } from "./names";
import { atAge, cap, deThe, inNthYear, joinList, numberWord } from "./text";

/** Concrete trade objects for prose: "took up the nets", "left the forge". */
export const TRADE_THING: Partial<Record<string, string>> = {
  farmer: "the plow", herder: "the herds", fisher: "the nets",
  hunter: "the bow", miner: "the pick", smith: "the forge",
  carpenter: "the adze", mason: "the chisel", weaver: "the loom",
  potter: "the wheel", brewer: "the vats", baker: "the ovens",
  merchant: "the ledgers", peddler: "the pack and the road",
  innkeeper: "the taproom", healer: "the herb-satchel",
  midwife: "the birthing stool", scribe: "the quill", scholar: "the books",
  priest: "the altar", monastic: "the cloister", bard: "the harp",
  artist: "the brush", soldier: "the spear", guard: "the watch",
  sailor: "the rigging", servant: "the great house's keys",
  courtier: "the long game of court", steward: "the accounts",
  judge: "the bench", beggar: "the church steps", thief: "other men's purses",
  smuggler: "the moonless coves", gravedigger: "the spade",
  falconer: "the mews", gardener: "the beds and borders",
};

export function tradeThing(prof: string): string {
  return TRADE_THING[prof] ?? `the ${prof}'s work`;
}

/** One-line color for a visibly rare-marked newborn. */
function rareBirthNote(c: Cx, keys: string[]): string {
  const k = keys[0];
  switch (k) {
    case "moon-pale":
      return "The child came pale as chalk, white-haired, and the old women made signs over the cradle.";
    case "mismatched-eyes":
      return "Each of the babe's eyes held its own color, and the midwife said nothing at all.";
    case "silver-streak":
      return "A lock of silver showed in the newborn hair, as it does in that line.";
    case "giants-blood":
      return "The midwife swore she had never lifted a heavier babe.";
    case "six-fingered":
      return "Six fingers on the one small hand; the women counted twice by candlelight.";
    case "night-eyed":
      return "The babe's eyes were all pupil, dark as a well.";
    case "unaging":
      return "A strangely finished little face, the women said, like one who had been here before.";
    default:
      return `The child bore the mark folk call ${k.replace(/-/g, " ")}.`;
  }
}

/**
 * Spouse widowed by this death: an active marriage, or one whose end lines
 * up with the event's own date (the people module closes marriages first).
 */
function widowedSpouseAt(c: Cx, p: Person): Person | null {
  const live = spouseOf(c.world, p);
  if (live) return live;
  for (const m of p.marriages) {
    if (m.endReason === "death" && m.endDate === c.ev.date) {
      const s = c.world.people.get(m.spouse);
      if (s && s.died === null) return s;
    }
  }
  return null;
}

export const LIFECYCLE_RENDERERS: Record<string, EvRenderer> = {
  birth: (c) => {
    const child = c.person("subject");
    const mother = c.person("mother");
    const father = c.person("father");
    const legal = c.person("legalFather");
    const childName = c.nameOf(child, "a child");
    const kid = child ? c.pr(child).child : "child";
    const mName = c.nameOf(mother, "an unnamed mother");
    const rares = c.strList("rareTraits");
    const tail = rares.length > 0 ? " " + rareBirthNote(c, rares) : "";
    // A married woman's child by another man: the truth, told plain, for the
    // secret wrapper to keep dark.
    if (c.ev.secret && father && legal && father.id !== legal.id) {
      return [
        `the ${kid} ${mName} bore${c.place()} is of ${c.nameOf(father)}'s siring, whatever name ${c.nameOf(legal)} gives the cradle.${tail}`,
        `${childName}, new in the cradle at ${c.placeOr("home")}, was fathered by ${c.nameOf(father)} and not by ${c.nameOf(legal)}, who holds the child his own.${tail}`,
      ];
    }
    const withFather = father ? ` and ${c.nameOf(father)}` : "";
    const noFather = !father && !legal && c.bool("illicit") ? " No father was named at the naming." : "";
    return [
      `${mName} was delivered of a ${kid}${c.place()} ${c.when(mother ?? child)}; they named ${child ? c.pr(child).obj : "the child"} ${childName}.${noFather}${tail}`,
      `A ${child ? c.pr(child).young : "child"}, ${childName}, born to ${mName}${withFather}${c.place()} ${c.when(mother ?? child)}.${noFather}${tail}`,
      `${cap(c.when(mother ?? child))}, the household of ${mName}${withFather} grew by one: a ${kid}, ${childName}.${noFather}${tail}`,
    ];
  },

  death: (c) => {
    const p = c.person("subject", "deceased") ?? c.primary();
    const n = c.nameOf(p, "one whose name the record lost");
    const tn = p ? titledName(c.world, p) : n;
    const pr = c.pr(p);
    const age = c.num("ageYears") ?? (p ? c.age(p) : 0);
    const cause = c.strOr("cause", "no cause was ever set down");
    const rel = c.religionOf(p);
    const rite = rel && rel.funeralRite.length > 0 ? " " + rel.funeralRite : "";
    const widow = p ? widowedSpouseAt(c, p) : null;
    const widowNote = widow ? ` ${shortName(c.world, widow)} was left a ${c.pr(widow).widow}.` : "";
    const grave = c.ev.importance >= 30;
    const base = grave
      ? [
          `${tn} died${c.place()} ${inNthYear(pr.poss, age)}, and the news went out along every road. The chronicle gives the cause plainly: ${cause}.`,
          `Death came for ${tn} ${inNthYear(pr.poss, age)}${c.place()}. The entry in the roll of the dead reads: ${cause}.`,
          `In the year ${c.year()}, ${c.placeOr("the district")} buried ${tn}, aged ${numberWord(age)}. Cause set down: ${cause}.`,
        ]
      : [
          `${n} died${c.place()} ${inNthYear(pr.poss, age)}. The cause set down in the roll: ${cause}.`,
          `Death came quietly for ${n} ${inNthYear(pr.poss, age)}${c.place()}; the register reads: ${cause}.`,
          `${cap(c.when(p))}, ${c.placeOr("the parish")} buried ${n}, aged ${numberWord(age)}. The entry gives the cause: ${cause}.`,
        ];
    return base.map((s) => s + rite + widowNote);
  },

  "coming-of-age": (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "a youth");
    const pr = c.pr(p);
    const age = c.num("ageYears") ?? (p ? c.age(p) : 16);
    const culture = c.cultureOf(p);
    const riteName = c.str("rite") ?? c.tradition(culture, "coming-of-age")?.name ?? null;
    const riteNote = riteName ? ` By custom ${pr.subj} was received under the rite called ${riteName}.` : "";
    const folk = culture ? `${culture.demonym} ` : "";
    return [
      `${n} came of age${c.place()} ${c.when(p)}, ${atAge(age)}.${riteNote}`,
      `At ${numberWord(age)}, ${n} was counted a ${pr.noun} grown among the ${folk}folk of ${c.placeOr("the district")}.${riteNote}`,
      `${cap(c.when(p))}, ${n} put childhood down and took up a grown ${pr.noun}'s share of the work.${riteNote}`,
    ];
  },

  betrothal: (c) => {
    const bride = c.person("bride", "a");
    const groom = c.person("groom", "b");
    const bn = c.nameOf(bride, "a bride");
    const gn = c.nameOf(groom, "a groom");
    if (c.bool("alliance")) {
      const reason = c.str("reason");
      const why = reason ? ` The matchmakers named the reason without blushing: ${reason}.` : "";
      return [
        `A betrothal sealed the bargain between realms: ${bn} was promised to ${gn}.${why}`,
        `${bn} and ${gn} were promised to one another, and two courts breathed easier for it.${why}`,
      ];
    }
    const arranged = c.bool("arranged") ? " The match was the families' work, as such things mostly are." : "";
    const second = c.bool("secondWife") ? " She would come into the household as a second wife." : "";
    return [
      `${bn} was promised to ${gn}${c.place()}.${arranged}${second}`,
      `The promise was cried${c.place()}: ${bn} to ${gn}, to be wed when the families judge it time.${arranged}${second}`,
      `${gn} and ${bn} were betrothed ${c.when(bride ?? groom)}.${arranged}${second}`,
    ];
  },

  wedding: (c) => {
    const bride = c.person("bride", "a");
    const groom = c.person("groom", "b");
    const bn = c.nameOf(bride, "a bride");
    const gn = c.nameOf(groom, "a groom");
    const culture = c.cultureOf(bride) ?? c.cultureOf(groom);
    const riteName = c.str("rite") ?? c.tradition(culture, "wedding")?.name ?? null;
    const riteNote = riteName ? ` They were joined after the custom called ${riteName}.` : "";
    const love = c.bool("loveMatch") ? " It was a love match, and everyone knew it." : "";
    const arranged = c.bool("arranged") && !c.bool("loveMatch") ? " The families had made the match; the couple made what they could of it." : "";
    if (c.ev.importance >= 14) {
      return [
        `Banners and wedding garlands${c.place()}: ${c.titled("bride", bn)} was wed to ${c.titled("groom", gn)} ${c.when(bride ?? groom)}.${riteNote}${love}`,
        `${c.titled("bride", bn)} wed ${c.titled("groom", gn)} before a great gathering${c.place()}, and the feasting ran until the candles failed.${riteNote}${love}`,
      ];
    }
    return [
      `${bn} wed ${gn}${c.place()} ${c.when(bride ?? groom)}.${riteNote}${love}${arranged}`,
      `There was a wedding${c.place()}: ${bn} to ${gn}, with the neighbors at the tables.${riteNote}${love}${arranged}`,
      `${cap(c.when(bride ?? groom))}, ${bn} and ${gn} were married.${riteNote}${love}${arranged}`,
    ];
  },

  divorce: (c) => {
    const a = c.person("a");
    const b = c.person("b");
    const an = c.nameOf(a, "one spouse");
    const bn = c.nameOf(b, "the other");
    const reason = c.str("reason");
    const why = reason ? ` Folk gave the reason simply: ${reason}.` : "";
    return [
      `${an} and ${bn} parted, and the marriage was ended.${why}`,
      `The marriage of ${an} and ${bn} was dissolved${c.place()}.${why}`,
      `${an} and ${bn} divided the pots, the debts, and the years, and went separate ways.${why}`,
    ];
  },

  "pregnancy-loss": (c) => {
    const m = c.person("subject", "mother") ?? c.primary();
    const n = c.nameOf(m, "a woman of the town");
    const pr = c.pr(m);
    if (c.bool("stillborn")) {
      const litter = c.num("litter") ?? 1;
      const plural = litter > 1 ? "the children" : "the child";
      return [
        `${n} was brought to bed${c.place()}, and ${plural} never drew breath. The women of the house kept ${pr.obj} company through it.`,
        `A hard birth and a silent cradle: ${n}'s ${litter > 1 ? "children were" : "child was"} born still ${c.when(m)}.`,
      ];
    }
    return [
      `${n} lost the child ${pr.subj} was carrying, ${c.when(m)}.`,
      `The child ${n} carried did not live to be born. ${pr.Subj} went back to the work when ${pr.subj} could.`,
      `Grief came small and heavy to ${c.placeOr("the house")}: ${n} miscarried ${c.when(m)}.`,
    ];
  },

  "took-profession": (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "a youth");
    const prof = c.strOr("profession", "laborer");
    const thing = tradeThing(prof);
    const age = p ? c.age(p) : 0;
    if (c.bool("prodigy")) {
      return [
        `${n} took up ${thing} ${atAge(age)}, and the old hands watched and said little, which is how they praise.`,
        `${n} was made for ${thing}; by ${c.season()}'s end the masters of ${c.placeOr("the town")} were trading looks.`,
      ];
    }
    const plural = prof === "thief" ? "thieves" : prof === "monastic" ? "monastics" : `${prof}s`;
    return [
      `${n} took up ${thing} ${atAge(age)}.`,
      `${cap(atAge(age))}, ${n} was counted among the ${plural} of ${c.placeOr("the district")}.`,
      `${n} settled to a trade: ${prof}, like enough to feed a household.`,
    ];
  },

  apprenticed: (c) => {
    const ward = c.person("ward", "subject");
    const mentor = c.person("mentor", "master");
    const wn = c.nameOf(ward, "a child");
    const craft = c.strOr("craft", "the trade");
    if (mentor) {
      const mn = c.nameOf(mentor);
      return [
        `${wn} was prenticed to ${mn} to learn ${tradeThing(craft)}.`,
        `${mn} took ${wn} on as prentice${c.place()}; seven years of sweeping first, as is proper.`,
        `${wn} went under ${mn}'s roof to be taught the ${craft}'s art.`,
      ];
    }
    return [
      `${wn} was put to prentice in the ${craft}'s craft${c.place()}.`,
      `${wn} began the long apprenticeship of ${tradeThing(craft)}.`,
    ];
  },

  retired: (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "an elder of the town");
    const prof = c.strOr("profession", "laborer");
    const thing = tradeThing(prof);
    return [
      `${n} put down ${thing} at last and let the young have it.`,
      `Age won its old argument: ${n} left the ${prof}'s work to other hands.`,
      `${n} worked ${thing} one final season, then sat down by the fire and stayed there.`,
    ];
  },

  moved: (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "a family");
    const from = c.settlementNameFromData("from", c.placeOr("one town"));
    const to = c.settlementNameFromData("to", "another town");
    const guardian = c.person("guardian");
    if (guardian) {
      return [
        `${n} went to live under ${c.nameOf(guardian)}'s roof at ${to}.`,
        `Orphaned of a home, ${n} was taken to ${to} and the keeping of ${c.nameOf(guardian)}.`,
      ];
    }
    const reason = c.str("reason");
    const why = reason === "work" ? " There was work there, and none at home." : reason ? ` The reason given: ${reason}.` : "";
    return [
      `${n} left ${from} for ${to}.${why}`,
      `${n} packed what there was to pack and took the road to ${to}.${why}`,
      `${cap(c.when(p))}, ${n} quit ${from} and settled at ${to}.${why}`,
    ];
  },

  emigrated: (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "one of the townsfolk");
    const pr = c.pr(p);
    const from = c.settlementNameFromData("from", c.placeOr("home"));
    return [
      `${n} went beyond the map's edge; ${from} saw ${pr.obj} no more.`,
      `${n} took the long road out of ${from} and did not come back.`,
      `One morning ${n} was simply gone from ${from}, off to some other country, and the chronicle loses the thread.`,
    ];
  },

  illness: (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "one of the household");
    const name = deThe(c.strOr("name", "fever"));
    const sev = c.num("severity") ?? 0.3;
    const dire = sev >= 0.55 ? " The household made ready for the worst." : "";
    if (c.bool("plague")) {
      return [
        `The ${name} found ${n}, as it found so many that season.${dire}`,
        `${n} took the ${name}; the door was marked and the neighbors kept away.${dire}`,
      ];
    }
    return [
      `The ${name} came to ${n}${c.place()}.${dire}`,
      `${n} took to bed with the ${name} ${c.when(p)}.${dire}`,
      `Sickness in the house of ${n}: the healer named it the ${name}.${dire}`,
    ];
  },

  recovery: (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "the patient");
    const pr = c.pr(p);
    const name = deThe(c.strOr("name", "sickness"));
    return [
      `${n} rose from the sickbed at last, thinner and alive; the ${name} had done its worst and lost.`,
      `The ${name} loosed its grip on ${n}, and by ${c.season()} ${pr.subj} was at work again.`,
      `${n} shook off the ${name}. The neighbors called it luck or answered prayer, each by their temper.`,
    ];
  },

  injury: (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "a laborer");
    const wound = c.strOr("wound", "a lasting hurt");
    const prof = c.str("profession");
    const trade = prof ? ` The ${prof}'s work marked ${c.pr(p).obj} for good.` : "";
    return [
      `${n} took a hurt that would not fully mend: ${wound}.${trade}`,
      `A bad day${c.place()}: ${n} came away with ${wound}.`,
      `${n} carries a new mark from that day forward, ${wound}.`,
    ];
  },

  "twin-birth": (c) => {
    const first = c.person("first");
    const second = c.person("second");
    const third = c.person("third");
    const names = [first, second, third].filter((p): p is Person => p !== null).map((p) => shortName(c.world, p));
    const list = names.length > 0 ? joinList(names) : "two newborns";
    const culture = c.cultureOf(first);
    const trad = c.tradition(culture, "twins");
    const tradNote = trad ? ` ${trad.description}` : "";
    const litter = c.num("litter") ?? Math.max(2, names.length);
    if (litter >= 3) {
      return [
        `Three at one birth${c.place()}: ${list}. The midwife will tell it for years.${tradNote}`,
        `A triple birth ${c.when(first)}: ${list}, all three squalling and strong.${tradNote}`,
      ];
    }
    return [
      `Twins came${c.place()} ${c.when(first)}: ${list}.${tradNote}`,
      `Two cradles where one was readied: ${list}, born within the same hour.${tradNote}`,
      `The midwife came out twice to announce: twins, ${list}.${tradNote}`,
    ];
  },
};
