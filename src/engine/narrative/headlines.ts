/**
 * renderHeadline: three-to-eight-word titles for lists and tickers,
 * e.g. "Duel at Harrowmere", "The Grey Sweat Reaches Velle".
 */

import type { EventRecord, Person, World } from "../core/types";
import { Cx } from "./cx";
import { rulerPolityOf } from "./names";
import { cap, deThe, sanitize } from "./text";

type HeadlineFn = (c: Cx) => string;

/** Short personal name for headlines: the given name. */
function gn(c: Cx, ...roles: string[]): string {
  const p = c.person(...roles);
  return p && p.givenName.length > 0 ? p.givenName : "One Unnamed";
}

function gnOf(p: Person | null): string {
  return p && p.givenName.length > 0 ? p.givenName : "One Unnamed";
}

/** "at Velle" / "in the Harrowmarch" / a generic tail. */
function at(c: Cx, fallback = "in the Land"): string {
  const s = c.settlement();
  if (s) return `at ${s.name}`;
  const r = c.region();
  if (r) return `in ${r.name}`;
  return fallback;
}

const HEADLINES: Record<string, HeadlineFn> = {
  birth: (c) => {
    const child = c.person("subject");
    const kid = child ? cap(c.pr(child).child) : "Child";
    const house = child && child.house !== null ? c.world.houses.get(child.house) : undefined;
    return house ? `A ${kid} for ${house.name}` : `A ${kid} Born ${at(c)}`;
  },
  death: (c) => {
    const p = c.person("subject", "deceased") ?? c.primary();
    if (p && rulerPolityOf(c.world, p)) {
      const pol = rulerPolityOf(c.world, p)!;
      return `The ${p.sex === "f" ? pol.rulerTitleF : pol.rulerTitleM} Is Dead`;
    }
    return `Death of ${c.nameOf(p, "One Unnamed")}`;
  },
  "coming-of-age": (c) => `${gn(c, "subject")} Comes of Age`,
  betrothal: (c) => `${gn(c, "bride", "a")} Promised to ${gn(c, "groom", "b")}`,
  wedding: (c) => `${gn(c, "bride", "a")} Weds ${gn(c, "groom", "b")}`,
  divorce: (c) => `A Marriage Ends ${at(c)}`,
  "pregnancy-loss": (c) => `Grief in ${gn(c, "subject", "mother")}'s House`,
  "took-profession": (c) => `A Trade for ${gn(c, "subject")}`,
  apprenticed: (c) => `${gn(c, "ward", "subject")} Goes to Prentice`,
  retired: (c) => `${gn(c, "subject")} Lays Down the Work`,
  moved: (c) => `${gn(c, "subject")} Moves to ${c.settlementNameFromData("to", "a New Town")}`,
  emigrated: (c) => `${gn(c, "subject")} Leaves the Land`,
  illness: (c) => `${gn(c, "subject")} Falls Ill`,
  recovery: (c) => `${gn(c, "subject")} Rises from the Sickbed`,
  injury: (c) => `A Lasting Hurt for ${gn(c, "subject")}`,
  "twin-birth": (c) => ((c.num("litter") ?? 2) >= 3 ? `Triplets Born ${at(c)}` : `Twins Born ${at(c)}`),

  "friendship-formed": (c) => `${gn(c, "a")} and ${gn(c, "b")}, Fast Friends`,
  "rivalry-formed": (c) => `Bad Blood: ${gn(c, "a")} and ${gn(c, "b")}`,
  "romance-began": (c) => `A Courtship ${at(c)}`,
  "affair-began": (c) => `A Hidden Affair Begins`,
  "affair-discovered": (c) => `An Affair Comes to Light`,
  quarrel: (c) => `Hard Words ${at(c)}`,
  reconciliation: (c) => `${gn(c, "a")} and ${gn(c, "b")} Make Peace`,
  duel: (c) => `Duel ${at(c)}`,
  brawl: (c) => `A Brawl ${at(c)}`,
  insult: (c) => `An Insult Before Witnesses`,
  gift: (c) => `A Gift for ${gn(c, "receiver", "to")}`,
  "oath-sworn": (c) => `An Oath Sworn ${at(c)}`,
  "oath-broken": (c) => `${gn(c, "a", "subject")} Breaks an Oath`,
  "mentorship-began": (c) => `${gn(c, "mentor", "patron", "b")} Takes a Pupil`,
  "bastard-acknowledged": (c) => `A Bastard Given a Name`,

  "heroic-rescue": (c) => `${gn(c, "subject", "rescuer", "hero")} Saves ${gn(c, "saved", "target")}`,
  "crime-theft": (c) => `Thieving ${at(c)}`,
  "crime-murder": (c) => `Murder in the Dark`,
  "crime-discovered": (c) => `An Old Crime Surfaces`,
  trial: (c) => `${gn(c, "accused", "subject")} Stands Trial`,
  execution: (c) => `Execution ${at(c)}`,
  exile: (c) => `${gn(c, "subject")} Sent into Exile`,
  "return-from-exile": (c) => `${gn(c, "subject")} Returns from Exile`,
  disappearance: (c) => `${gn(c, "subject")} Vanishes ${c.settlement() ? `from ${c.settlement()!.name}` : "Without Trace"}`,
  "beast-attack": (c) => `Beast Attack near ${c.placeOr("the Pastures")}`,
  "masterwork-created": (c) => `A Masterwork ${at(c)}`,
  "song-composed": (c) => `A New Song Travels`,
  "prophecy-spoken": (c) => `A Prophecy ${at(c)}`,
  "curse-pronounced": (c) => `A Curse on ${gn(c, "target")}`,
  vision: (c) => `A Vision Comes to ${gn(c, "subject")}`,
  conversion: (c) => `${gn(c, "convert", "subject")} Changes Faith`,
  "pilgrimage-departed": (c) => `${gn(c, "subject")} Takes the Shrine Road`,
  "pilgrimage-returned": (c) => `${gn(c, "subject")} Returns from Pilgrimage`,
  "founded-settlement": (c) => `${c.str("name") ?? "A New Steading"} Is Founded`,
  "nickname-earned": (c) => `${gn(c, "subject")}, Now Called ${c.strOr("epithet", "Otherwise")}`,

  coronation: (c) => `A Crown for ${gn(c, "ruler", "subject")}`,
  "succession-crisis": (c) => `The Seat of ${c.polityName("polity")} Stands Empty`,
  "claim-pressed": (c) => `A Claim upon ${c.polityName("polity")}`,
  "plot-formed": (c) => `Knives in the Dark`,
  "plot-exposed": (c) => `A Plot Laid Bare`,
  assassination: (c) => `${gn(c, "target", "victim")} Struck Down`,
  coup: (c) => `Coup in ${c.polityName("polity")}`,
  abdication: (c) => `${gn(c, "subject", "ruler")} Lays Down the Crown`,
  "war-declared": (c) => `War Between ${c.polityName("attacker", "One Realm")} and ${c.polityName("defender", "Another")}`,
  battle: (c) => `The ${c.strOr("name", `Battle ${at(c)}`)}`,
  siege: (c) => `The ${c.strOr("name", `Siege ${at(c)}`)}`,
  "peace-made": (c) => `Peace Between ${c.polityName("attacker", "One Realm")} and ${c.polityName("defender", "Another")}`,
  "alliance-formed": (c) => `An Alliance Is Sworn`,
  "title-granted": (c) => `A Title for ${gn(c, "subject", "heir")}`,
  "title-revoked": (c) => `${gn(c, "subject")} Stripped of Title`,
  "house-founded": (c) => `${c.str("houseName") ?? c.houseName("house", "A New House")} Is Founded`,
  "house-cadet-founded": (c) => `A Cadet Line: ${c.str("houseName") ?? c.houseName("house", "A New Branch")}`,
  "house-extinct": (c) => `The End of ${c.str("houseName") ?? c.houseName("house", "an Old House")}`,
  "feud-began": (c) => `A Feud Kindles ${at(c)}`,
  "feud-ended": (c) => `A Feud Laid to Rest`,

  festival: (c) => c.str("holyDay") !== null ? `${c.str("holyDay")} ${at(c)}` : `A Festival ${at(c)}`,
  omen: (c) => `An Omen ${at(c)}`,
  "heresy-preached": (c) => `Heresy Preached ${at(c)}`,
  schism: (c) => `The Faith Is Sundered`,
  "temple-built": (c) => `A Temple Rises ${at(c)}`,
  "relic-found": (c) => `A Relic Unearthed ${at(c)}`,
  persecution: (c) => `Persecution ${at(c)}`,
  "miracle-claimed": (c) => `A Miracle Claimed ${at(c)}`,

  "plague-outbreak": (c) => `The ${cap(deThe(c.strOr("name", "Sickness")))} Reaches ${c.regionNameFromData("region", c.placeOr("the Land"))}`,
  "plague-ended": (c) => `The ${cap(deThe(c.strOr("name", "Sickness")))} Burns Out`,
  famine: (c) => `Famine in ${c.regionNameFromData("region", c.placeOr("the Land"))}`,
  "bountiful-harvest": (c) => `A Harvest to Remember`,
  fire: (c) => `Great Fire ${at(c)}`,
  flood: (c) => `The Waters Rise ${at(c)}`,
  storm: (c) => `A Great Gale Strikes ${c.placeOr("the Coast")}`,
  earthquake: (c) => `The Earth Shakes ${at(c)}`,
  comet: (c) => `A Comet Stands Overhead`,
  "trade-boom": (c) => `Trade Flows Through ${c.placeOr("the Markets")}`,
  "road-built": (c) => `The New Road Is Finished`,

  // Story-module working vocabulary.
  "ambition-kindled": (c) => `A Hunger Wakes in ${gnOf(c.primary())}`,
  "contest-held": (c) => `${gn(c, "a")} Against ${gn(c, "b")}, in the Open`,
  "fortune-turn": (c) => (c.str("direction") === "rise" ? `Fortune Smiles on ${gnOf(c.primary())}` : `Fortune Turns Against ${gnOf(c.primary())}`),
  rumor: (c) => `Talk ${at(c, "on Every Road")}`,
  "grief-kept": (c) => `A Grief Kept Sharp`,
  "tale-ended": (c) => `A Tale Finds Its End`,
  stalking: (c) => `Watched from the Edges`,
  "penance-done": (c) => `${gnOf(c.primary())} Does Penance`,
  "lovers-parted": (c) => `${gn(c, "a", "lover")} and ${gn(c, "b", "beloved")} Are Parted`,
  "plot-ripened": (c) => `A Plot Ripens`,
  "secret-meeting": (c) => `A Meeting by Night`,
  "search-mounted": (c) => `The Search Goes Out`,
  sabotage: (c) => `A Quiet Ruin, on Purpose`,
  recanted: (c) => `${gnOf(c.primary())} Recants`,
  "work-ruined": (c) => `A Great Work Ruined`,
  "wonder-shown": (c) => `${gnOf(c.primary())} Shows the Gift`,
  "support-courted": (c) => `Hands Counted in Private`,
  "great-work-begun": (c) => `A Great Work Begun`,
  "gift-revealed": (c) => `A Gift Comes to Light`,
  "fortune-made": (c) => `A Fortune Made ${at(c)}`,
};

export function renderHeadline(world: World, ev: EventRecord): string {
  const c = new Cx(world, ev);
  const fn = HEADLINES[ev.type];
  let text: string;
  if (fn) {
    try {
      text = fn(c);
    } catch {
      text = fallbackHeadline(c);
    }
  } else {
    text = fallbackHeadline(c);
  }
  return sanitize(cap(text)).replace(/[.]+$/, "");
}

function fallbackHeadline(c: Cx): string {
  const words = String(c.ev.type)
    .split("-")
    .map((w) => cap(w))
    .join(" ");
  return `${words} ${at(c)}`;
}
