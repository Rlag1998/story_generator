import React from "react";
import { Link, useParams } from "react-router-dom";
import { useWorld } from "../WorldCtx";
import { sortedIds } from "../../engine/core/world";

export function CulturesPage() {
  const { world } = useWorld();
  return (
    <div>
      <h1>Peoples</h1>
      <div className="sub">Each with its own tongue, customs, and gods. No two worlds share them.</div>
      <div className="grid cols2">
        {sortedIds(world.cultures).map((id) => {
          const c = world.cultures.get(id)!;
          const lang = world.languages.get(c.language);
          return (
            <div className="panel" key={id}>
              <h2>
                <Link to={`/c/${id}`}>{c.name}</Link>
              </h2>
              <div className="kv">
                <span className="k">tongue</span>
                <span>{lang?.name}</span>
                <span className="k">holds dear</span>
                <span>{c.values.join(", ")}</span>
                <span className="k">descent</span>
                <span>
                  {c.descent} · {c.inheritance}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CulturePage() {
  const { id } = useParams();
  const { world } = useWorld();
  const c = world.cultures.get(Number(id));
  if (!c) return <div>No such people.</div>;
  const lang = world.languages.get(c.language);
  const faiths = [...world.religions.values()].filter((r) => r.origin === c.id);
  const members = [...world.people.values()].filter((p) => p.culture === c.id && p.died == null);
  return (
    <div>
      <h1>{c.name}</h1>
      <div className="sub">
        {members.length} living · speak {lang?.name}
        {c.parent != null && (
          <>
            {" · offshoot of "}
            <Link to={`/c/${c.parent}`}>{world.cultures.get(c.parent)?.name}</Link>
          </>
        )}
      </div>
      <div className="grid cols2">
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h3>Ways</h3>
            <div className="kv">
              <span className="k">holds dear</span>
              <span>{c.values.join(", ")}</span>
              <span className="k">marriage</span>
              <span>{c.marriage.replace(/-/g, " ")}</span>
              <span className="k">descent</span>
              <span>{c.descent}</span>
              <span className="k">inheritance</span>
              <span>{c.inheritance}</span>
              <span className="k">names</span>
              <span>{c.nameOrder.replace(/-/g, " ")}</span>
              <span className="k">adulthood</span>
              <span>at {c.adulthoodAge}</span>
              <span className="k">temperament</span>
              <span>
                {c.attitudes.violence > 0.6 ? "quick to steel" : c.attitudes.violence < 0.3 ? "slow to steel" : "measured"}
                {" · "}
                {c.attitudes.mysticism > 0.6 ? "omen-haunted" : c.attitudes.mysticism < 0.3 ? "clear-eyed" : "half-believing"}
                {" · "}
                {c.attitudes.openness > 0.6 ? "open-armed to strangers" : c.attitudes.openness < 0.3 ? "wary of strangers" : "watchful"}
              </span>
            </div>
          </div>
          <div className="panel">
            <h3>Faiths born here</h3>
            {faiths.map((r) => (
              <div key={r.id}>
                <Link to={`/r/${r.id}`}>{r.name}</Link>
                {r.parent != null && <span className="hint"> (schism)</span>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="panel" style={{ marginBottom: 16 }}>
            <h3>Traditions</h3>
            {c.traditions.map((t) => (
              <div key={t.key} style={{ marginBottom: 8 }}>
                <b>{t.name}</b>
                <div className="hint">{t.description}</div>
              </div>
            ))}
          </div>
          {lang && (
            <div className="panel">
              <h3>The {lang.name} tongue</h3>
              <div className="kv">
                <span className="k">months</span>
                <span>{lang.monthNames.join(" · ")}</span>
                <span className="k">words</span>
                <span className="hint">
                  {Object.entries(lang.lexicon)
                    .slice(0, 14)
                    .map(([k, v]) => `${v} “${k}”`)
                    .join(", ")}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReligionPage() {
  const { id } = useParams();
  const { world, services } = useWorld();
  const r = world.religions.get(Number(id));
  if (!r) return <div>No such faith.</div>;
  const followers = [...world.people.values()].filter((p) => p.religion === r.id && p.died == null);
  const founder = r.founder != null ? world.people.get(r.founder) : undefined;
  return (
    <div>
      <h1>{r.name}</h1>
      <div className="sub">
        {r.shape} faith · {followers.length} living faithful · clergy: {r.clergyTitle}
        {r.clergyCelibate ? " (celibate)" : ""}
        {r.parent != null && (
          <>
            {" · schism of "}
            <Link to={`/r/${r.parent}`}>{world.religions.get(r.parent)?.name}</Link>
          </>
        )}
        {founder && (
          <>
            {" · founded by "}
            <Link to={`/p/${founder.id}`}>{services.narrative.shortName(world, founder)}</Link>
          </>
        )}
      </div>
      <div className="grid cols2">
        <div>
          {r.deities.length > 0 && (
            <div className="panel" style={{ marginBottom: 16 }}>
              <h3>The divine</h3>
              {r.deities.map((d) => (
                <div key={d.id} style={{ marginBottom: 6 }}>
                  <b>{d.name}</b>, {d.epithet}
                  <div className="hint">
                    {d.domains.join(", ")} · {d.temper}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="panel">
            <h3>Tenets</h3>
            {r.tenets.map((t, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                “{t}”
              </div>
            ))}
            <div className="kv" style={{ marginTop: 10 }}>
              <span className="k">virtues</span>
              <span>{r.virtues.join(", ")}</span>
              <span className="k">sins</span>
              <span>{r.sins.join(", ")}</span>
              <span className="k">the dead</span>
              <span>{r.funeralRite}</span>
              <span className="k">beyond</span>
              <span>{r.afterlife}</span>
            </div>
          </div>
        </div>
        <div className="panel">
          <h3>Holy days</h3>
          {r.holyDays.map((h, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <b>{h.name}</b> <span className="hint">— month {h.month}, {h.theme}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
