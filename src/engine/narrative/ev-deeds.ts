/**
 * Renderers for deeds and drama: rescues, crimes, trials, exiles, wonders,
 * prophecies, and the making of names.
 */

import type { EvRenderer } from "./cx";
import { cap, lcClause } from "./text";

export const DEEDS_RENDERERS: Record<string, EvRenderer> = {
  "heroic-rescue": (c) => {
    const hero = c.person("subject", "rescuer", "hero");
    const saved = c.person("saved", "target");
    const hn = c.nameOf(hero, "an unnamed hand");
    const sn = c.nameOf(saved, "another");
    const deed = c.str("deed");
    const battle = c.str("battle");
    const peril = c.str("peril");
    if (battle) {
      const did = deed ? lcClause(deed) : `pulled ${sn} out of the worst of it`;
      return [
        `In the ${battle}, ${hn} ${did}. ${sn} owes the rest of ${c.pr(saved).poss} days to it.`,
        `Men who stood at the ${battle} tell the same story: ${hn} ${did}.`,
      ];
    }
    // Perils arrive as a bare noun ("fire") or as a whole deed
    // ("went back into the burning granary for the child's crying").
    if (peril && /\s/.test(peril)) {
      return [
        `${hn} ${lcClause(peril)}, and ${sn} lives because of it.`,
        `The tale is told plainly${c.place()}: ${hn} ${lcClause(peril)}.`,
      ];
    }
    const from = peril === "fire" ? "out of the flames" : peril ? `out of the ${peril}` : "from certain death";
    return [
      `${hn} went in after ${sn} and brought ${c.pr(saved).obj} ${from}.`,
      `${sn} lives because ${hn} did not stop to think${c.place()}.`,
      `A rescue told and retold${c.place()}: ${hn} pulled ${sn} ${from}.`,
    ];
  },

  "crime-theft": (c) => {
    const p = c.person("subject", "culprit");
    const n = c.nameOf(p, "an unknown hand");
    const what = c.str("what") ?? c.str("stolen");
    const thing = what ? `: ${what}` : ", and what was taken was missed at once";
    return [
      `${n} has been thieving${thing}.`,
      `light fingers were at work${c.place()}, and they belonged to ${n}${what ? `. The take: ${what}` : ""}.`,
      `${n} took what was not ${c.pr(p).poss} to take${what ? `: ${what}` : ""}.`,
    ];
  },

  "crime-murder": (c) => {
    const killer = c.person("killer");
    const victim = c.person("victim", "target");
    const kn = c.nameOf(killer, "an unknown hand");
    const vn = c.nameOf(victim, "the dead");
    const how = c.str("method") ?? c.str("manner");
    const way = how ? ` The way of it: ${how}.` : "";
    // Bare truth; the secret frame supplies "None yet know that...".
    return [
      `${vn} was murdered, and the hand that did it was ${kn}'s.${way}`,
      `it was ${kn} who put ${vn} in the ground.${way}`,
      `${kn} killed ${vn} and walked away clean, for now.${way}`,
    ];
  },

  "crime-discovered": (c) => {
    const culprit = c.person("culprit", "subject");
    const cn = c.nameOf(culprit, "the guilty");
    const crime = c.strOr("crime", "an old wrong kept quiet");
    return [
      `The truth came out about ${cn}: ${crime}.`,
      `What ${cn} had buried was dug up for all to see: ${crime}.`,
      `A secret gave way${c.place()}, and ${cn} stood exposed. The matter: ${crime}.`,
    ];
  },

  trial: (c) => {
    const accused = c.person("accused", "subject");
    const judge = c.person("judge");
    const an = c.nameOf(accused, "the accused");
    const charge = c.strOr("charge", "grave offenses");
    const verdict = c.str("verdict");
    const before = judge ? ` before ${c.titled("judge")}` : "";
    const end = verdict ? ` The finding: ${verdict}.` : "";
    return [
      `${an} was brought to trial${before} on the charge of ${charge}.${end}`,
      `Judgment was convened${c.place()}: ${an} answered for ${charge}.${end}`,
      `${an} stood in the open${before} and heard the charge read: ${charge}.${end}`,
    ];
  },

  execution: (c) => {
    const p = c.person("condemned", "subject");
    const orderer = c.person("orderedBy", "judge");
    const n = c.nameOf(p, "the condemned");
    const manner = c.str("manner");
    const by = orderer ? ` by order of ${c.titled("orderedBy", c.nameOf(orderer))}` : "";
    const how = manner ? ` The sentence was carried out thus: ${manner}.` : "";
    return [
      `${n} was put to death${by}${c.place()}.${how}`,
      `The law took its full price from ${n}${by}.${how}`,
      `${n} went to execution ${c.when(p)}, and the square was silent after.${how}`,
    ];
  },

  exile: (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "the banished");
    const reason = c.str("reason");
    const why = reason ? ` The reason given: ${reason}.` : "";
    return [
      `${n} was sent into exile, forbidden hearth and gate.${why}`,
      `${n} was shown the border and told not to look back.${why}`,
      `Banishment for ${n}: whatever ${c.pr(p).subj} owned went to others, and the road took the rest.${why}`,
    ];
  },

  "return-from-exile": (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "the exile");
    const pr = c.pr(p);
    return [
      `${n} came back from exile, leaner and quieter than ${pr.subj} left.`,
      `The exile ended: ${n} walked in through the same gate ${pr.subj} was once marched out of.`,
      `After the long years away, ${n} returned${c.place()}, and old neighbors relearned ${pr.poss} face.`,
    ];
  },

  disappearance: (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "one of the townsfolk");
    const lastSeen = c.str("lastSeen");
    const last = lastSeen ? ` The last anyone can swear to: ${lastSeen}.` : "";
    return [
      `${n} vanished${c.place()}, and no search brought back more than guesses.${last}`,
      `One day ${n} was there, and then ${n.split(" ")[0]} was not.${last}`,
      `${n} went missing ${c.when(p)}; the door stood open and the fire was cold.${last}`,
    ];
  },

  "beast-attack": (c) => {
    const p = c.person("subject", "victim");
    const n = c.nameOf(p, "a traveler");
    const beast = c.str("beast") ?? c.str("animal") ?? c.pickFrom(["a wolf grown bold", "a boar", "a bear woken early"], "beast");
    return [
      `${beast[0].toUpperCase() + beast.slice(1)} came out of the treeline at ${n}${c.place()}.`,
      `${n} was set upon by ${beast}, and the marks of it will not be argued with.`,
      `Word went round to bar the byres: ${beast} attacked ${n} near ${c.placeOr("the pastures")}.`,
    ];
  },

  "masterwork-created": (c) => {
    const p = c.person("subject", "creator");
    const n = c.nameOf(p, "an artisan");
    const kind = c.strOr("kind", "maker");
    const plural = kind === "smith" ? "smiths" : `${kind}s`;
    // Titles arrive as proper names ("the Sea-Iron Gate") or as descriptions
    // ("the piece that silenced the doubters"); both splice after a colon.
    const title = c.str("title");
    const named = title ? ` The work is known: ${title}.` : "";
    return [
      `${n} finished a masterwork of the ${kind}'s art and set it where ${c.placeOr("the town")} could see.${named}`,
      `Out of ${n}'s workshop came the piece that other ${plural} will now be measured against.${named}`,
      `${n} made a work so fine that strangers come${c.place()} to look at it.${named}`,
    ];
  },

  "song-composed": (c) => {
    const p = c.person("subject", "bard", "voice", "singer");
    const n = c.nameOf(p, "a voice with no name attached");
    const theme = c.str("theme");
    const form = c.strOr("form", "a song");
    const about = theme ? ` It keeps alive ${lcClause(theme)}.` : "";
    return [
      `${n} made ${form}, and it began traveling from hearth to hearth on its own legs.${about}`,
      `A new song${c.place()}: ${form}, first sung by ${n}.${about}`,
      `${form[0].toUpperCase() + form.slice(1)} was made of the matter, and now the children sing it without knowing what it cost.${about}`,
    ];
  },

  "prophecy-spoken": (c) => {
    const p = c.person("subject", "prophet", "speaker");
    const n = c.nameOf(p, "a stranger at the door");
    const text = c.str("text");
    const concerning = c.ev.participants["concerning"] !== undefined ? c.person("concerning") : null;
    const target = concerning ? ` It concerned ${c.nameOf(concerning)}.` : "";
    const words = text ? ` The words, as remembered: ${text}.` : " The words were written down three ways by three listeners.";
    return [
      `${n} spoke a prophecy${c.place()}, and the room went quiet around it.${words}${target}`,
      `A prophecy from ${n}, delivered in the flat voice such things come in.${words}${target}`,
      `${cap(c.when(p))}, ${n} said aloud what should perhaps have stayed unsaid.${words}${target}`,
    ];
  },

  "curse-pronounced": (c) => {
    const curser = c.person("curser", "subject");
    const target = c.person("target");
    const cn = c.nameOf(curser, "a wronged voice");
    const tn = c.nameOf(target, "the accursed");
    const words = c.str("words");
    const said = words ? ` The words thrown: ${words}.` : "";
    return [
      `${cn} pronounced a curse on ${tn}, in daylight and before witnesses.${said}`,
      `A cursing${c.place()}: ${cn} named ${tn} and wished the wish that cannot be unwished.${said}`,
      `${cn} laid words on ${tn} that the neighbors will now watch for the rest of ${c.pr(target).poss} life.${said}`,
    ];
  },

  vision: (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "a sleeper");
    const what = c.str("what");
    const saw = what ? ` What ${c.pr(p).subj} told of it: ${what}.` : "";
    const sighted = c.bool("sight") ? ` Those who know the family were not surprised; the Sight runs in that blood.` : "";
    return [
      `${n} was taken by a vision${c.place()}, and came out of it changed.${saw}${sighted}`,
      `A vision came to ${n} ${c.when(p)}, unasked and unwelcome.${saw}${sighted}`,
      `${n} saw something that was not there to be seen.${saw}${sighted}`,
    ];
  },

  conversion: (c) => {
    const p = c.person("convert", "subject");
    const n = c.nameOf(p, "one seeker");
    const to = c.num("religion") !== null ? c.world.religions.get(c.num("religion")!) : null;
    const from = c.num("from") !== null ? c.world.religions.get(c.num("from")!) : null;
    const toName = to ? to.name : "a new faith";
    const fromNote = from ? ` The gods of ${from.name} kept their own counsel about it.` : "";
    return [
      `${n} left the old observances and took up ${toName}.${fromNote}`,
      `${n} was received into ${toName} ${c.when(p)}.${fromNote}`,
      `A conversion${c.place()}: ${n} now keeps the rites of ${toName}.${fromNote}`,
    ];
  },

  "pilgrimage-departed": (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "a pilgrim");
    const shrine = c.str("shrine") ?? c.str("destination");
    const to = shrine ? ` toward ${shrine}` : " toward a far shrine";
    return [
      `${n} took the pilgrim's staff and set out${to}.`,
      `${n} left ${c.placeOr("home")} on pilgrimage${to}, affairs settled as if ${c.pr(p).subj} might not return.`,
      `${cap(c.when(p))}, ${n} joined the walkers on the shrine road.`,
    ];
  },

  "pilgrimage-returned": (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "the pilgrim");
    const pr = c.pr(p);
    return [
      `${n} came home from pilgrimage, road-worn and lighter somehow.`,
      `The pilgrim returned: ${n}, with dust of far places on ${pr.poss} boots and little to say of it.`,
      `${n} walked back in through the gate ${c.when(p)}, the vow discharged.`,
    ];
  },

  "founded-settlement": (c) => {
    const p = c.person("founder", "subject");
    const n = c.nameOf(p, "a company of settlers");
    const name = c.str("name") ?? c.settlementNameFromData("settlement", c.placeOr("a new steading"));
    return [
      `${n} drove the first stakes of a new settlement, and named it ${name}.`,
      `Where there had been nothing but ${c.pickFrom(["rough pasture", "birch scrub", "a good spring and bad memories"], "land")}, ${n} founded ${name}.`,
      `A new hearth-smoke on the horizon: ${name}, founded by ${n}.`,
    ];
  },

  "nickname-earned": (c) => {
    const p = c.person("subject");
    const n = p ? p.givenName : "one of the townsfolk";
    const epithet = c.strOr("epithet", "a new name");
    const reason = c.str("reason");
    const why = reason ? ` It was earned thus: ${reason}.` : "";
    return [
      `After that, folk began calling ${n} ${epithet}, and the name stuck fast.${why}`,
      `${n} came out of it with a name: ${epithet}.${why}`,
      `The street rechristened ${n}; from now on the tales say ${epithet}.${why}`,
    ];
  },
};
