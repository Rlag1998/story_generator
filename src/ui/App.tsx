import React, { useEffect, useMemo, useState } from "react";
import { HashRouter, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { SimController, type SpeedKey } from "./sim";
import { WorldProvider, useWorld } from "./WorldCtx";
import { fmtDate } from "./util";
import { Landing } from "./pages/Landing";
import { WorldPage } from "./pages/WorldPage";
import { PeoplePage } from "./pages/PeoplePage";
import { PersonPage } from "./pages/PersonPage";
import { ChroniclePage, EventPage, StorylinePage, StorylinesPage } from "./pages/ChroniclePage";
import { PolitiesPage, PolityPage, HousesPage, HousePage, SettlementPage } from "./pages/RealmPages";
import { CulturesPage, CulturePage, ReligionPage } from "./pages/CulturePages";
import { FollowedPage } from "./pages/FollowedPage";

export default function App() {
  const [controller, setController] = useState<SimController | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const create = (seed: string, years: number) => {
    setCreating(seed);
    // Let the loading screen paint before the synchronous worldgen.
    setTimeout(() => {
      const c = new SimController(seed);
      if (years > 0) c.fastForward(years);
      setController(c);
      setCreating(null);
    }, 30);
  };

  if (creating != null)
    return (
      <div className="loading">
        <h1>AEONSPIRE</h1>
        <p>Breathing life into “{creating}”…</p>
      </div>
    );

  if (!controller) return <Landing onCreate={create} />;

  return (
    <WorldProvider controller={controller}>
      <HashRouter>
        <Shell onNewWorld={() => setController(null)} />
      </HashRouter>
    </WorldProvider>
  );
}

function Shell({ onNewWorld }: { onNewWorld: () => void }) {
  const { world, controller, version } = useWorld();
  const ff = controller.ff;

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">AEONSPIRE</span>
        <span className="date mono">{fmtDate(world.now)}</span>
        <TimeControls />
        <span className="spacer" />
        <span className="stats">
          seed “{controller.seed}” · {world.stats.alive} alive · {world.events.size} events
        </span>
        <button onClick={onNewWorld} title="abandon this world and seed another">
          new world
        </button>
      </div>
      {ff && (
        <div
          className="ffbar"
          style={{ width: `${Math.round((ff.done / ff.total) * 100)}%` }}
          title="years passing…"
        />
      )}
      <div className="main">
        <Nav />
        <div className="content">
          <Routes>
            <Route path="/" element={<WorldPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/p/:id" element={<PersonPage />} />
            <Route path="/chronicle" element={<ChroniclePage />} />
            <Route path="/ev/:id" element={<EventPage />} />
            <Route path="/stories" element={<StorylinesPage />} />
            <Route path="/story/:id" element={<StorylinePage />} />
            <Route path="/realms" element={<PolitiesPage />} />
            <Route path="/pol/:id" element={<PolityPage />} />
            <Route path="/houses" element={<HousesPage />} />
            <Route path="/h/:id" element={<HousePage />} />
            <Route path="/s/:id" element={<SettlementPage />} />
            <Route path="/peoples" element={<CulturesPage />} />
            <Route path="/c/:id" element={<CulturePage />} />
            <Route path="/r/:id" element={<ReligionPage />} />
            <Route path="/followed" element={<FollowedPage />} />
            <Route path="*" element={<div>Lost in the mists.</div>} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function TimeControls() {
  const { controller, version } = useWorld();
  const speeds: { key: SpeedKey; label: string; title: string }[] = [
    { key: "paused", label: "❚❚", title: "pause" },
    { key: "slow", label: "▶", title: "slow — 2 months/s" },
    { key: "normal", label: "▶▶", title: "8 months/s" },
    { key: "fast", label: "▶▶▶", title: "30 months/s" },
    { key: "blur", label: "⏩", title: "a decade a blink" },
  ];
  return (
    <span className="controls">
      {speeds.map((s) => (
        <button
          key={s.key}
          title={s.title}
          className={controller.speed === s.key && !controller.ff ? "active" : ""}
          onClick={() => controller.setSpeed(s.key)}
        >
          {s.label}
        </button>
      ))}
      <button title="advance one year" onClick={() => controller.fastForward(1)} disabled={!!controller.ff}>
        +1y
      </button>
      <button title="advance ten years" onClick={() => controller.fastForward(10)} disabled={!!controller.ff}>
        +10y
      </button>
      <button title="advance fifty years" onClick={() => controller.fastForward(50)} disabled={!!controller.ff}>
        +50y
      </button>
    </span>
  );
}

function Nav() {
  const links: [string, string][] = [
    ["/", "The World"],
    ["/followed", "Followed ★"],
    ["/people", "People"],
    ["/houses", "Houses"],
    ["/realms", "Realms"],
    ["/peoples", "Peoples & Tongues"],
    ["/stories", "Storylines"],
    ["/chronicle", "Chronicle"],
  ];
  return (
    <nav className="nav">
      <div className="navhead">Observe</div>
      {links.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "on" : "")}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
