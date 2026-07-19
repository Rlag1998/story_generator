/**
 * Renderers for world events: plagues, famines, harvests, disasters, trade.
 */

import type { EvRenderer } from "./cx";
import { deThe, joinList, numberWord } from "./text";

export const WORLD_RENDERERS: Record<string, EvRenderer> = {
  "plague-outbreak": (c) => {
    const name = deThe(c.strOr("name", "nameless sickness"));
    const region = c.regionNameFromData("region", c.placeOr("the lowland roads"));
    return [
      `The ${name} has come to ${region}. The markets empty first; the churchyards fill after.`,
      `First one house, then the street, then the bell tolling at odd hours: the ${name} is loose in ${region}.`,
      `Word travels faster than the sickness, but not by much. The ${name} has reached ${region}.`,
    ];
  },

  "plague-ended": (c) => {
    const name = deThe(c.strOr("name", "sickness"));
    const months = c.num("months");
    const ran = months !== null && months > 0 ? `After ${numberWord(months)} months` : "At long last";
    return [
      `${ran}, the ${name} burned itself out. The survivors counted each other and started over.`,
      `The ${name} has passed. Doors stand open again, and the gravediggers finally rest.`,
      `No new marks on the doors this month, nor last: the ${name} is done. What it took stays taken.`,
    ];
  },

  famine: (c) => {
    const region = c.regionNameFromData("region", c.placeOr("the district"));
    const years = c.num("consecutiveYears");
    const again = years !== null && years > 1 ? " It is the second failed year running, which is the kind that kills." : "";
    return [
      `The harvest failed in ${region}. By midwinter the granaries echoed and the bark bread came out.${again}`,
      `Famine in ${region}: thin fields, thin cattle, thin children.${again}`,
      `The fields of ${region} gave next to nothing. Old folk began quietly refusing their portions.${again}`,
    ];
  },

  "bountiful-harvest": (c) => {
    const region = c.regionNameFromData("region", c.placeOr("the valley"));
    return [
      `A harvest in ${region} such as the old men pretend to remember: full cribs, full cellars, and weddings moved earlier.`,
      `The fields of ${region} overflowed this year. Even the gleaners went home heavy.`,
      `${region} brought in a harvest to sing about, and the tithe barns strained at the doors.`,
    ];
  },

  fire: (c) => {
    const name = c.str("name");
    const homes = c.num("homesLost");
    const fallen = c.namesFromIds("fallen", 3);
    const burned = homes !== null && homes > 0 ? ` ${numberWord(homes)[0].toUpperCase() + numberWord(homes).slice(1)} homes went to ash.` : "";
    const dead = fallen.length > 0 ? ` The fire took ${joinList(fallen)}.` : "";
    const called = name ? `, the one they now call ${name},` : "";
    return [
      `Fire ran through ${c.placeOr("the town")}${called} leaping thatch to thatch faster than the buckets could follow.${burned}${dead}`,
      `A great burning${c.place()}.${burned}${dead} The smell of it hung on for weeks.`,
      `${c.placeOr("The town")} burned ${c.when(null)}.${burned}${dead}`,
    ];
  },

  flood: (c) => {
    const fallen = c.namesFromIds("fallen", 3);
    const dead = fallen.length > 0 ? ` The waters took ${joinList(fallen)}.` : "";
    return [
      `The river rose and kept rising; ${c.placeOr("the low quarter")} went under.${dead} The stores that drowned will be missed at winter's hungry end.`,
      `Flood${c.place()}: boats poled down streets, and bread was passed in at upper windows.${dead}`,
      `The waters came over the banks ${c.when(null)} and were slow to leave.${dead}`,
    ];
  },

  storm: (c) => {
    const fallen = c.namesFromIds("fallen", 3);
    const ships = c.num("shipsLost");
    const lost = fallen.length > 0 ? ` The sea did not give back ${joinList(fallen)}.` : "";
    const hulls = ships !== null && ships > 0 ? ` ${numberWord(ships)[0].toUpperCase() + numberWord(ships).slice(1)} hulls were lost.` : "";
    return [
      `A great gale fell on ${c.placeOr("the coast")}.${hulls}${lost} The women walked the tideline for days after.`,
      `The storm came in off the water with no warning worth the name.${hulls}${lost}`,
      `Wind enough to strip roofs and drive ships under${c.place()}.${hulls}${lost}`,
    ];
  },

  earthquake: (c) => {
    const fallen = c.namesFromIds("fallen", 3);
    const homes = c.num("ruinedHomes");
    const dead = fallen.length > 0 ? ` Pulled dead from the rubble: ${joinList(fallen)}.` : "";
    const ruin = homes !== null && homes > 0 ? ` ${numberWord(homes)[0].toUpperCase() + numberWord(homes).slice(1)} houses came down.` : "";
    return [
      `The earth shook${c.place()}, hard enough to ring bells that no hand pulled.${ruin}${dead}`,
      `A quake split walls and nerves alike in ${c.placeOr("the district")}.${ruin}${dead}`,
      `The ground itself turned traitor ${c.when(null)}.${ruin}${dead}`,
    ];
  },

  comet: (c) => {
    const name = c.str("name");
    const months = c.num("months");
    const called = name ? ` Folk have named it ${name}.` : "";
    const hang = months !== null && months > 1 ? ` It hung in the sky for ${numberWord(months)} months, which no one found reassuring.` : "";
    return [
      `A comet stood in the night sky, trailing its pale hair.${called}${hang} Priests and midwives were both kept busy.`,
      `A new light in the heavens, and every watcher sure it meant something different.${called}${hang}`,
      `The star with the tail returned to the sky.${called}${hang}`,
    ];
  },

  "trade-boom": (c) => {
    const wares = c.str("wares");
    const of = wares ? ` The money is in ${wares}.` : "";
    return [
      `Good years for trade${c.place()}: the wharves and warehouses cannot keep up.${of}`,
      `Silver is moving${c.place()} like water downhill.${of} Even the beggars' takings improved.`,
      `A boom in trade lifted ${c.placeOr("the market towns")}.${of}`,
    ];
  },

  "road-built": (c) => {
    const name = c.str("name");
    const from = c.regionNameFromData("from", "one region");
    const to = c.regionNameFromData("to", "the next");
    const called = name ? `, ${name},` : "";
    return [
      `A road was finished${called} joining ${from} and ${to}. What took a week now takes three days.`,
      `The new road${called} runs from ${from} to ${to}, and carters are already wearing ruts in it.`,
      `Stone by stone, the road between ${from} and ${to} was completed.`,
    ];
  },
};
