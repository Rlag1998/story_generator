/**
 * Headless chronicle printer.
 *
 * Usage:
 *   npm run chronicle -- --seed myworld --years 120
 *   npm run chronicle -- --seed myworld --years 120 --follow random
 *   npm run chronicle -- --seed myworld --years 200 --top 5
 */

import { createEngine } from "../engine/engine";
import { formatDate, yearOf } from "../engine/core/time";
import { eventsOf } from "../engine/core/world";
import { Rng } from "../engine/core/rng";

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const seed = arg("seed", "aeonspire");
const years = parseInt(arg("years", "100"), 10);
const follow = arg("follow", "");
const top = parseInt(arg("top", "3"), 10);

console.log(`— Aeonspire — seed "${seed}", simulating ${years} years…`);
const t0 = Date.now();
const engine = createEngine(seed);
engine.runYears(years);
const dt = ((Date.now() - t0) / 1000).toFixed(1);

const { world, services } = engine;
console.log(
  `Done in ${dt}s. Year ${world.stats.year}: ${world.stats.alive} alive, ` +
    `${world.stats.totalBorn} ever born, ${world.events.size} events, ` +
    `${world.storylines.size} storylines, ${world.houses.size} houses, ` +
    `${world.polities.size} polities.`,
);

// Pick people to feature: most notable, or a random/named follow target.
const people = [...world.people.values()];
let featured = people
  .filter((p) => p.notability > 0)
  .sort((a, b) => b.notability - a.notability)
  .slice(0, top);

if (follow) {
  if (follow === "random") {
    const r = new Rng(seed + ":follow");
    featured = [r.pick(people.filter((p) => p.died !== null || p.notability > 10))];
  } else {
    const match = people.filter((p) =>
      services.narrative.shortName(world, p).toLowerCase().includes(follow.toLowerCase()),
    );
    if (match.length > 0) featured = match.slice(0, 1);
    else console.log(`(no person matching "${follow}"; showing most notable)`);
  }
}

for (const p of featured) {
  const name = services.culture.fullName(world, p);
  const born = formatDate(p.born);
  const died = p.died != null ? formatDate(p.died) : "living";
  console.log(`\n═══ ${services.narrative.shortName(world, p)} ═══`);
  console.log(`${name} · born ${born} · ${died === "living" ? "still living" : `died ${died} (${p.deathCause})`}`);
  console.log(`notability ${Math.round(p.notability)} · ${p.status.profession} · rank ${p.status.rank}`);
  console.log("");
  console.log(services.narrative.renderLife(world, p));
  console.log("\n— chronicle —");
  for (const ev of eventsOf(world, p.id)) {
    const line = services.narrative.renderEvent(world, ev);
    console.log(`  [${yearOf(ev.date)}] ${line}${ev.secret ? "  (secret)" : ""}`);
  }
}
