import React, { useMemo, useState } from "react";
import { useWorld } from "../WorldCtx";
import { RARE_TRAITS } from "../../engine/core/appearance";
import { PersonCard } from "../util";
import { sortedIds } from "../../engine/core/world";

type SortKey = "notability" | "age" | "recent";

export function PeoplePage() {
  const { world, services } = useWorld();
  const [q, setQ] = useState("");
  const [aliveOnly, setAliveOnly] = useState(true);
  const [culture, setCulture] = useState<number>(0);
  const [rare, setRare] = useState("");
  const [unusual, setUnusual] = useState(false);
  const [sort, setSort] = useState<SortKey>("notability");

  const results = useMemo(() => {
    let list = [...world.people.values()];
    if (aliveOnly) list = list.filter((p) => p.died == null && !p.flags["emigrated"]);
    if (culture) list = list.filter((p) => p.culture === culture);
    if (rare) list = list.filter((p) => p.phenotype.rareTraits.includes(rare));
    if (unusual)
      list = list.filter(
        (p) =>
          p.phenotype.rareTraits.length > 0 ||
          p.litterMates.length > 0 ||
          p.epithet !== "" ||
          Object.values(p.phenotype.aptitudes).some((a) => (a ?? 0) >= 3),
      );
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((p) =>
        (p.givenName + " " + p.surname + " " + p.epithet + " " + p.nickname).toLowerCase().includes(needle),
      );
    }
    switch (sort) {
      case "notability":
        list.sort((a, b) => b.notability - a.notability);
        break;
      case "age":
        list.sort((a, b) => a.born - b.born);
        break;
      case "recent":
        list.sort((a, b) => b.born - a.born);
        break;
    }
    return list.slice(0, 96);
  }, [world.now, world.people.size, q, aliveOnly, culture, rare, unusual, sort]);

  return (
    <div>
      <h1>People</h1>
      <div className="sub">Search the living and the dead. The unusual are worth following.</div>
      <div className="searchbar">
        <input type="text" placeholder="name or epithet…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={culture} onChange={(e) => setCulture(Number(e.target.value))}>
          <option value={0}>every people</option>
          {sortedIds(world.cultures).map((id) => (
            <option key={id} value={id}>
              {world.cultures.get(id)!.name}
            </option>
          ))}
        </select>
        <select value={rare} onChange={(e) => setRare(e.target.value)}>
          <option value="">any blood</option>
          {RARE_TRAITS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="notability">most storied</option>
          <option value="age">eldest first</option>
          <option value="recent">newest first</option>
        </select>
        <button className={aliveOnly ? "active" : ""} onClick={() => setAliveOnly(!aliveOnly)}>
          living only
        </button>
        <button className={unusual ? "active" : ""} onClick={() => setUnusual(!unusual)} title="rare traits, twins, epithets, prodigies">
          unusual souls
        </button>
      </div>
      <div className="cardgrid">
        {results.map((p) => (
          <PersonCard
            key={p.id}
            id={p.id}
            note={`${p.status.profession}${p.notability > 0 ? ` · ${Math.round(p.notability)}` : ""}`}
          />
        ))}
      </div>
      {results.length === 0 && <div className="hint">No one matches. Loosen the net.</div>}
    </div>
  );
}
