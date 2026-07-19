import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useWorld, getFollowed, toggleFollow } from "../WorldCtx";
import { eventsOf } from "../../engine/core/world";
import { HAIR_COLORS, EYE_COLORS, HAIR_TEXTURES, rareTraitDef } from "../../engine/core/appearance";
import { Portrait, PersonLink, PersonRow, EventList, fmtDate, ageAt, lifespan, Banner } from "../util";
import { FamilyTree } from "../components/FamilyTree";

export function PersonPage() {
  const { id } = useParams();
  const { world, services, controller } = useWorld();
  const [tab, setTab] = useState<"life" | "chronicle" | "tree" | "ties">("life");
  const [, setFollowTick] = useState(0);

  const p = world.people.get(Number(id));
  if (!p) return <div>No such soul in the record.</div>;

  const events = eventsOf(world, p.id);
  const age = p.died != null ? ageAt(p, p.died) : ageAt(p, world.now);
  const culture = world.cultures.get(p.culture);
  const religion = world.religions.get(p.religion);
  const house = p.house != null ? world.houses.get(p.house) : undefined;
  const home = p.location != null ? world.settlements.get(p.location) : undefined;
  const followed = getFollowed(controller.seed).includes(p.id);

  const bio = useMemo(() => services.narrative.renderLife(world, p), [p.id, events.length, world.now]);

  const ph = p.phenotype;
  const heightWord =
    ph.heightScore > 1.5 ? "very tall" : ph.heightScore > 0.6 ? "tall" : ph.heightScore < -1.5 ? "very short" : ph.heightScore < -0.6 ? "short" : "of middling height";

  return (
    <div>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Portrait person={p} size={132} link={false} />
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1>
            {services.narrative.shortName(world, p)}{" "}
            <button
              className="follow-btn"
              title={followed ? "unfollow" : "follow this life"}
              onClick={() => {
                toggleFollow(controller.seed, p.id);
                setFollowTick((x) => x + 1);
              }}
            >
              {followed ? "★" : "☆"}
            </button>
          </h1>
          <div className="sub">
            {services.culture.fullName(world, p)}
            {p.nickname ? ` · called "${p.nickname}"` : ""}
          </div>
          <div className="kv">
            <span className="k">years</span>
            <span>
              {lifespan(world, p)} ({age}
              {p.died == null && !p.flags["emigrated"] ? " years old" : p.died != null ? `, died: ${p.deathCause}` : ""})
            </span>
            <span className="k">station</span>
            <span>
              {p.status.titles.length > 0 ? p.status.titles.join(", ") + " · " : ""}
              {p.status.profession} · rank {p.status.rank} · wealth {p.status.wealth}
            </span>
            {house && (
              <>
                <span className="k">house</span>
                <span>
                  <Banner seed={house.bannerSeed} size={16} /> <Link to={`/h/${house.id}`}>{house.name}</Link>
                </span>
              </>
            )}
            <span className="k">people</span>
            <span>
              {culture ? <Link to={`/c/${culture.id}`}>{culture.name}</Link> : "?"} ·{" "}
              {religion ? <Link to={`/r/${religion.id}`}>{religion.name}</Link> : "?"}
            </span>
            {home && (
              <>
                <span className="k">home</span>
                <span>
                  <Link to={`/s/${home.id}`}>{home.name}</Link>
                </span>
              </>
            )}
            <span className="k">notability</span>
            <span className="mono">{Math.round(p.notability)}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            {ph.rareTraits.map((t) => {
              const def = rareTraitDef(t);
              return (
                <span key={t} className="tag rare" title={def?.description}>
                  {def?.name ?? t}
                </span>
              );
            })}
            {p.personality.traits.map((t) => (
              <span key={t} className="tag trait">
                {t}
              </span>
            ))}
            {p.injuries.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            {heightWord}, {HAIR_TEXTURES[ph.hairTexture] ?? "straight"}{" "}
            {HAIR_COLORS[ph.hairColor]?.name ?? "brown"} hair, {EYE_COLORS[ph.eyeColor]?.name ?? "brown"} eyes
            {ph.freckles ? ", freckled" : ""}
            {ph.dimples ? ", dimpled" : ""}
          </div>
        </div>
      </div>

      <div className="controls" style={{ margin: "18px 0 10px" }}>
        {(["life", "chronicle", "tree", "ties"] as const).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t === "life" ? "Life" : t === "chronicle" ? `Chronicle (${events.length})` : t === "tree" ? "Family tree" : "Bonds"}
          </button>
        ))}
      </div>

      {tab === "life" && (
        <div className="grid cols2">
          <div className="panel bio">
            <h2>The life of {p.givenName}</h2>
            {bio.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <div>
            {p.storylines.length > 0 && (
              <div className="panel" style={{ marginBottom: 16 }}>
                <h3>Storylines</h3>
                {p.storylines.map((sid) => {
                  const s = world.storylines.get(sid);
                  if (!s) return null;
                  return (
                    <div key={sid} style={{ margin: "6px 0" }}>
                      <Link to={`/story/${sid}`}>
                        {s.kind}
                        {s.resolved ? ` — ${s.outcome ?? "concluded"}` : " (unfolding)"}
                      </Link>
                      <span className="hint"> · began {fmtDate(s.started)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="panel">
              <h3>Family</h3>
              {p.father != null && <PersonRow id={p.father} meta="father" />}
              {p.mother != null && <PersonRow id={p.mother} meta="mother" />}
              {p.legalFather != null && p.legalFather !== p.father && (
                <PersonRow id={p.legalFather} meta="father in name" />
              )}
              {p.litterMates.length > 0 &&
                p.litterMates.map((m) => <PersonRow key={m} id={m} meta={p.litterMates.length > 1 ? "triplet" : "twin"} />)}
              {p.marriages.map((m) => (
                <PersonRow
                  key={`${m.spouse}:${m.date}`}
                  id={m.spouse}
                  meta={m.active ? `spouse since ${fmtDate(m.date)}` : `former spouse (${m.endReason ?? "ended"})`}
                />
              ))}
              {p.betrothed != null && <PersonRow id={p.betrothed} meta="betrothed" />}
              {p.children.map((c) => {
                const ch = world.people.get(c);
                return <PersonRow key={c} id={c} meta={ch?.died != null ? "child (deceased)" : "child"} />;
              })}
              {p.father == null && p.mother == null && p.children.length === 0 && p.marriages.length === 0 && (
                <div className="hint">No recorded kin.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "chronicle" && (
        <div className="panel">
          <EventList events={[...events].reverse()} showCauses />
        </div>
      )}

      {tab === "tree" && <FamilyTree focus={p} maxDepth={3} />}

      {tab === "ties" && <Bonds personId={p.id} />}
    </div>
  );
}

function Bonds({ personId }: { personId: number }) {
  const { world, services } = useWorld();
  const rels = world.relationships.get(personId);
  const memories = world.memories.get(personId) ?? [];
  const entries = rels ? [...rels.entries()].sort((a, b) => Math.abs(b[1].opinion) - Math.abs(a[1].opinion)) : [];
  return (
    <div className="grid cols2">
      <div className="panel">
        <h3>Bonds</h3>
        {entries.length === 0 && <div className="hint">No strong bonds recorded.</div>}
        {entries.map(([other, rel]) => (
          <PersonRow
            key={other}
            id={other}
            meta={`${rel.kind} · since ${fmtDate(rel.since)} · regard ${rel.opinion > 0 ? "+" : ""}${Math.round(rel.opinion)}`}
          />
        ))}
      </div>
      <div className="panel">
        <h3>What weighs on them</h3>
        {memories.length === 0 && <div className="hint">Nothing recorded weighs on this soul.</div>}
        {[...memories]
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 12)
          .map((m, i) => {
            const ev = world.events.get(m.event);
            if (!ev) return null;
            return (
              <div key={i} className="ev">
                <span className="when">{fmtDate(ev.date)}</span>
                {services.narrative.renderHeadline(world, ev)}
                {m.about != null && (
                  <span className="hint">
                    {" "}
                    · concerning <PersonLink id={m.about} />
                  </span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
