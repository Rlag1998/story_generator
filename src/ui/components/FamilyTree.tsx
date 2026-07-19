import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import type { Person, PersonId, World } from "../../engine/core/types";
import { useWorld } from "../WorldCtx";
import { Portrait, lifespan } from "../util";

/**
 * Family tree: ancestors above the focus (2 generations), descendants below
 * (up to `maxDepth` generations). Spouse shown beside each descendant node.
 * Layout: post-order subtree widths; HTML nodes over an SVG line layer.
 */

const NODE_W = 108;
const NODE_H = 118;
const GAP_X = 14;
const GAP_Y = 46;

interface Laid {
  id: PersonId;
  spouse: PersonId | null;
  x: number; // center x
  y: number; // top y
  depth: number;
  parentLaid: number | null; // index into nodes
}

function subtreeWidth(world: World, id: PersonId, depth: number, maxDepth: number, seen: Set<PersonId>): number {
  const p = world.people.get(id);
  if (!p) return NODE_W + GAP_X;
  const w = (p.marriages.length > 0 || p.children.length > 0 ? NODE_W * 2 : NODE_W) + GAP_X;
  if (depth >= maxDepth || p.children.length === 0) return w;
  let kids = 0;
  for (const c of p.children) {
    if (seen.has(c)) continue;
    kids += subtreeWidth(world, c, depth + 1, maxDepth, seen);
  }
  return Math.max(w, kids);
}

export function FamilyTree({ focus, maxDepth = 3 }: { focus: Person; maxDepth?: number }) {
  const { world } = useWorld();

  const { nodes, lines, width, height } = useMemo(() => {
    const nodes: Laid[] = [];
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const seen = new Set<PersonId>();

    // Ancestors: father/mother row, grandparents row.
    const gpRow: (PersonId | null)[] = [];
    const parents: (PersonId | null)[] = [focus.father, focus.mother];
    for (const pid of parents) {
      const p = pid != null ? world.people.get(pid) : undefined;
      gpRow.push(p?.father ?? null, p?.mother ?? null);
    }
    const hasGp = gpRow.some((g) => g != null);
    const hasPar = parents.some((g) => g != null);
    const ancRows = (hasGp ? 1 : 0) + (hasPar ? 1 : 0);
    const rootY = ancRows * (NODE_H + GAP_Y);

    // Descendant layout.
    const seenDesc = new Set<PersonId>();
    const totalW = Math.max(700, subtreeWidth(world, focus.id, 0, maxDepth, new Set()));
    let maxDepthSeen = 0;

    function lay(id: PersonId, depth: number, left: number, parentIdx: number | null): number {
      const p = world.people.get(id);
      if (!p || seenDesc.has(id)) return left;
      seenDesc.add(id);
      maxDepthSeen = Math.max(maxDepthSeen, depth);
      const spouse =
        p.marriages.length > 0 ? p.marriages[p.marriages.length - 1].spouse : null;
      const myW = subtreeWidth(world, id, depth, maxDepth, new Set(seenDesc));
      const cx = left + myW / 2;
      const y = rootY + depth * (NODE_H + GAP_Y);
      const idx = nodes.length;
      nodes.push({ id, spouse, x: cx, y, depth, parentLaid: parentIdx });
      if (parentIdx != null) {
        const par = nodes[parentIdx];
        lines.push({ x1: par.x, y1: par.y + NODE_H, x2: cx, y2: y });
      }
      if (depth < maxDepth && p.children.length > 0) {
        let childLeft = left + Math.max(0, (myW - childrenWidth(p)) / 2);
        for (const c of p.children) {
          if (seenDesc.has(c)) continue;
          const cw = subtreeWidth(world, c, depth + 1, maxDepth, new Set(seenDesc));
          lay(c, depth + 1, childLeft, idx);
          childLeft += cw;
        }
      }
      return left + myW;
    }

    function childrenWidth(p: Person): number {
      let w = 0;
      for (const c of p.children) {
        if (seenDesc.has(c)) continue;
        w += subtreeWidth(world, c, 1, maxDepth, new Set(seenDesc));
      }
      return w;
    }

    lay(focus.id, 0, 0, null);

    // Ancestor nodes centered above focus.
    const focusNode = nodes[0];
    if (hasPar) {
      const y = rootY - (NODE_H + GAP_Y);
      const xs = [focusNode.x - NODE_W * 1.2, focusNode.x + NODE_W * 1.2];
      parents.forEach((pid, i) => {
        if (pid == null) return;
        nodes.push({ id: pid, spouse: null, x: xs[i], y, depth: -1, parentLaid: null });
        lines.push({ x1: xs[i], y1: y + NODE_H, x2: focusNode.x, y2: rootY });
      });
      if (hasGp) {
        const gy = y - (NODE_H + GAP_Y);
        const gxs = [
          xs[0] - NODE_W * 0.75,
          xs[0] + NODE_W * 0.75,
          xs[1] - NODE_W * 0.75,
          xs[1] + NODE_W * 0.75,
        ];
        gpRow.forEach((gid, i) => {
          if (gid == null) return;
          nodes.push({ id: gid, spouse: null, x: gxs[i], y: gy, depth: -2, parentLaid: null });
          lines.push({
            x1: gxs[i],
            y1: gy + NODE_H,
            x2: xs[Math.floor(i / 2)],
            y2: y,
          });
        });
      }
    }

    const width = Math.max(totalW, ...nodes.map((n) => n.x + NODE_W)) + 40;
    const height = rootY + (maxDepthSeen + 1) * (NODE_H + GAP_Y) + 20;
    return { nodes, lines, width, height };
  }, [world, focus.id, maxDepth, world.people.size]);

  return (
    <div className="treewrap" style={{ maxHeight: 640 }}>
      <div style={{ position: "relative", width, height }}>
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          {lines.map((l, i) => (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} C ${l.x1} ${l.y1 + 24}, ${l.x2} ${l.y2 - 24}, ${l.x2} ${l.y2}`}
              stroke="var(--line)"
              fill="none"
              strokeWidth={1.5}
            />
          ))}
        </svg>
        {nodes.map((n) => (
          <TreeNode key={`${n.id}:${n.depth}`} laid={n} isFocus={n.id === focus.id} />
        ))}
      </div>
    </div>
  );
}

function TreeNode({ laid, isFocus }: { laid: Laid; isFocus: boolean }) {
  const { world, services } = useWorld();
  const p = world.people.get(laid.id);
  if (!p) return null;
  const spouse = laid.spouse != null ? world.people.get(laid.spouse) : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: laid.x - (spouse ? NODE_W : NODE_W / 2),
        top: laid.y,
        width: spouse ? NODE_W * 2 : NODE_W,
        display: "flex",
        gap: 4,
      }}
    >
      <NodeCard p={p} highlight={isFocus} />
      {spouse && <NodeCard p={spouse} dim />}
    </div>
  );
}

function NodeCard({ p, highlight, dim }: { p: Person; highlight?: boolean; dim?: boolean }) {
  const { world, services } = useWorld();
  return (
    <div
      style={{
        width: NODE_W,
        textAlign: "center",
        padding: 6,
        borderRadius: 6,
        background: highlight ? "var(--panel2)" : "transparent",
        border: highlight ? "1px solid var(--accent2)" : "1px solid transparent",
        opacity: dim ? 0.75 : 1,
      }}
    >
      <Portrait person={p} size={52} />
      <div style={{ fontSize: 12.5, lineHeight: 1.25, marginTop: 4 }}>
        <Link to={`/p/${p.id}`}>{services.narrative.shortName(world, p)}</Link>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>{lifespan(world, p)}</div>
    </div>
  );
}
