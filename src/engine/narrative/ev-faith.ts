/**
 * Renderers for religion and culture: festivals, omens, heresies, schisms,
 * temples, relics, and claimed miracles.
 */

import type { Religion } from "../core/types";
import type { Cx, EvRenderer } from "./cx";
import { cap, numberWord } from "./text";

function religionFromData(c: Cx, ...keys: string[]): Religion | null {
  for (const k of keys) {
    const id = c.num(k);
    if (id !== null) {
      const r = c.world.religions.get(id);
      if (r) return r;
    }
  }
  return null;
}

export const FAITH_RENDERERS: Record<string, EvRenderer> = {
  festival: (c) => {
    const officiant = c.person("officiant");
    const rel = religionFromData(c, "religion") ?? c.religionOf(officiant);
    const feast = c.str("holyDay") ?? "the feast";
    const theme = c.str("theme");
    const of = theme ? `, kept in honor of ${theme},` : "";
    const led = officiant ? ` ${c.titled("officiant")} led the rite.` : "";
    const faithFolk = rel ? rel.adherentName : "the faithful";
    return [
      `${cap(feast)}${of} was kept${c.place()}, with lamps in the doorways and the year's best on the tables.${led}`,
      `${faithFolk} gathered${c.place()} for ${feast}.${led}`,
      `The calendar turned to ${feast}${of}, and ${c.placeOr("the town")} put down its work for it.${led}`,
    ];
  },

  omen: (c) => {
    const sign = c.strOr("sign", "a sign no two witnesses described the same way");
    const reading = c.str("interpretation");
    const read = reading ? ` The reading given: ${reading}.` : " No two readers agreed on what it meant, which frightened people more.";
    return [
      `An omen${c.place()}: ${sign}.${read}`,
      `Folk marked a sign and lowered their voices: ${sign}.${read}`,
      `The talk of ${c.placeOr("the district")} is an omen: ${sign}.${read}`,
    ];
  },

  "heresy-preached": (c) => {
    const preacher = c.person("preacher", "subject");
    const pn = c.nameOf(preacher, "an unlicensed voice");
    const sermon = c.str("sermon");
    const against = religionFromData(c, "against");
    const target = against ? ` set the teeth of ${against.name} on edge` : " set orthodox teeth on edge";
    const said = sermon ? ` What was preached: ${sermon}.` : "";
    return [
      `${pn} preached in the open${c.place()}, and the preaching${target}.${said}`,
      `Heresy, said the clergy; truth, said a growing knot of listeners. ${pn} spoke again ${c.when(preacher)}.${said}`,
      `${pn} stood on a cart and said what the temple does not permit to be said.${said}`,
    ];
  },

  schism: (c) => {
    const founder = c.person("founder");
    const fn = c.nameOf(founder, "a heresiarch");
    const newFaith = religionFromData(c, "religion");
    const parent = religionFromData(c, "parent");
    const newName = c.str("name") ?? newFaith?.name ?? "a new faith";
    const from = parent ? ` broke from ${parent.name}` : " broke from the old faith";
    const flock = c.num("followers");
    const following = flock !== null && flock > 0 ? ` A following went with ${c.pr(founder).obj}, ${numberWord(flock)} souls at the counting.` : "";
    return [
      `A schism: ${fn}${from} and raised ${newName}.${following}`,
      `The faith split. ${fn} led the departure, and ${newName} now keeps its own altars.${following}`,
      `What began as argument ended as ${newName}: ${fn}${from} for good.${following}`,
    ];
  },

  "temple-built": (c) => {
    const rel = religionFromData(c, "religion");
    const dedication = c.str("dedication");
    const faith = rel ? rel.name : "the faith";
    const to = dedication ? ` It stands dedicated thus: ${dedication}.` : "";
    return [
      `A temple was raised${c.place()} for ${faith}, stone on stone through three building seasons.${to}`,
      `Scaffolding came down${c.place()}: the new temple of ${faith} stands finished.${to}`,
      `${c.placeOr("The town")} consecrated a new temple to ${faith}.${to}`,
    ];
  },

  "relic-found": (c) => {
    const finder = c.person("subject", "finder", "witness");
    const relic = c.str("relic") ?? c.str("description") ?? "a relic of the holy dead";
    const by = finder ? ` It was ${c.nameOf(finder)} who brought it up into the light.` : "";
    return [
      `A relic was found${c.place()}: ${relic}.${by} Pilgrim traffic on the road has already doubled.`,
      `Diggers struck something that stopped the work: ${relic}.${by}`,
      `The temple announced a finding: ${relic}.${by} The skeptical kept their doubts at speaking distance.`,
    ];
  },

  persecution: (c) => {
    const rel = religionFromData(c, "religion", "against");
    const target = c.str("target") ?? (rel ? `the followers of ${rel.name}` : "those who pray differently");
    const reason = c.str("reason");
    const why = reason ? ` The pretext: ${reason}.` : "";
    return [
      `A persecution began${c.place()}: doors marked, meetings broken up, ${target} watching the road at night.${why}`,
      `Zeal turned to iron${c.place()}; ${target} now worship behind barred shutters or not at all.${why}`,
      `The temple and the magistrates moved together against ${target}.${why}`,
    ];
  },

  "miracle-claimed": (c) => {
    const witness = c.person("witness", "subject");
    const tale = c.str("description") ?? c.str("sign") ?? "a wonder small enough to doubt and strange enough not to";
    const deity = c.str("deity");
    const credited = deity ? ` The credit was given to ${deity}.` : "";
    const wn = witness ? ` ${c.titled("witness")} swears to it.` : "";
    return [
      `A miracle is claimed${c.place()}: ${tale}.${wn}${credited}`,
      `By nightfall the whole district had the story: ${tale}.${wn}${credited}`,
      `Something happened${c.place()} that the pious call miracle and the sour call weather: ${tale}.${wn}${credited}`,
    ];
  },
};
