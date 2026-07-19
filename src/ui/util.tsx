import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import type { EventRecord, Person, World, Services } from "../engine/core/types";
import { yearOf, monthOf } from "../engine/core/time";
import { useWorld } from "./WorldCtx";

export function fmtDate(d: number): string {
  return `Y${yearOf(d)} M${monthOf(d)}`;
}

export function ageAt(p: Person, when: number): number {
  return Math.max(0, Math.floor((when - p.born) / 12));
}

export function lifespan(world: World, p: Person): string {
  const b = yearOf(p.born);
  if (p.died != null) return `${b} – ${yearOf(p.died)}`;
  if (p.flags["emigrated"]) return `${b} – (left these lands)`;
  return `${b} –`;
}

export function impClass(importance: number): string {
  if (importance >= 45) return "ev imp4";
  if (importance >= 20) return "ev imp3";
  if (importance >= 10) return "ev imp2";
  return "ev";
}

/** Small circular portrait; memoized on person identity + age bucket. */
export function Portrait({
  person,
  size = 44,
  link = true,
}: {
  person: Person;
  size?: number;
  link?: boolean;
}) {
  const { world, services } = useWorld();
  const age = person.died != null ? ageAt(person, person.died) : ageAt(person, world.now);
  const bucket = Math.floor(age / 4);
  const svg = useMemo(
    () => services.portrait.portraitSVG(person.phenotype, person.sex, age, size),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [person.id, bucket, size],
  );
  const el = (
    <span
      className={`portrait${person.died != null ? " dead" : ""}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
  return link ? <Link to={`/p/${person.id}`}>{el}</Link> : el;
}

export function Banner({ seed, size = 28 }: { seed: string; size?: number }) {
  const { services } = useWorld();
  const svg = useMemo(() => services.portrait.bannerSVG(seed, size), [seed, size]);
  return (
    <span
      style={{ width: size, height: Math.round(size * 1.25), display: "inline-block" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function PersonLink({ id, full = false }: { id: number; full?: boolean }) {
  const { world, services } = useWorld();
  const p = world.people.get(id);
  if (!p) return <span>someone lost to the record</span>;
  const name = full ? services.culture.fullName(world, p) : services.narrative.shortName(world, p);
  return (
    <Link to={`/p/${p.id}`} style={p.died != null ? { color: "var(--ink-dim)" } : undefined}>
      {name}
      {p.epithet && !full ? "" : ""}
    </Link>
  );
}

export function PersonRow({ id, meta }: { id: number; meta?: string }) {
  const { world, services } = useWorld();
  const p = world.people.get(id);
  if (!p) return null;
  return (
    <div className="personrow">
      <Portrait person={p} size={40} />
      <div>
        <PersonLink id={id} />
        <div className="meta">
          {meta ?? `${lifespan(world, p)} · ${p.status.profession}${p.epithet ? "" : ""}`}
        </div>
      </div>
    </div>
  );
}

export function PersonCard({ id, note }: { id: number; note?: string }) {
  const { world, services } = useWorld();
  const p = world.people.get(id);
  if (!p) return null;
  return (
    <div className="pcard">
      <Portrait person={p} size={72} />
      <div className="nm">
        <PersonLink id={id} />
      </div>
      <div className="meta">{note ?? lifespan(world, p)}</div>
    </div>
  );
}

/** One rendered chronicle event with cause links. */
export function EventLine({
  ev,
  showCauses = false,
}: {
  ev: EventRecord;
  showCauses?: boolean;
}) {
  const { world, services } = useWorld();
  const prose = services.narrative.renderEvent(world, ev);
  return (
    <div className={impClass(ev.importance)}>
      <span className="when">{fmtDate(ev.date)}</span>
      <span>{prose}</span>
      {ev.secret && <span className="secret">✦ secret</span>}
      {ev.storyline != null && (
        <Link className="secret" to={`/story/${ev.storyline}`} title="part of a storyline">
          ⁂
        </Link>
      )}
      {showCauses && ev.causes.length > 0 && (
        <div className="causes">
          because:{" "}
          {ev.causes.map((cid, i) => {
            const c = world.events.get(cid);
            if (!c) return null;
            return (
              <span key={cid}>
                {i > 0 && "; "}
                <Link to={`/ev/${cid}`}>{services.narrative.renderHeadline(world, c)}</Link>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function EventList({
  events,
  showCauses = true,
  max = 200,
}: {
  events: EventRecord[];
  showCauses?: boolean;
  max?: number;
}) {
  const [limit, setLimit] = React.useState(max);
  const shown = events.slice(0, limit);
  return (
    <div>
      {shown.map((ev) => (
        <EventLine key={ev.id} ev={ev} showCauses={showCauses} />
      ))}
      {events.length > limit && (
        <button onClick={() => setLimit(limit + 200)}>
          show more ({events.length - limit} hidden)
        </button>
      )}
    </div>
  );
}
