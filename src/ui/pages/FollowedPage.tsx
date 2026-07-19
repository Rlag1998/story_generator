import React, { useMemo } from "react";
import { useWorld, getFollowed } from "../WorldCtx";
import { eventsOf } from "../../engine/core/world";
import { PersonRow, EventList } from "../util";

/** The observer's pinned lives: latest happenings for each followed person. */
export function FollowedPage() {
  const { world, controller } = useWorld();
  const ids = getFollowed(controller.seed);
  const followed = ids.map((id) => world.people.get(id)).filter(Boolean);

  return (
    <div>
      <h1>Followed lives</h1>
      <div className="sub">
        Star a person (☆) on their page and their story gathers here as it unfolds.
      </div>
      {followed.length === 0 && (
        <div className="hint">
          You follow no one yet. Find an unusual soul among the People and press the star.
        </div>
      )}
      {followed.map((p) => {
        const evs = eventsOf(world, p!.id).reverse().slice(0, 8);
        return (
          <div className="panel" key={p!.id} style={{ marginBottom: 16 }}>
            <PersonRow id={p!.id} />
            <EventList events={evs} showCauses={false} max={8} />
          </div>
        );
      })}
    </div>
  );
}
