import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useWorld } from "../WorldCtx";
import { sortedIds, eventsBetween } from "../../engine/core/world";
import { yearOf } from "../../engine/core/time";
import { EventList, PersonCard, Banner, fmtDate } from "../util";
import { MapSvg } from "../components/MapSvg";

export function WorldPage() {
  const { world, services } = useWorld();

  const recent = useMemo(() => {
    const from = Math.max(0, world.now - 120);
    return eventsBetween(world, from, world.now)
      .filter((e) => e.importance >= 18 && !e.secret)
      .sort((a, b) => b.date - a.date || b.importance - a.importance)
      .slice(0, 30);
  }, [world.now, world.events.size]);

  const notable = useMemo(() => {
    return [...world.people.values()]
      .filter((p) => p.died == null && !p.flags["emigrated"])
      .sort((a, b) => b.notability - a.notability)
      .slice(0, 8);
  }, [world.now, world.people.size]);

  const activeStories = useMemo(
    () => [...world.storylines.values()].filter((s) => !s.resolved).slice(-12).reverse(),
    [world.now, world.storylines.size],
  );

  return (
    <div>
      <h1>The World</h1>
      <div className="sub">
        Year {world.stats.year} · {world.stats.alive} souls alive · {world.stats.totalBorn} ever born ·{" "}
        {world.events.size} chronicle entries · {world.storylines.size} storylines
      </div>

      <MapSvg />

      <div className="grid cols2" style={{ marginTop: 16 }}>
        <div className="panel">
          <h2>Tidings</h2>
          {recent.length === 0 && <div className="hint">The world holds its breath. Let time run.</div>}
          <EventList events={recent} showCauses={false} max={30} />
        </div>
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h2>Realms</h2>
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Realm</th>
                  <th>Ruler</th>
                  <th>Seat</th>
                </tr>
              </thead>
              <tbody>
                {sortedIds(world.polities).map((id) => {
                  const pol = world.polities.get(id)!;
                  const ruler = pol.ruler != null ? world.people.get(pol.ruler) : undefined;
                  const house = pol.rulingHouse != null ? world.houses.get(pol.rulingHouse) : undefined;
                  return (
                    <tr key={id}>
                      <td>{house && <Banner seed={house.bannerSeed} size={20} />}</td>
                      <td>
                        <Link to={`/pol/${id}`}>{pol.name}</Link>
                      </td>
                      <td>
                        {ruler ? (
                          <Link to={`/p/${ruler.id}`}>
                            {(ruler.sex === "f" ? pol.rulerTitleF : pol.rulerTitleM) + " " + services.narrative.shortName(world, ruler)}
                          </Link>
                        ) : (
                          <span className="hint">throne contested</span>
                        )}
                      </td>
                      <td>
                        <Link to={`/s/${pol.capital}`}>{world.settlements.get(pol.capital)?.name}</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h2>Names on every tongue</h2>
            <div className="cardgrid">
              {notable.map((p) => (
                <PersonCard key={p.id} id={p.id} note={`${p.status.profession} · ${Math.round(p.notability)}`} />
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>Threads still weaving</h2>
            {activeStories.length === 0 && <div className="hint">No storylines yet. Let time run.</div>}
            {activeStories.map((s) => (
              <div key={s.id} style={{ margin: "5px 0" }}>
                <Link to={`/story/${s.id}`}>{s.kind}</Link>
                <span className="hint"> · since {fmtDate(s.started)} · stage: {s.stage}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
