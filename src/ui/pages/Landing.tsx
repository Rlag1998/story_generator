import React, { useState } from "react";

const EXAMPLE_SEEDS = [
  "ashes-of-morning",
  "the-ninth-tide",
  "harrowmere",
  "salt-and-sorrow",
  "wolfwinter",
  "the-long-vigil",
];

export function Landing({ onCreate }: { onCreate: (seed: string, years: number) => void }) {
  const [seed, setSeed] = useState("");
  const [years, setYears] = useState(60);

  const go = () => {
    const s = seed.trim() || EXAMPLE_SEEDS[Math.floor(Math.random() * EXAMPLE_SEEDS.length)];
    onCreate(s, years);
  };

  return (
    <div className="landing">
      <h1>AEONSPIRE</h1>
      <div className="tagline">
        Speak a word, and a world is born: its tongues, its gods, its bloodlines, its griefs.
        You do not play this world. You watch it, and it will break your heart.
      </div>
      <div className="row">
        <input
          type="text"
          placeholder="seed — any words you like"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          autoFocus
        />
        <button className="go" onClick={go}>
          Create world
        </button>
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <label className="hint">open the chronicle after</label>
        <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
          <option value={0}>0 years — watch from the founding</option>
          <option value={25}>25 years of history</option>
          <option value={60}>60 years of history</option>
          <option value={120}>120 years of history</option>
          <option value={250}>250 years of history</option>
        </select>
      </div>
      <div className="hint">
        The same seed always births the same centuries, event for event. Try:{" "}
        {EXAMPLE_SEEDS.map((s, i) => (
          <span key={s}>
            {i > 0 && ", "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setSeed(s);
              }}
            >
              {s}
            </a>
          </span>
        ))}
      </div>
    </div>
  );
}
