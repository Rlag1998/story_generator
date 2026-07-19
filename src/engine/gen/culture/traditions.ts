/**
 * Tradition template library.
 *
 * Each template knows its category, the stable hook tags event systems
 * consult ("funeral", "coming-of-age", "wedding", "birth", "twins", "duel",
 * "oath", "feast", "mourning", "hospitality", "the-sight"), an affinity
 * function that biases selection toward fitting cultures, and name and
 * description renderers that weave native words coined from the culture's
 * own tongue into the flavor.
 *
 * A culture gets one tradition per category, 4 to 7 in all, always covering
 * funeral, coming-of-age and marriage. Derived cultures keep most of their
 * parent's traditions but re-voice the names in their drifted language.
 */

import type { Rng } from "../../core/rng";
import type { CultureValue, Language, Tradition } from "../../core/types";
import { nativeWord } from "./namegen";
import type { Attitudes } from "./values";

/** The stable hook tags the wider engine consults. */
export const TRADITION_HOOKS = [
  "funeral",
  "coming-of-age",
  "wedding",
  "birth",
  "twins",
  "duel",
  "oath",
  "feast",
  "mourning",
  "hospitality",
  "the-sight",
] as const;

/** Extra hooks used within the culture module's own vocabulary. */
export const EXTRA_HOOKS = ["naming", "taboo"] as const;

export type TraditionCategory =
  | "funeral"
  | "coming-of-age"
  | "naming"
  | "marriage"
  | "feast"
  | "hospitality"
  | "duel"
  | "mourning"
  | "taboo"
  | "oath"
  | "birth"
  | "twins"
  | "the-sight";

/** Rendering context handed to name/description templates. */
export interface Flavor {
  /** Capitalized native word for a concept (cached per culture). */
  w: (concept: string) => string;
  demonym: string;
  /** Indefinite article helpers: `a("Erenori")` -> "an Erenori". */
  a: (word: string) => string;
  A: (word: string) => string;
}

export interface TraditionTemplate {
  key: string;
  category: TraditionCategory;
  hooks: string[];
  affinity: (values: readonly CultureValue[], att: Attitudes) => number;
  name: (f: Flavor) => string;
  description: (f: Flavor) => string;
}

function has(values: readonly CultureValue[], v: CultureValue): number {
  return values.includes(v) ? 1 : 0;
}

export const TRADITION_TEMPLATES: TraditionTemplate[] = [
  // ------------------------------------------------------------- funeral --
  {
    key: "sky-burial",
    category: "funeral",
    hooks: ["funeral"],
    affinity: (v, a) => 0.8 + has(v, "stoicism") + has(v, "austerity") * 0.6 + a.mysticism,
    name: (f) => `The Silence of ${f.w("sky")}`,
    description: (f) =>
      `The dead are carried above the treeline and laid out on open stone for the birds of the high air. No ${f.demonym} grave is dug where the sky can reach, for flesh belongs to the wind and only the name is kept. The carrion birds are called ${f.w("sky")}-wings, and it is bitter luck to drive one from its meal.`,
  },
  {
    key: "sea-giving",
    category: "funeral",
    hooks: ["funeral"],
    affinity: (v, a) => 0.5 + has(v, "seafaring") * 2.5 + has(v, "trade") * 0.5 + a.mysticism * 0.5,
    name: (f) => `The Giving to ${f.w("sea")}`,
    description: (f) =>
      `The dead are burned on the shore at slack tide and their ashes rowed out past the last skerry, where the eldest kinswoman opens the urn against the wind. What the water takes, the water keeps, and a drowned soul of the ${f.demonym} is said to be halfway home already. Widows salt the doorstep so the dead do not wade back.`,
  },
  {
    key: "barrow-rest",
    category: "funeral",
    hooks: ["funeral"],
    affinity: (v) => 0.8 + has(v, "kinship") * 1.5 + has(v, "honor") + has(v, "conquest") * 0.5,
    name: (f) => `The Sleep of ${f.w("earth")}`,
    description: (f) =>
      `Each house raises its own barrow, and the dead go under the turf with a cup, a knife, and a word for the ones gone before. To be barred from the family mound is the worst end ${f.a(f.demonym)} can imagine, worse than the death itself. Oaths sworn upon a barrow stone bind the swearer's whole line.`,
  },
  {
    key: "pyre-vigil",
    category: "funeral",
    hooks: ["funeral", "feast"],
    affinity: (v, a) => 0.7 + has(v, "revelry") * 1.5 + has(v, "piety") + a.mysticism * 0.5,
    name: (f) => `The ${f.w("fire")} Vigil`,
    description: (f) =>
      `The dead burn at nightfall on a pyre built by their own kin, and the living must sing until the last ember dies, for silence would let the soul look back. The songs begin as laments and end, by custom and by drink, as the dead one's favorite jests. Ash from the pyre is kneaded into the hearth-clay of the heirs.`,
  },
  {
    key: "quiet-earth",
    category: "funeral",
    hooks: ["funeral", "mourning"],
    affinity: (v) => 0.6 + has(v, "austerity") * 2 + has(v, "stoicism") + has(v, "piety") * 0.5,
    name: (f) => `${f.w("night")}'s Rest`,
    description: (f) =>
      `The dead are buried in an unmarked field with neither stone nor stave, for pride should not follow a soul into the dark. Once a year, on the first night of winter, each family walks the field and speaks its dead names once, quietly, to the grass. ${f.A(f.demonym)} who boasts of ancestors is asked which field grows them.`,
  },
  // ------------------------------------------------------- coming-of-age --
  {
    key: "night-on-the-fell",
    category: "coming-of-age",
    hooks: ["coming-of-age"],
    affinity: (v, a) => 0.8 + has(v, "stoicism") * 1.5 + has(v, "austerity") + a.mysticism * 0.5,
    name: (f) => `The Long Watch of ${f.w("wind")}`,
    description: (f) =>
      `On the first new moon after their coming year, a child is walked to the high fell at dusk and left with a cloak, a flint, and no fire-wood. They must sit the night alone and bring back one true thing they heard in the dark. What they tell the elders at dawn is never repeated, but it is weighed, and some ${f.demonym} are reckoned grown at sunrise and some are sent up again next moon.`,
  },
  {
    key: "first-spear-hunt",
    category: "coming-of-age",
    hooks: ["coming-of-age"],
    affinity: (v, a) => 0.6 + has(v, "conquest") * 1.5 + has(v, "honor") + a.violence * 1.2,
    name: (f) => `The First ${f.w("spear")}`,
    description: (f) =>
      `No one is grown until they have carried a spear against something that could kill them, boar or wolf or stag in rut, with the older hunters sworn to watch and not to help. The kill is shared out to the widows of the village and the new adult keeps only the beast's heart, eaten by the fire that night. A missed cast is no shame; running is.`,
  },
  {
    key: "salt-crossing",
    category: "coming-of-age",
    hooks: ["coming-of-age"],
    affinity: (v) => 0.4 + has(v, "seafaring") * 2.5 + has(v, "trade") * 0.5,
    name: (f) => `The ${f.w("salt")} Crossing`,
    description: (f) =>
      `A child becomes grown the day they take a boat alone beyond sight of land and come back with the stern line still coiled, which is to say, without panic. Mothers watch from the headland and are forbidden to light the guide-fire before dark. The first thing the returned one drinks is seawater, one swallow, so the body remembers who owns it.`,
  },
  {
    key: "masters-token",
    category: "coming-of-age",
    hooks: ["coming-of-age"],
    affinity: (v) => 0.5 + has(v, "craftsmanship") * 2.2 + has(v, "artistry") + has(v, "learning") * 0.5,
    name: (f) => `${f.w("craft")}'s Proof`,
    description: (f) =>
      `Adulthood is not a year but a thing: each child must make one work of their hands fine enough that a master will set their own mark beside it. The proof-piece hangs in the family house until the maker dies, when it is given away to a stranger. ${f.A(f.demonym)} who asks another's age will be told, instead, what they made.`,
  },
  {
    key: "hundred-names",
    category: "coming-of-age",
    hooks: ["coming-of-age"],
    affinity: (v) => 0.5 + has(v, "kinship") * 1.8 + has(v, "learning") * 1.2 + has(v, "honor") * 0.5,
    name: (f) => `The Reckoning of ${f.w("blood")}`,
    description: (f) =>
      `Before the assembled kin, the child must recite the line of their ancestors, name by name and deed by deed, back past the grandmothers' grandmothers until an elder raises a hand. To stumble is forgivable once. The recitation ends with the child's own name spoken aloud, added to the chain, and from that hour they may speak at the fire like anyone grown.`,
  },
  // -------------------------------------------------------------- naming --
  {
    key: "ninth-night-name",
    category: "naming",
    hooks: ["birth", "naming"],
    affinity: (v, a) => 0.6 + a.mysticism * 2 + has(v, "piety") * 0.5,
    name: (f) => `The Ninth Night of ${f.w("moon")}`,
    description: (f) =>
      `A newborn goes nine nights without a name, called only "the guest," so that any ill spirit hunting a name to steal will find nothing to grip. On the ninth night the child is named in a whisper, mouth to ear, before the name is ever said aloud. ${f.demonym} reckon a child who dies unnamed was never truly here, which is a mercy the mothers hold onto.`,
  },
  {
    key: "water-name",
    category: "naming",
    hooks: ["birth", "naming"],
    affinity: (v, a) => 0.7 + has(v, "seafaring") + has(v, "piety") * 0.6 + a.mysticism * 0.5,
    name: (f) => `The ${f.w("river")} Naming`,
    description: (f) =>
      `At the first dawn after the birth, the father or nearest kin carries the child to running water and speaks the name over the current, so the water carries it to everyone downstream and no one can claim they were not told. A name given over still water is weak and must be given again. Children named in flood-season are held to be stubborn.`,
  },
  {
    key: "hearth-name",
    category: "naming",
    hooks: ["birth", "naming"],
    affinity: (v) => 0.6 + has(v, "kinship") * 2 + has(v, "piety") * 0.5 + has(v, "stoicism") * 0.3,
    name: (f) => `The ${f.w("hearth")} Naming`,
    description: (f) =>
      `The naming belongs not to the parents but to the eldest of the house, who takes the child to the hearth and studies the fire before speaking. More often than not the old one hands down a dead kinsman's name, for ${f.demonym} hold that a name grows richer each life it is worn through. To refuse the hearth-name is to refuse the house.`,
  },
  // ------------------------------------------------------------ marriage --
  {
    key: "bride-ransom-of-song",
    category: "marriage",
    hooks: ["wedding"],
    affinity: (v) => 0.6 + has(v, "revelry") * 2 + has(v, "artistry") + has(v, "hospitality") * 0.5,
    name: (f) => `The ${f.w("song")} Ransom`,
    description: (f) =>
      `On the wedding morning the bride's kin bar the door and will not open it for silver, only for song. The groom's party must sing verse against the door-wards, trading praise and insult, until the house judges itself out-sung and lets them in laughing. A groom with no voice hires one, and everyone pretends not to notice.`,
  },
  {
    key: "handfast-elder",
    category: "marriage",
    hooks: ["wedding"],
    affinity: (v, a) => 0.8 + has(v, "revelry") * 0.5 + has(v, "kinship") * 0.5 + (1 - a.patriarchy),
    name: (f) => `The Handfast of ${f.w("tree")}`,
    description: (f) =>
      `Couples are wed beneath the oldest tree the district owns, wrists bound with a woven cord that both households braided together. The knot is kept above the marriage bed and must be retied at the same tree each year; a knot left slack is a quiet message every ${f.demonym} neighbor can read. Cutting the cord, either of them, ends the marriage without another word needed.`,
  },
  {
    key: "salt-and-bread-troth",
    category: "marriage",
    hooks: ["wedding", "hospitality"],
    affinity: (v) => 0.7 + has(v, "hospitality") * 1.5 + has(v, "trade") + has(v, "kinship") * 0.5,
    name: (f) => `The ${f.w("salt")} Troth`,
    description: (f) =>
      `Before witnesses the couple exchange bread and salt: bread so neither hungers, salt so neither grows dull to the other. Each eats from the other's hand, which is the only vow spoken, for ${f.demonym} hold that feeding someone is a promise no words improve. The salt dishes become house-treasures and pass to the eldest child.`,
  },
  {
    key: "blade-and-cup",
    category: "marriage",
    hooks: ["wedding", "oath"],
    affinity: (v, a) => 0.5 + has(v, "honor") * 1.5 + has(v, "conquest") + a.violence,
    name: (f) => `The Cup of ${f.w("iron")}`,
    description: (f) =>
      `At the wedding feast a bare blade is laid across the shared cup, and bride and groom must each drink without moving it, eyes open, blood-side up. It is a plain lesson: love with the edge in view. The blade then hangs over the door, and taking it down is a thing only done once.`,
  },
  // --------------------------------------------------------------- feast --
  {
    key: "first-fruits-feast",
    category: "feast",
    hooks: ["feast"],
    affinity: (v) => 0.9 + has(v, "piety") + has(v, "kinship") * 0.6 + has(v, "hospitality") * 0.6,
    name: (f) => `The Feast of ${f.w("harvest")}`,
    description: (f) =>
      `The first sheaf cut, the first fish of the run, the first cheese of the summer pens: none of it may be sold and none kept. It goes by right to the oldest mouth and the poorest door in the village, in that order, carried by children so both giving hands stay clean of pride. Only then does the season's trade begin.`,
  },
  {
    key: "ember-nights",
    category: "feast",
    hooks: ["feast"],
    affinity: (v) => 0.8 + has(v, "piety") * 0.7 + has(v, "stoicism") * 0.6 + has(v, "kinship") * 0.5,
    name: (f) => `The ${f.w("ember")} Nights`,
    description: (f) =>
      `At midwinter, fires are built on every height and fed for three nights against the year's long dark. Debts called in during the Ember Nights are void, and a quarrel carried past the third fire must be either settled or sworn, for the new year will not carry old rot. The last night ends with every hearth relit from the hill-flame.`,
  },
  {
    key: "feast-of-masks",
    category: "feast",
    hooks: ["feast"],
    affinity: (v, a) => 0.5 + has(v, "revelry") * 2 + has(v, "artistry") + (1 - a.patriarchy) * 0.5,
    name: (f) => `The Feast of ${f.w("mask")}`,
    description: (f) =>
      `For one day at the turn of spring, every ${f.demonym} goes masked and no rank holds: the smith may judge, the judge may beg, and what is said behind bark and feathers cannot be answered for afterward. Marriages have begun and ended at it. The masks burn at midnight, and with them, by law, the day itself.`,
  },
  // --------------------------------------------------------- hospitality --
  {
    key: "three-nights-grace",
    category: "hospitality",
    hooks: ["hospitality"],
    affinity: (v, a) => 0.8 + has(v, "hospitality") * 2 + a.openness,
    name: (f) => `The Three Nights of ${f.w("guest")}`,
    description: (f) =>
      `Any traveler who asks the roof has it for three nights, fed and warmed, and neither host nor guest may ask the other's business until the second meal is done. Guest and host are sacred to each other for a year and a day after the parting. To harm someone under your smoke is the one crime ${f.demonym} elders will not hear argued.`,
  },
  {
    key: "salt-bond",
    category: "hospitality",
    hooks: ["hospitality", "oath"],
    affinity: (v) => 0.7 + has(v, "hospitality") * 1.2 + has(v, "honor") + has(v, "kinship") * 0.5,
    name: (f) => `The Bond of ${f.w("salt")}`,
    description: (f) =>
      `Who has shared your salt is safe from your knife, and you from theirs, until the salt is formally returned. Feuding houses have been known to eat unsalted for a season rather than owe each other peace. A pinch of salt refused at table is a declaration everyone present is required to remember.`,
  },
  {
    key: "winter-door",
    category: "hospitality",
    hooks: ["hospitality"],
    affinity: (v) => 0.6 + has(v, "hospitality") + has(v, "kinship") * 0.8 + has(v, "stoicism") * 0.5,
    name: (f) => `The Open Door of ${f.w("winter")}`,
    description: (f) =>
      `From first snow to last thaw no door may be barred to a traveler while light shows through its cracks, for the cold kills quicker than thieves do. The guest sleeps nearest the fire and leaves before the household wakes if they cannot pay, which is not shame but custom. Houses that broke the winter-door are remembered by name in ${f.demonym} cradle songs, none of them kindly.`,
  },
  // ---------------------------------------------------------------- duel --
  {
    key: "plank-duel",
    category: "duel",
    hooks: ["duel"],
    affinity: (v, a) => 0.4 + has(v, "honor") + has(v, "seafaring") + a.violence,
    name: (f) => `First Blood upon ${f.w("bridge")}`,
    description: (f) =>
      `Quarrels of honor are settled on a plank over running water, knives only, first blood or first fall. The water carries off the anger with the blood, and what the river has judged may never be raised again, in law or in drink. Seconds stand on the banks with boat-hooks, for drowning a man over an insult is considered excessive.`,
  },
  {
    key: "staked-ring",
    category: "duel",
    hooks: ["duel", "oath"],
    affinity: (v, a) => 0.4 + has(v, "honor") * 1.2 + has(v, "conquest") + a.violence * 1.5,
    name: (f) => `The Hazel Ring of ${f.w("war")}`,
    description: (f) =>
      `A challenge lawfully given is fought in a ring staked out with hazel wands, three shields allowed to each, before witnesses sworn to silence until it ends. Stepping outside the wands is yielding; striking a man outside them is murder. The winner takes the quarrel's stake, and the ring is unstaked before sundown so the ground can forget.`,
  },
  {
    key: "flyting-court",
    category: "duel",
    hooks: ["duel", "feast"],
    affinity: (v, a) => 0.5 + has(v, "revelry") * 1.5 + has(v, "learning") + (1 - a.violence) * 1.2,
    name: (f) => `The ${f.w("verse")} Court`,
    description: (f) =>
      `Among ${f.demonym}, insult answers insult in verse, before the assembly, with the crowd's laughter for a verdict. The loser buys the hall's drink and may not repeat the quarrel; the winner may not repeat the winning verses, which everyone else will do for the rest of their lives. Steel drawn over words is reckoned a confession of having none.`,
  },
  // ------------------------------------------------------------ mourning --
  {
    key: "grey-year",
    category: "mourning",
    hooks: ["mourning"],
    affinity: (v) => 0.8 + has(v, "stoicism") + has(v, "austerity") + has(v, "kinship") * 0.5,
    name: (f) => `The Grey Year of ${f.w("grief")}`,
    description: (f) =>
      `The widowed wear undyed wool for a year and a day, and none may court them, press debts on them, or ask more of them than the season demands. Grey is armor here, not weakness. On the last morning the grey cloak is given to the next mourner in the parish or, in a kind year, folded away unworn by anyone.`,
  },
  {
    key: "keening",
    category: "mourning",
    hooks: ["mourning", "funeral"],
    affinity: (v, a) => 0.6 + has(v, "revelry") * 0.7 + has(v, "artistry") + a.mysticism * 0.8,
    name: (f) => `The ${f.w("grief")} Keening`,
    description: (f) =>
      `Grief is not swallowed but sung: keening women follow the bier, praising the dead and scolding death itself in the old falling scale. A well-keened funeral is talked of for years, and the great keeners are paid in land. ${f.demonym} say a soul unwept cannot find the road, so even a miser's funeral is loud.`,
  },
  {
    key: "unspoken-month",
    category: "mourning",
    hooks: ["mourning"],
    affinity: (v, a) => 0.7 + has(v, "stoicism") * 0.8 + has(v, "piety") * 0.6 + a.mysticism * 0.6,
    name: (f) => `The Silent Moon of ${f.w("dead")}`,
    description: (f) =>
      `For one turn of the moon after a death, the dead one's name is not spoken, so the soul is not called back along the sound of it to a house it must learn to leave. Kin speak of "the traveler" and the household eats one empty place. When the moon comes round, the family holds the Feast of Remembering, and the name is said by everyone at once, like a door opened.`,
  },
  // --------------------------------------------------------------- taboo --
  {
    key: "eel-taboo",
    category: "taboo",
    hooks: ["feast", "hospitality", "taboo"],
    affinity: (v, a) => 0.3 + has(v, "seafaring") * 1.5 + a.mysticism * 1.5,
    name: (f) => `The Ban of ${f.w("eel")}`,
    description: (f) =>
      `Eels wear the souls of the drowned, working their way back up the rivers toward the houses they were born in, and no ${f.demonym} will eat one, sell one, or cut one from a net with anything but apology. Serving eel to a guest is either deadly ignorance or a very pointed message. Eel-fat lamps are likewise refused; nobody wants to read by the drowned.`,
  },
  {
    key: "horse-taboo",
    category: "taboo",
    hooks: ["feast", "hospitality", "taboo"],
    affinity: (v) => 0.4 + has(v, "conquest") * 0.8 + has(v, "kinship") * 0.8 + has(v, "honor") * 0.6,
    name: (f) => `The Ban of ${f.w("horse")}`,
    description: (f) =>
      `The horse is kin, not meat: it carried the first ${f.demonym} out of whatever the old songs say was behind them, and the debt is not paid off yet. Horseflesh is not eaten even in famine, and a horse too old to work is pensioned on the household like a grandparent. Selling a horse to a people known to eat them wants a purification after.`,
  },
  {
    key: "raven-taboo",
    category: "taboo",
    hooks: ["feast", "taboo", "the-sight"],
    affinity: (v, a) => 0.3 + a.mysticism * 2 + has(v, "piety") * 0.5,
    name: (f) => `The Ban of ${f.w("raven")}`,
    description: (f) =>
      `The black birds carry word between the living and the dead, and are never harmed, never eaten, never driven from a roof-tree, whatever they take. A raven feeding at your door is an ancestor visiting; count what it eats and be flattered. Only the Sighted may say aloud what a raven's call meant, and they charge.`,
  },
  // ---------------------------------------------------------------- oath --
  {
    key: "iron-oath",
    category: "oath",
    hooks: ["oath"],
    affinity: (v) => 0.8 + has(v, "honor") * 1.5 + has(v, "craftsmanship") * 0.6 + has(v, "vengeance") * 0.5,
    name: (f) => `The Oath on ${f.w("iron")}`,
    description: (f) =>
      `A binding oath is sworn with a bare hand on cold iron, blade or anvil or plow-share, and the iron remembers what the tongue said. Oath-breakers rust: their luck flakes off them year by year, or so every ${f.demonym} child is told, and enough grown folk believe it that the custom polices itself. Great oaths are sworn on a smith's anvil with the smith as witness, and a smith's memory is long.`,
  },
  {
    key: "ring-oath",
    category: "oath",
    hooks: ["oath"],
    affinity: (v) => 0.7 + has(v, "kinship") + has(v, "honor") + has(v, "conquest") * 0.5,
    name: (f) => `The Oath of the ${f.w("ring")}`,
    description: (f) =>
      `Every chief keeps an arm-ring, worn smooth by generations of sworn hands, and no oath counts in law until it is spoken with fingers closed around that ring. The ring holds every promise ever made on it, which is why an old ring outranks a gold one. When a chief dies the ring passes with the seat, oaths and all.`,
  },
  {
    key: "river-oath",
    category: "oath",
    hooks: ["oath"],
    affinity: (v, a) => 0.6 + has(v, "seafaring") + has(v, "trade") * 0.6 + a.mysticism,
    name: (f) => `The Oath of Running ${f.w("water")}`,
    description: (f) =>
      `Oaths are sworn with both hands wrist-deep in running water, which carries every word down to the sea where nothing is forgotten. A lie sworn wet is said to return in flood or fog to collect. Merchants of other peoples have learned to ask ${f.a(f.demonym)} partner, politely, whether a bargain was sworn dry or wet.`,
  },
  // --------------------------------------------------------------- birth --
  {
    key: "caul-blessing",
    category: "birth",
    hooks: ["birth"],
    affinity: (v, a) => 0.6 + a.mysticism * 1.8 + has(v, "seafaring") * 0.8,
    name: (f) => `The Veil of ${f.w("luck")}`,
    description: (f) =>
      `A child born in the caul is born lucky, half a step out of the world's reach: no ${f.demonym} caul-child has ever drowned, the midwives insist, and nobody keeps count of exceptions. The caul itself is dried and stitched into a charm, kept by the mother until the child is grown and then worn or sold at a staggering price to sailors. Selling your own caul is thought to sell the luck with it, so the desperate do.`,
  },
  {
    key: "iron-in-the-cradle",
    category: "birth",
    hooks: ["birth"],
    affinity: (v, a) => 0.7 + a.mysticism * 1.2 + has(v, "craftsmanship") * 0.8 + has(v, "kinship") * 0.4,
    name: (f) => `${f.w("iron")} in the Cradle`,
    description: (f) =>
      `Before a newborn sleeps its first night, the father lays cold iron in the cradle, a knife for a boy, shears for a girl, or whichever the child grips first where custom has loosened. Iron under the pillow keeps the child from being carried off or quietly exchanged by whatever does such things. The cradle-iron is kept all their life and buried with them, its work finally done.`,
  },
  {
    key: "dawn-showing",
    category: "birth",
    hooks: ["birth"],
    affinity: (v) => 0.7 + has(v, "piety") + has(v, "hospitality") * 0.6 + has(v, "kinship") * 0.6,
    name: (f) => `The Showing at ${f.w("dawn")}`,
    description: (f) =>
      `On the first clear morning after a birth, the mother carries the child over the threshold and holds it up to the rising sun, so the day itself stands witness that this one is here now and expected to be counted. Neighbors bring a spoonful of their own hearth-ash to mix into the new family's fire. After the Showing, and not before, the child may be spoken of by ${f.demonym} outside the house.`,
  },
  // --------------------------------------------------------------- twins --
  {
    key: "twins-two-flames",
    category: "twins",
    hooks: ["twins", "birth"],
    affinity: (v) => 0.8 + has(v, "revelry") * 0.6 + has(v, "hospitality") * 0.5 + has(v, "kinship") * 0.5,
    name: (f) => `The Two Flames of ${f.w("fire")}`,
    description: (f) =>
      `Twins are a doubled blessing, one fire lit from another, and a house that bears them is owed a year of small favors by the whole village. They are named in one breath with names that share a first sound, so that calling one always half-calls the other. ${f.A(f.demonym)} bargain witnessed by twins is thought to be twice as hard to break.`,
  },
  {
    key: "twins-one-soul",
    category: "twins",
    hooks: ["twins", "birth"],
    affinity: (v, a) => 0.5 + a.mysticism * 1.5 + has(v, "austerity") * 0.6 + has(v, "stoicism") * 0.4,
    name: (f) => `The Halved ${f.w("soul")}`,
    description: (f) =>
      `Twins are one soul dealt into two bodies, and the world is uneasy about the arithmetic. They are watched closely, never dressed alike, and never left alone together on a threshold, at a well, or at a grave, the three places where a soul might try to reunite itself. When one twin dies the other goes veiled for a year, being, as ${f.demonym} say it, half in mourning for themselves.`,
  },
  {
    key: "twins-oracle",
    category: "twins",
    hooks: ["twins", "birth", "the-sight"],
    affinity: (v, a) => 0.4 + a.mysticism * 2 + has(v, "piety") * 0.6,
    name: (f) => `The Twin Tongues of ${f.w("dream")}`,
    description: (f) =>
      `What one twin dreams, the other can read: set them back to back at the fire and ask, and between them the answer comes out sideways, in halves that the asker must join. Twins are brought disputes, lost things, and the naming of hard winters. They are given rhyming names so that the two halves of an answer can be told apart in the retelling.`,
  },
  // ----------------------------------------------------------- the-sight --
  {
    key: "sight-temple-given",
    category: "the-sight",
    hooks: ["the-sight", "birth"],
    affinity: (v, a) => 0.4 + has(v, "piety") * 1.8 + a.mysticism,
    name: (f) => `The Given of ${f.w("vision")}`,
    description: (f) =>
      `A child who dreams true is not the family's to keep: the Sight is a tithe, and such children are brought to the temple with honor, a new name, and a white garment their mother weaves herself. Their birth-house eats free at every festival thereafter, which softens most partings. A family that hides a Sighted child and is found out owes the temple that child's weight in candle-wax, every year, forever.`,
  },
  {
    key: "sight-bell-marked",
    category: "the-sight",
    hooks: ["the-sight"],
    affinity: (v, a) => 0.4 + a.mysticism * 0.8 + has(v, "austerity") * 0.8 + (1 - a.openness),
    name: (f) => `The Belled of ${f.w("vision")}`,
    description: (f) =>
      `The Sighted wear a small bell at the wrist so that no one is looked at unawares, for ${f.demonym} hold that a seer's glance can lift the lid of a life and let the luck out. They live at the village edge, are paid well and visited after dark, and are never, ever touched. Children ring imitation bells at them from safe distances and are beaten for it, mostly.`,
  },
  {
    key: "sight-dream-readers",
    category: "the-sight",
    hooks: ["the-sight"],
    affinity: (v, a) => 0.5 + has(v, "learning") * 1.5 + a.mysticism * 0.8,
    name: (f) => `The Readers of ${f.w("dream")}`,
    description: (f) =>
      `The Sight is a craft here, not a curse: a Sighted child is apprenticed to a dream-reader, taught to fast, to sleep at the proper angles, and above all to write, for a vision unrecorded is treated as never having happened. The readers' ledgers go back generations and are consulted like weather-lore. Twice now a ledger has been right about a king, which is once more than is comfortable.`,
  },
];

export const TEMPLATE_BY_KEY: ReadonlyMap<string, TraditionTemplate> = new Map(
  TRADITION_TEMPLATES.map((t) => [t.key, t]),
);

const CATEGORIES: TraditionCategory[] = [
  "funeral",
  "coming-of-age",
  "naming",
  "marriage",
  "feast",
  "hospitality",
  "duel",
  "mourning",
  "taboo",
  "oath",
  "birth",
  "twins",
  "the-sight",
];

/** Categories every culture must cover. */
const MANDATORY: TraditionCategory[] = ["funeral", "coming-of-age", "marriage"];

/**
 * Build a per-culture flavor context with a concept -> native word cache,
 * so the same concept always yields the same word within one culture.
 */
export function makeFlavor(rng: Rng, lang: Language, demonym: string): Flavor {
  const cache = new Map<string, string>();
  const flavorRng = rng.fork("flavor");
  const startsVowel = (word: string) => /^[aeiou]/i.test(word);
  return {
    demonym,
    w: (concept: string) => {
      const hit = cache.get(concept);
      if (hit !== undefined) return hit;
      const word = nativeWord(flavorRng.fork(concept), lang, concept);
      cache.set(concept, word);
      return word;
    },
    a: (word: string) => `${startsVowel(word) ? "an" : "a"} ${word}`,
    A: (word: string) => `${startsVowel(word) ? "An" : "A"} ${word}`,
  };
}

export function instantiateTradition(tpl: TraditionTemplate, flavor: Flavor): Tradition {
  return {
    key: tpl.key,
    name: tpl.name(flavor),
    description: tpl.description(flavor),
    hooks: [...tpl.hooks],
  };
}

function templatesIn(category: TraditionCategory): TraditionTemplate[] {
  return TRADITION_TEMPLATES.filter((t) => t.category === category);
}

function pickTemplate(
  rng: Rng,
  category: TraditionCategory,
  values: readonly CultureValue[],
  att: Attitudes,
): TraditionTemplate {
  const pool = templatesIn(category);
  return rng.weighted(pool, pool.map((t) => Math.max(0.05, t.affinity(values, att))));
}

/**
 * Select 4-7 traditions for a new culture: funeral, coming-of-age and
 * marriage always, then further categories weighted by how well their best
 * template fits the culture's values and attitudes.
 */
export function selectTraditions(
  rng: Rng,
  lang: Language,
  values: readonly CultureValue[],
  att: Attitudes,
  demonym: string,
): Tradition[] {
  const flavor = makeFlavor(rng, lang, demonym);
  const count = rng.fork("count").weightedPairs([
    [4, 2],
    [5, 3],
    [6, 3],
    [7, 1.5],
  ] as const);
  const chosen: TraditionCategory[] = [...MANDATORY];
  const optional = CATEGORIES.filter((c) => !MANDATORY.includes(c));
  const optWeights = optional.map((c) => {
    const pool = templatesIn(c);
    let best = 0;
    for (const t of pool) best = Math.max(best, t.affinity(values, att));
    return Math.max(0.1, best);
  });
  const pickRng = rng.fork("categories");
  const remaining = optional.slice();
  const remainingW = optWeights.slice();
  while (chosen.length < count && remaining.length > 0) {
    const cat = pickRng.fork("cat", chosen.length).weighted(remaining, remainingW);
    const idx = remaining.indexOf(cat);
    remaining.splice(idx, 1);
    remainingW.splice(idx, 1);
    chosen.push(cat);
  }
  return chosen.map((cat) =>
    instantiateTradition(pickTemplate(rng.fork("tpl", cat), cat, values, att), flavor),
  );
}

/**
 * Drift a parent's traditions for a derived culture: keep most (re-voiced
 * in the daughter tongue), lose some, gain a few, and always restore the
 * mandatory categories if drift dropped them.
 */
export function driftTraditions(
  rng: Rng,
  lang: Language,
  parentTraditions: readonly Tradition[],
  values: readonly CultureValue[],
  att: Attitudes,
  demonym: string,
): Tradition[] {
  const flavor = makeFlavor(rng, lang, demonym);
  const kept: Tradition[] = [];
  const usedCategories = new Set<TraditionCategory>();
  for (const t of parentTraditions) {
    if (!rng.fork("keep", t.key).chance(0.72)) continue;
    const tpl = TEMPLATE_BY_KEY.get(t.key);
    if (tpl) {
      kept.push(instantiateTradition(tpl, flavor));
      usedCategories.add(tpl.category);
    } else {
      kept.push({ ...t, hooks: [...t.hooks] });
    }
  }
  // Restore mandatory categories the drift lost, choosing anew (customs change).
  for (const cat of MANDATORY) {
    if (!usedCategories.has(cat)) {
      kept.push(instantiateTradition(pickTemplate(rng.fork("restore", cat), cat, values, att), flavor));
      usedCategories.add(cat);
    }
  }
  // A derived culture may pick up 0-2 novel traditions of its own.
  const novel = rng.fork("novelCount").weightedPairs([
    [0, 2],
    [1, 3],
    [2, 1.5],
  ] as const);
  const open = CATEGORIES.filter((c) => !usedCategories.has(c));
  const openW = open.map((c) => {
    const pool = templatesIn(c);
    let best = 0;
    for (const t of pool) best = Math.max(best, t.affinity(values, att));
    return Math.max(0.1, best);
  });
  const addRng = rng.fork("novel");
  const remaining = open.slice();
  const remainingW = openW.slice();
  let toAdd = novel;
  // Never fall below four traditions: top up from open categories.
  if (kept.length + toAdd < 4) toAdd = 4 - kept.length;
  for (let i = 0; i < toAdd && kept.length < 7 && remaining.length > 0; i++) {
    const cat = addRng.fork("cat", i).weighted(remaining, remainingW);
    const idx = remaining.indexOf(cat);
    remaining.splice(idx, 1);
    remainingW.splice(idx, 1);
    kept.push(instantiateTradition(pickTemplate(rng.fork("noveltpl", cat), cat, values, att), flavor));
  }
  // Trim overflow beyond 7, never trimming mandatory categories.
  while (kept.length > 7) {
    const idx = kept.findIndex((t) => {
      const tpl = TEMPLATE_BY_KEY.get(t.key);
      return !tpl || !MANDATORY.includes(tpl.category);
    });
    kept.splice(idx >= 0 ? idx : kept.length - 1, 1);
  }
  return kept;
}
