/**
 * Renderers for politics: crowns, claims, plots, wars, titles, and houses.
 */

import type { EvRenderer } from "./cx";
import { joinList } from "./text";

export const POLITICS_RENDERERS: Record<string, EvRenderer> = {
  coronation: (c) => {
    const ruler = c.person("ruler", "subject");
    const rn = c.titled("ruler", c.nameOf(ruler, "a new sovereign"));
    const pol = c.polityFromData("polity");
    const realm = pol?.name ?? "the realm";
    const rite = c.str("rite");
    const riteNote = rite ? ` The rite was performed as custom demands: ${rite}.` : "";
    const lot = c.bool("chosenByLot") ? " The lot fell as the clergy read it, and none dared read it otherwise." : "";
    if (c.bool("usurped")) {
      return [
        `${rn} was crowned in ${realm}, and no one in the hall mistook how the seat had been emptied.${riteNote}`,
        `A crown changed heads in ${realm}: ${rn} took it, and took it is the word the streets use.${riteNote}`,
      ];
    }
    if (c.bool("disputed")) {
      return [
        `${rn} was crowned in ${realm} while half the court weighed the claim behind closed doors.${riteNote}${lot}`,
        `The crown of ${realm} went to ${rn}, though not every knee in the hall bent willingly.${riteNote}${lot}`,
      ];
    }
    return [
      `${rn} was crowned in ${realm} ${c.when(ruler)}.${riteNote}${lot}`,
      `Bells over ${c.placeOr(realm)}: ${rn} took the high seat of ${realm}.${riteNote}${lot}`,
      `The lords and elders of ${realm} gathered to see ${rn} crowned.${riteNote}${lot}`,
    ];
  },

  "succession-crisis": (c) => {
    const pol = c.polityFromData("polity");
    const realm = pol?.name ?? "the realm";
    const reason = c.str("reason");
    const claimants = c.namesFromIds("claimants", 3);
    const who = claimants.length > 0 ? ` The names on every tongue: ${joinList(claimants)}.` : "";
    const why = reason ? ` The heart of it: ${reason}.` : "";
    return [
      `The high seat of ${realm} stands empty, and the realm holds its breath.${why}${who}`,
      `A succession crisis broke open in ${realm}.${why}${who}`,
      `In ${realm} the crown lies on the table with no head to wear it.${why}${who}`,
    ];
  },

  "claim-pressed": (c) => {
    const claimant = c.person("subject", "claimant", "keeper");
    const cn = c.titled("subject", c.nameOf(claimant, "a claimant"));
    const realm = c.polityName("polity");
    return [
      `${cn} pressed a claim to ${realm}, in words too formal to be anything but a threat.`,
      `Heralds carried it to every court: ${cn} claims ${realm}.`,
      `${cn} set out the old genealogies and pressed a claim upon ${realm}.`,
    ];
  },

  "plot-formed": (c) => {
    const plotter = c.person("plotter", "subject");
    const confidant = c.person("confidant", "sworn");
    const pn = c.nameOf(plotter, "certain parties");
    const realm = c.polityName("polity", "the crown");
    const withWhom = confidant ? `, with ${c.nameOf(confidant)} brought into the candlelight of it` : "";
    // Bare truth; the secret frame keeps it dark.
    return [
      `${pn} has begun plotting against ${realm}${withWhom}.`,
      `in a shuttered room, ${pn} started counting friends and sharpening intentions against ${realm}${withWhom}.`,
      `${pn} has set a plot in motion${withWhom}; the target is ${realm}.`,
    ];
  },

  "plot-exposed": (c) => {
    const plotter = c.person("plotter", "subject");
    const pn = c.nameOf(plotter, "the conspirators");
    const realm = c.polityName("polity", "the crown");
    return [
      `The plot came apart: ${pn} stood revealed before ${realm}.`,
      `Someone talked. The design ${pn} had built in the dark was dragged into the light.`,
      `${realm} learned the names of its enemies, ${pn} first among them.`,
    ];
  },

  assassination: (c) => {
    const killer = c.person("killer");
    const target = c.person("target", "victim");
    const tn = c.titled("target", c.nameOf(target, "the fallen"));
    const method = c.str("method");
    const how = method ? ` The manner of it: ${method}.` : "";
    const kn = killer ? c.nameOf(killer) : null;
    const hand = kn ? ` The hand behind it: ${kn}.` : " Whose hand held the blade, the record does not yet say.";
    return [
      `${tn} was assassinated${c.place()}.${how}${hand}`,
      `Murder at the height of power: ${tn} was struck down.${how}${hand}`,
      `They killed ${tn} ${c.when(target)}.${how}${hand}`,
    ];
  },

  coup: (c) => {
    const usurper = c.person("usurper", "plotter");
    const deposed = c.person("deposed", "target");
    const un = c.nameOf(usurper, "armed men with a plan");
    const dn = c.titled("deposed", c.nameOf(deposed, "the old ruler"));
    const realm = c.polityName("polity");
    const manner = c.str("manner");
    const how = manner ? ` The way of it: ${manner}.` : "";
    return [
      `In one night the order of ${realm} was overturned: ${un} seized power and ${dn} was put aside.${how}`,
      `A coup in ${realm}. ${un} took the hall, the seal, and the morning's proclamations.${how}`,
      `${dn} woke to find the guards changed and the doors barred from the wrong side; ${un} now holds ${realm}.${how}`,
    ];
  },

  abdication: (c) => {
    const p = c.person("subject", "ruler");
    const n = c.titled("subject", c.nameOf(p, "the sovereign"));
    const realm = c.polityName("polity");
    const reason = c.str("reason");
    const why = reason ? ` The reason given: ${reason}.` : "";
    return [
      `${n} set down the crown of ${realm} and walked out of the hall a private ${c.pr(p).noun}.${why}`,
      `An abdication in ${realm}: ${n} yielded the seat unforced, which the chroniclers note as the rarer way.${why}`,
      `${n} gave up rule of ${realm} ${c.when(p)}.${why}`,
    ];
  },

  "war-declared": (c) => {
    const atk = c.polityName("attacker", "one realm");
    const def = c.polityName("defender", "its neighbor");
    const casus = c.str("casus");
    const why = casus ? ` The grievance named: ${casus}.` : "";
    return [
      `${atk} declared war upon ${def}, and the smiths on both sides stopped taking plow work.${why}`,
      `Heralds in hard voices: war between ${atk} and ${def}.${why}`,
      `The peace between ${atk} and ${def} was formally broken.${why}`,
    ];
  },

  battle: (c) => battleProse(c, false),
  siege: (c) => battleProse(c, true),

  "peace-made": (c) => {
    const atk = c.polityName("attacker", "one realm");
    const def = c.polityName("defender", "the other");
    const outcome = c.str("outcome");
    const terms =
      outcome === "conquest"
        ? " The terms were a victor's terms."
        : outcome === "white-peace" || outcome === "status-quo"
          ? " Neither side could honestly name itself the winner."
          : outcome
            ? ` The settlement, as the clerks recorded it: ${outcome}.`
            : "";
    return [
      `Peace was made between ${atk} and ${def}, and the border villages slept whole nights again.${terms}`,
      `The war between ${atk} and ${def} was ended with seals and signatures.${terms}`,
      `Envoys did what armies could not: ${atk} and ${def} are at peace.${terms}`,
    ];
  },

  "alliance-formed": (c) => {
    const ids = c.ev.data["polities"];
    const names: string[] = [];
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === "number") {
          const pol = c.world.polities.get(id);
          if (pol) names.push(pol.name);
        }
      }
    }
    const pair = names.length >= 2 ? `${names[0]} and ${names[1]}` : "two realms";
    return [
      `${pair} bound themselves in alliance, each now obliged to the other's quarrels.`,
      `An alliance was sworn between ${pair}, sealed with feasts and careful wording.`,
      `The courts of ${pair} exchanged oaths and hostages of honor; they stand together now.`,
    ];
  },

  "title-granted": (c) => {
    const p = c.person("subject", "heir");
    const granter = c.person("granter");
    const n = c.nameOf(p, "a rising name");
    const title = c.strOr("title", "a new dignity");
    const passage = c.str("passage");
    const reason = c.str("reason");
    const byWhom = granter ? ` from the hand of ${c.titled("granter")}` : "";
    const note = passage ? ` As the custom runs: ${passage}.` : reason ? ` The grant was made ${reason.startsWith("for") ? reason : `for ${reason}`}.` : "";
    return [
      `${n} was raised up${byWhom}: ${title}.${note}`,
      `A new dignity for ${n}, who now holds the style ${title}.${note}`,
      `${n} took up the title of ${title} ${c.when(p)}.${note}`,
    ];
  },

  "title-revoked": (c) => {
    const p = c.person("subject");
    const n = c.nameOf(p, "the disgraced");
    const title = c.strOr("title", "the dignity");
    const reason = c.str("reason");
    const why = reason ? ` The stated cause: ${reason}.` : "";
    return [
      `${n} was stripped of ${title}, and the heralds struck the style from their rolls.${why}`,
      `The title of ${title} was taken back from ${n}.${why}`,
      `${n} lost ${title} as publicly as it was once granted.${why}`,
    ];
  },

  "house-founded": (c) => {
    const founder = c.person("founder", "subject");
    const fn = c.nameOf(founder, "an ambitious line");
    const name = c.str("houseName") ?? c.houseName("house", "a new house");
    const motto = c.str("motto");
    const words = motto ? ` Its words: ${motto}.` : "";
    return [
      `${fn} raised a banner and founded ${name}.${words}`,
      `A new house entered the rolls: ${name}, founded by ${fn}.${words}`,
      `${fn} gave the family a name to keep: ${name}.${words}`,
    ];
  },

  "house-cadet-founded": (c) => {
    const founder = c.person("founder", "subject");
    const fn = c.nameOf(founder, "a younger son");
    const name = c.str("houseName") ?? c.houseName("house", "a cadet house");
    const parentName = c.str("parentName") ?? c.houseName("parent", "the elder line");
    const seat = c.str("seatName");
    const at = seat ? `, seated at ${seat}` : "";
    return [
      `A cadet branch budded from ${parentName}: ${fn} founded ${name}${at}.`,
      `${fn} took a portion, a banner of difference, and a new name: ${name}, sprung from ${parentName}${at}.`,
      `The tree of ${parentName} put out a new limb, ${name}${at}.`,
    ];
  },

  "house-extinct": (c) => {
    const name = c.str("houseName") ?? c.houseName("house", "an old house");
    const motto = c.str("motto");
    const words = motto ? ` Its words were: ${motto}.` : "";
    return [
      `${name} is ended; the last of that blood is gone, and the banner comes down for good.${words}`,
      `The rolls close on ${name}. No heir, no cadet, no one left to carry the name.${words}`,
      `An extinction quietly recorded: ${name} has passed out of the world.${words}`,
    ];
  },

  "feud-began": (c) => {
    const [ha, hb] = feudHouses(c);
    const slight = c.str("slight");
    const spark = slight ? ` It began, as these things do, with something small: ${slight}.` : "";
    return [
      `A feud kindled between ${ha} and ${hb}, and the two kitchens stopped borrowing salt.${spark}`,
      `${ha} and ${hb} are at feud. Children of each are now taught the other's faces.${spark}`,
      `Bad blood between ${ha} and ${hb} hardened into open feud.${spark}`,
    ];
  },

  "feud-ended": (c) => {
    const [ha, hb] = feudHouses(c);
    const manner = c.str("manner");
    const how = manner ? ` The way of the mending: ${manner}.` : "";
    return [
      `The feud between ${ha} and ${hb} was laid to rest.${how}`,
      `${ha} and ${hb} buried the old quarrel, and both sides pretended it had always been the other's fault.${how}`,
      `Peace, of a wary kind, between ${ha} and ${hb}.${how}`,
    ];
  },
};

/** Names of the two feuding houses from data.houses ids. */
function feudHouses(c: Parameters<EvRenderer>[0]): [string, string] {
  const ids = c.ev.data["houses"];
  const names: string[] = [];
  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (typeof id === "number") {
        const h = c.world.houses.get(id);
        if (h) names.push(h.name);
      }
    }
  }
  return [names[0] ?? "one house", names[1] ?? "another"];
}

function battleProse(c: Parameters<EvRenderer>[0], siege: boolean): string[] {
  const name = c.strOr("name", siege ? `the siege at ${c.placeOr("the walls")}` : `the battle at ${c.placeOr("the field")}`);
  const atkPol = c.polityFromData("attacker");
  const defPol = c.polityFromData("defender");
  const atk = atkPol?.name ?? "the attackers";
  const def = defPol?.name ?? "the defenders";
  const outcome = c.str("outcome");
  const fallenNames = c.namesFromIds("fallen", 3);
  const fallenCount = c.idList("fallen").length;
  let result: string;
  if (outcome === "attacker") result = ` The day went to ${atk}.`;
  else if (outcome === "defender") result = ` ${def} held, and the field was theirs at dusk.`;
  else result = " Night parted them with nothing settled and much spent.";
  let dead = "";
  if (fallenNames.length > 0) {
    const more = fallenCount > fallenNames.length ? ", among others" : "";
    dead = ` Among the fallen: ${joinList(fallenNames)}${more}.`;
  }
  if (siege) {
    return [
      `${cap1(name)}: ${atk} sat down before the walls and ${def} looked out over them.${result}${dead}`,
      `The ${lc1(name)} ground on through hunger and mining and waiting.${result}${dead}`,
      `${atk} pressed the ${lc1(name)} against ${def}.${result}${dead}`,
    ];
  }
  return [
    `The hosts of ${atk} and ${def} met in the ${lc1(name)}.${result}${dead}`,
    `${cap1(name)} was joined ${c.when(null)}, shield-walls closing in the old ugly way.${result}${dead}`,
    `Steel decided what words had not: the ${lc1(name)}, ${atk} against ${def}.${result}${dead}`,
  ];
}

function cap1(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Lowercase a leading "Battle of"/"Siege of" for mid-sentence splicing. */
function lc1(s: string): string {
  if (/^(Battle|Siege|The)\b/.test(s)) return s[0].toLowerCase() + s.slice(1);
  return s;
}
