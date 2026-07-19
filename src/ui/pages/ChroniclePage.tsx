import React, { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useWorld } from "../WorldCtx";
import { eventsBetween } from "../../engine/core/world";
import { yearOf, makeDate } from "../../engine/core/time";
import { EventList, EventLine, PersonRow, fmtDate, impClass } from "../util";

export function ChroniclePage() {
  const { world } = useWorld();
  const nowYear = yearOf(world.now);
  const [fromY, setFromY] = useState(Math.max(world.params.startYear, nowYear - 20));
  const [toY, setToY] = useState(nowYear);
  const [minImp, setMinImp] = useState(15);
  const [kind, setKind] = useState("");
  const [showSecrets, setShowSecrets] = useState(true);

  const types = useMemo(() => {
    const s = new Set<string>();
    for (const e of world.events.values()) s.add(e.type);
    return [...s].sort();
  }, [world.events.size]);

  const events = useMemo(() => {
    const list = eventsBetween(world, makeDate(fromY, 1), Math.min(world.now, makeDate(toY, 12)))
      .filter((e) => e.importance >= minImp)
      .filter((e) => !kind || e.type === kind)
      .filter((e) => showSecrets || !e.secret);
    return list.sort((a, b) => b.date - a.date || b.id - a.id).slice(0, 600);
  }, [world.now, world.events.size, fromY, toY, minImp, kind, showSecrets]);

  return (
    <div>
      <h1>The Chronicle</h1>
      <div className="sub">Every recorded thing, from the world-shaking to the whispered.</div>
      <div className="searchbar">
        <label className="hint">years</label>
        <input type="number" style={{ width: 80 }} value={fromY} onChange={(e) => setFromY(Number(e.target.value))} />
        <span className="hint">to</span>
        <input type="number" style={{ width: 80 }} value={toY} onChange={(e) => setToY(Number(e.target.value))} />
        <label className="hint">gravity ≥</label>
        <input type="number" style={{ width: 64 }} value={minImp} onChange={(e) => setMinImp(Number(e.target.value))} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">every kind</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className={showSecrets ? "active" : ""} onClick={() => setShowSecrets(!showSecrets)} title="the observer sees what the world does not">
          ✦ secrets
        </button>
      </div>
      <EventList events={events} showCauses max={100} />
    </div>
  );
}

/** Single event with its full cause/consequence web. */
export function EventPage() {
  const { id } = useParams();
  const { world, services } = useWorld();
  const ev = world.events.get(Number(id));
  if (!ev) return <div>That page of the chronicle is missing.</div>;

  const causes = ev.causes.map((c) => world.events.get(c)).filter(Boolean);
  const consequences = ev.consequences.map((c) => world.events.get(c)).filter(Boolean);
  const story = ev.storyline != null ? world.storylines.get(ev.storyline) : undefined;

  return (
    <div>
      <h1>{services.narrative.renderHeadline(world, ev)}</h1>
      <div className="sub">
        {fmtDate(ev.date)} · gravity {ev.importance}
        {ev.secret && <span className="secret"> · ✦ still secret</span>}
        {ev.revealed != null && <span className="secret"> · revealed {fmtDate(ev.revealed)}</span>}
        {story && (
          <>
            {" · part of "}
            <Link to={`/story/${story.id}`}>a {story.kind} storyline</Link>
          </>
        )}
      </div>
      <div className="panel bio" style={{ marginBottom: 16 }}>
        {services.narrative.renderEvent(world, ev)}
      </div>
      <div className="grid cols2">
        <div className="panel">
          <h3>Because of</h3>
          {causes.length === 0 && <div className="hint">No recorded cause. Some things simply happen.</div>}
          {causes.map((c) => (
            <EventLine key={c!.id} ev={c!} />
          ))}
        </div>
        <div className="panel">
          <h3>And so it followed</h3>
          {consequences.length === 0 && <div className="hint">Nothing yet traced to this. Give it time.</div>}
          {consequences.map((c) => (
            <EventLine key={c!.id} ev={c!} />
          ))}
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Those involved</h3>
        {Object.entries(ev.participants).map(([role, pid]) => (
          <PersonRow key={role + pid} id={pid} meta={role} />
        ))}
      </div>
    </div>
  );
}

export function StorylinePage() {
  const { id } = useParams();
  const { world, services } = useWorld();
  const s = world.storylines.get(Number(id));
  if (!s) return <div>No such thread.</div>;
  const events = s.events.map((e) => world.events.get(e)).filter(Boolean);
  return (
    <div>
      <h1>A tale of {s.kind.replace(/-/g, " ")}</h1>
      <div className="sub">
        began {fmtDate(s.started)}
        {s.ended != null ? ` · ended ${fmtDate(s.ended)}` : " · still unfolding"}
        {s.outcome ? ` · ${s.outcome}` : ""}
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>The cast</h3>
        {Object.entries(s.cast).map(([role, pid]) => (
          <PersonRow key={role + pid} id={pid} meta={role.replace(/-/g, " ")} />
        ))}
      </div>
      <div className="panel">
        <h3>How it unfolded</h3>
        {events.map((e) => (
          <EventLine key={e!.id} ev={e!} showCauses={false} />
        ))}
      </div>
    </div>
  );
}

export function StorylinesPage() {
  const { world } = useWorld();
  const [showResolved, setShowResolved] = useState(true);
  const list = useMemo(() => {
    return [...world.storylines.values()]
      .filter((s) => showResolved || !s.resolved)
      .sort((a, b) => b.started - a.started);
  }, [world.now, world.storylines.size, showResolved]);
  return (
    <div>
      <h1>Storylines</h1>
      <div className="sub">The long threads: feuds, loves, plots, masterworks, curses.</div>
      <div className="searchbar">
        <button className={showResolved ? "active" : ""} onClick={() => setShowResolved(!showResolved)}>
          include the concluded
        </button>
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Kind</th>
            <th>Began</th>
            <th>State</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, 200).map((s) => (
            <tr key={s.id}>
              <td>
                <Link to={`/story/${s.id}`}>{s.kind.replace(/-/g, " ")}</Link>
              </td>
              <td className="mono">{fmtDate(s.started)}</td>
              <td>{s.resolved ? "concluded" : `unfolding (${s.stage})`}</td>
              <td className="hint">{s.outcome ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
