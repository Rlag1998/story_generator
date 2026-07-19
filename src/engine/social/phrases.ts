/**
 * Phrase tables for the social module. Everything the chronicle will show
 * comes through event `data` fields; keep the tone concrete, medieval-
 * adjacent, and free of modern words. No em-dashes anywhere.
 */

import type { ProfessionKey } from "../core/types";

/** What a friendship grew out of. */
export const BONDS: string[] = [
  "long evenings by the same hearth",
  "a hard harvest weathered side by side",
  "a shared bench at the alehouse, year upon year",
  "the mending of the same stretch of fence",
  "a winter journey made together and barely survived",
  "matching griefs, quietly understood",
  "an old debt repaid in kindness",
  "two tempers that cool at the same speed",
  "laughter at the same funerals, hidden badly",
  "a night spent hauling the same cart out of the mire",
];

/** Bond flavor when the two share a trade. */
export const TRADE_BONDS: string[] = [
  "the same trade and the same complaints",
  "tools borrowed and returned without counting",
  "long days at the same labor, and the silence that fits it",
];

/** Oath flavor for oath-sworn events. */
export const OATHS: string[] = [
  "an oath of salt and iron",
  "blood mingled over a spearhead",
  "a vow sworn on the boundary stone",
  "an oath sealed with a shared cup, drunk to the dregs",
  "hands joined over cold ashes, as the old rite asks",
  "a promise cut into the doorpost of each house",
];

/** Insults: noun clauses, rendered by the narrative module. */
export const SLIGHTS: string[] = [
  "a jest about borrowed valor, told loud",
  "a toast turned to mockery before the whole board",
  "the word coward, spoken and not withdrawn",
  "a mocking bow in the middle of the market",
  "an old shame dug up and aired at the well",
  "a slighting of the family name, laughed at by strangers",
  "a gift returned unopened, with a message",
  "a place at table given away before witnesses",
];

/** What quarrels are over, when no older grievance names itself. */
export const QUARREL_MATTERS: string[] = [
  "an unpaid debt",
  "a boundary stone moved in the night",
  "a promise remembered two ways",
  "the better claim to a dead man's bench",
  "words said over too much ale",
  "a beast found grazing the wrong field",
  "a bride price called an insult",
  "who kept watch, and who slept",
];

/** Reconciliation gestures. */
export const GESTURES: string[] = [
  "a wrong named aloud and forgiven at the threshold",
  "two stools drawn up to one fire",
  "a handclasp before witnesses",
  "bread broken together at the door",
  "a debt struck from the tally without a word",
  "an apology carried by a child, then said in person",
];

/** Gifts: concrete objects worth the giving. */
export const GIFTS: string[] = [
  "a horn-handled knife",
  "a crock of dark honey",
  "a fox-fur hood against the coming winter",
  "a set of carved bone dice",
  "a woolen belt dyed madder-red",
  "a copper cloak-pin worked like a wren",
  "a cask of last autumn's cider",
  "a whetstone from the far quarries",
  "a pair of good gloves, made to measure",
  "an eel-skin drum for the children",
];

/** How a romance kindled. */
export const SPARKS: string[] = [
  "a dance at the harvest fire",
  "a glance held too long at the well",
  "a song asked for twice, and sung the second time softer",
  "help offered in the rain, and taken",
  "shelter shared under one cloak in a storm",
  "a ribbon bought at the fair and boldly given",
  "a wager lost on purpose",
  "three words spoken at a burial, remembered for years",
];

/** How an affair came to light. */
export const DISCOVERIES: string[] = [
  "a letter left where letters should not be",
  "a servant's tongue loosened by ale",
  "the two seen leaving the hayloft at first light",
  "a gift recognized on the wrong wrist",
  "whispers at the washing stones, finally too loud",
  "a name said in sleep",
  "a neighbor with sharp eyes and a long grudge",
];

/** Lasting marks from a lost duel. */
export const DUEL_SCARS: string[] = [
  "a long scar from brow to jaw",
  "two fingers stiff on the sword hand",
  "a notched ear",
  "a limp from a pierced thigh",
  "a scar across the ribs that aches at every rain",
];

/** Lasting marks from a brawl. */
export const BRAWL_MARKS: string[] = [
  "a nose broken and set crooked",
  "a split lip that healed white",
  "an ear that never sits flat again",
  "a missing front tooth, shown when laughing",
];

/** What two of the same trade contend over. */
export function professionRivalry(profession: ProfessionKey, place: string): string {
  switch (profession) {
    case "smith":
      return `the name of finest smith in ${place}`;
    case "weaver":
      return "whose cloth hangs in the hall of the great";
    case "merchant":
    case "peddler":
      return `the wool trade on market days in ${place}`;
    case "farmer":
      return "water rights along the shared ditch";
    case "herder":
      return "the high pasture and who grazes it first";
    case "fisher":
      return "the best netting grounds below the weir";
    case "hunter":
      return "the right to the old forest runs";
    case "bard":
      return "whose songs are asked for twice";
    case "healer":
    case "midwife":
      return "whose remedies the sick folk trust";
    case "brewer":
    case "innkeeper":
      return `the thirst of ${place}`;
    case "soldier":
    case "guard":
      return "the captain's regard";
    case "scribe":
    case "scholar":
      return "the favor of those who pay for learning";
    case "priest":
    case "monastic":
      return "the ear of the faithful";
    case "mason":
    case "carpenter":
      return "the great commissions and who is called first";
    case "sailor":
      return "the best berth and the captain's trust";
    default:
      return "precedence in their shared craft";
  }
}
