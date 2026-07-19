import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useWorld } from "../WorldCtx";
import { sortedIds } from "../../engine/core/world";

const BIOME_COLOR: Record<string, string> = {
  coast: "#3d5a6b",
  plains: "#6b6b3d",
  forest: "#3d5a3d",
  hills: "#6b553d",
  mountains: "#5c5c60",
  marsh: "#44584a",
  steppe: "#70603a",
  highlands: "#54495e",
};

/** Abstract region-graph map: regions as organic blobs, settlements as dots. */
export function MapSvg({ height = 420 }: { height?: number }) {
  const { world, services } = useWorld();
  const nav = useNavigate();

  const polityColor = useMemo(() => {
    const colors = ["#c9973f", "#7d5a9e", "#b0472f", "#4c7a8c", "#6a8a4c", "#a06a8a", "#8a7a4c"];
    const map = new Map<number, string>();
    sortedIds(world.polities).forEach((id, i) => map.set(id, colors[i % colors.length]));
    return map;
  }, [world.polities.size]);

  const regions = sortedIds(world.regions).map((id) => world.regions.get(id)!);

  return (
    <svg
      viewBox="0 0 100 78"
      style={{ width: "100%", height, background: "#12100d", borderRadius: 6 }}
    >
      {/* adjacency roads */}
      {regions.map((r) =>
        r.adjacent
          .filter((b) => b > r.id)
          .map((b) => {
            const rb = world.regions.get(b)!;
            return (
              <line
                key={`${r.id}-${b}`}
                x1={r.x}
                y1={r.y * 0.78}
                x2={rb.x}
                y2={rb.y * 0.78}
                stroke="#2a261e"
                strokeWidth={0.5}
                strokeDasharray="1.2 0.9"
              />
            );
          }),
      )}
      {regions.map((r) => {
        const settlements = r.settlements.map((s) => world.settlements.get(s)!);
        const polity = settlements[0] ? world.settlements.get(settlements[0].id)!.polity : 0;
        const pc = polityColor.get(polity) ?? "#666";
        return (
          <g key={r.id}>
            <ellipse
              cx={r.x}
              cy={r.y * 0.78}
              rx={9.5}
              ry={7}
              fill={BIOME_COLOR[r.biome] ?? "#444"}
              opacity={0.5}
              stroke={pc}
              strokeWidth={0.4}
            />
            <text
              x={r.x}
              y={r.y * 0.78 - 8}
              textAnchor="middle"
              fontSize={2.6}
              fill="var(--ink-dim)"
              style={{ fontFamily: "var(--serif)" }}
            >
              {r.name}
            </text>
            {settlements.map((s, i) => {
              const ang = (i / Math.max(1, settlements.length)) * Math.PI * 2 + r.id;
              const sx = r.x + Math.cos(ang) * 4.5;
              const sy = r.y * 0.78 + Math.sin(ang) * 3.2;
              const big = s.kind === "city" || s.kind === "town" || s.kind === "stronghold";
              return (
                <g
                  key={s.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => nav(`/s/${s.id}`)}
                >
                  <circle cx={sx} cy={sy} r={big ? 1.3 : 0.8} fill={pc} stroke="#0008" strokeWidth={0.2} />
                  <text
                    x={sx}
                    y={sy + 2.6}
                    textAnchor="middle"
                    fontSize={1.9}
                    fill="var(--ink-faint)"
                    style={{ fontFamily: "var(--serif)" }}
                  >
                    {s.name}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
