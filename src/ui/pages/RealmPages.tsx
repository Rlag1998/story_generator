import React, { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useWorld } from "../WorldCtx";
import { sortedIds, eventsOf } from "../../engine/core/world";
import { yearOf } from "../../engine/core/time";
import { Banner, PersonRow, PersonCard, EventList, fmtDate } from "../util";

export function PolitiesPage() {
  const { world, services } = useWorld();
  return (
    <div>
      <h1>Realms</h1>
      <div className="sub">Thrones, laws of succession, and the houses that hold them.</div>
      <div className="grid cols2">
        {sortedIds(world.polities).map((id) => {
          const pol = world.polities.get(id)!;
          const ruler = pol.ruler != null ? world.people.get(pol.ruler) : undefined;
          const house = pol.rulingHouse != null ? world.houses.get(pol.rulingHouse) : undefined;
          return (
            <div className="panel" key={id}>
              <h2>
                {house && <Banner seed={house.bannerSeed} size={22} />}{" "}
                <Link to={`/pol/${id}`}>{pol.name}</Link>
              </h2>
              <div className="kv">
                <span className="k">kind</span>
                <span>{pol.kind}</span>
                <span className="k">ruler</span>
                <span>
                  {ruler ? (
                    <PersonRowInline id={ruler.id} title={ruler.sex === "f" ? pol.rulerTitleF : pol.rulerTitleM} />
                  ) : (
                    "throne contested"
                  )}
                </span>
                <span className="k">succession</span>
                <span>{pol.succession.replace(/-/g, " ")}</span>
                <span className="k">reigns</span>
                <span>{pol.reigns.length}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonRowInline({ id, title }: { id: number; title?: string }) {
  const { world, services } = useWorld();
  const p = world.people.get(id);
  if (!p) return null;
  return (
    <Link to={`/p/${id}`}>
      {title ? title + " " : ""}
      {services.narrative.shortName(world, p)}
    </Link>
  );
}

export function PolityPage() {
  const { id } = useParams();
  const { world, services } = useWorld();
  const pol = world.polities.get(Number(id));
  if (!pol) return <div>No such realm.</div>;
  const house = pol.rulingHouse != null ? world.houses.get(pol.rulingHouse) : undefined;
  const line = useMemo(
    () => services.politics.successionLine(world, pol, 8),
    [world.now, pol.ruler],
  );
  return (
    <div>
      <h1>
        {house && <Banner seed={house.bannerSeed} size={26} />} {pol.name}
      </h1>
      <div className="sub">
        {pol.kind} · seat at <Link to={`/s/${pol.capital}`}>{world.settlements.get(pol.capital)?.name}</Link> ·{" "}
        {pol.succession.replace(/-/g, " ")}
      </div>
      <div className="grid cols2">
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h3>The throne</h3>
            {pol.ruler != null ? (
              <PersonRow
                id={pol.ruler}
                meta={(world.people.get(pol.ruler)?.sex === "f" ? pol.rulerTitleF : pol.rulerTitleM) + (house ? ` of ${house.name}` : "")}
              />
            ) : (
              <div className="hint">The throne stands empty.</div>
            )}
            <h3>Line of succession</h3>
            {line.length === 0 && <div className="hint">No clear heirs. Sharpen your knives.</div>}
            {line.map((pid, i) => (
              <PersonRow key={pid} id={pid} meta={`${i + 1}.`} />
            ))}
          </div>
          <div className="panel">
            <h3>The court</h3>
            {[...pol.court.entries()].map(([role, pid]) => (
              <PersonRow key={role} id={pid} meta={role} />
            ))}
            {pol.court.size === 0 && <div className="hint">An empty hall.</div>}
          </div>
        </div>
        <div className="panel">
          <h3>Reigns</h3>
          <table className="data">
            <thead>
              <tr>
                <th>Ruler</th>
                <th>From</th>
                <th>Until</th>
              </tr>
            </thead>
            <tbody>
              {[...pol.reigns].reverse().map((r, i) => (
                <tr key={i}>
                  <td>
                    <PersonRowInline id={r.ruler} />
                  </td>
                  <td className="mono">Y{yearOf(r.from)}</td>
                  <td className="mono">{r.to != null ? `Y${yearOf(r.to)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Lands</h3>
          {pol.regions.map((rid) => {
            const r = world.regions.get(rid);
            if (!r) return null;
            return (
              <div key={rid}>
                {r.name} <span className="hint">({r.biome})</span> —{" "}
                {r.settlements.map((sid, i) => (
                  <span key={sid}>
                    {i > 0 && ", "}
                    <Link to={`/s/${sid}`}>{world.settlements.get(sid)?.name}</Link>
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HousesPage() {
  const { world } = useWorld();
  const houses = sortedIds(world.houses)
    .map((id) => world.houses.get(id)!)
    .sort((a, b) => b.prestige - a.prestige);
  return (
    <div>
      <h1>Great Houses</h1>
      <div className="sub">Banners, seats, feuds, and the weight of names.</div>
      <table className="data">
        <thead>
          <tr>
            <th></th>
            <th>House</th>
            <th>Motto</th>
            <th>Head</th>
            <th>Seat</th>
            <th>Prestige</th>
          </tr>
        </thead>
        <tbody>
          {houses.map((h) => (
            <tr key={h.id}>
              <td>
                <Banner seed={h.bannerSeed} size={22} />
              </td>
              <td>
                <Link to={`/h/${h.id}`}>{h.name}</Link>
              </td>
              <td className="hint">“{h.motto}”</td>
              <td>{h.head != null && <PersonRowInline id={h.head} />}</td>
              <td>{h.seat != null && <Link to={`/s/${h.seat}`}>{world.settlements.get(h.seat)?.name}</Link>}</td>
              <td className="mono">{Math.round(h.prestige)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HousePage() {
  const { id } = useParams();
  const { world, services } = useWorld();
  const h = world.houses.get(Number(id));
  if (!h) return <div>No such house.</div>;
  const members = [...world.people.values()].filter((p) => p.house === h.id);
  const living = members.filter((p) => p.died == null && !p.flags["emigrated"]);
  const founder = world.people.get(h.founder);
  return (
    <div>
      <h1>
        <Banner seed={h.bannerSeed} size={30} /> {h.name}
      </h1>
      <div className="sub">
        “{h.motto}” · founded Y{yearOf(h.founded)}
        {founder && (
          <>
            {" by "}
            <Link to={`/p/${founder.id}`}>{services.narrative.shortName(world, founder)}</Link>
          </>
        )}
        {h.parent != null && (
          <>
            {" · cadet of "}
            <Link to={`/h/${h.parent}`}>{world.houses.get(h.parent)?.name}</Link>
          </>
        )}
      </div>
      <div className="grid cols2">
        <div className="panel">
          <h3>The living ({living.length})</h3>
          {living
            .sort((a, b) => a.born - b.born)
            .slice(0, 40)
            .map((p) => (
              <PersonRow key={p.id} id={p.id} meta={p.id === h.head ? "head of the house" : undefined} />
            ))}
          {living.length === 0 && <div className="hint">The house is extinct. Its banner gathers dust.</div>}
        </div>
        <div>
          {h.feuds.size > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <h3>Feuds</h3>
              {[...h.feuds.entries()].map(([hid, heat]) => (
                <div key={hid}>
                  <Link to={`/h/${hid}`}>{world.houses.get(hid)?.name}</Link>{" "}
                  <span className="hint">bad blood {Math.round(heat * 100)}%</span>
                </div>
              ))}
            </div>
          )}
          <div className="panel">
            <h3>The dead</h3>
            {members
              .filter((p) => p.died != null)
              .sort((a, b) => (b.died ?? 0) - (a.died ?? 0))
              .slice(0, 25)
              .map((p) => (
                <PersonRow key={p.id} id={p.id} meta={`died Y${yearOf(p.died!)} · ${p.deathCause}`} />
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettlementPage() {
  const { id } = useParams();
  const { world, services } = useWorld();
  const s = world.settlements.get(Number(id));
  if (!s) return <div>No such place.</div>;
  const region = world.regions.get(s.region);
  const pol = world.polities.get(s.polity);
  const residents = [...world.people.values()]
    .filter((p) => p.location === s.id && p.died == null && !p.flags["emigrated"])
    .sort((a, b) => b.notability - a.notability);
  const localEvents = useMemo(() => {
    return [...world.events.values()]
      .filter((e) => e.location === s.id && e.importance >= 10)
      .sort((a, b) => b.date - a.date)
      .slice(0, 60);
  }, [world.now, world.events.size, s.id]);
  return (
    <div>
      <h1>{s.name}</h1>
      <div className="sub">
        {s.kind} in {region?.name} ({region?.biome}) · realm of{" "}
        {pol ? <Link to={`/pol/${pol.id}`}>{pol.name}</Link> : "no crown"} · {residents.length} named souls +{" "}
        {s.abstractPop} unnamed · trade: {s.economy.join(", ")}
        {Object.entries(s.conditions)
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <span key={k} className="tag" style={{ marginLeft: 6 }}>
              {k}
              {typeof v === "number" ? ` ${Math.round(v * 100) / 100}` : typeof v === "string" ? `: ${v}` : ""}
            </span>
          ))}
      </div>
      <div className="grid cols2">
        <div className="panel">
          <h3>Souls of note</h3>
          <div className="cardgrid">
            {residents.slice(0, 18).map((p) => (
              <PersonCard key={p.id} id={p.id} note={p.status.profession} />
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>What happened here</h3>
          <EventList events={localEvents} showCauses={false} max={40} />
        </div>
      </div>
    </div>
  );
}
