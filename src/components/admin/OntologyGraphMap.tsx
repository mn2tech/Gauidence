"use client";

import type { EntityGraph } from "@/lib/ontology/types";

type Props = {
  graph: EntityGraph;
  onSelectEntity?: (entityId: string) => void;
};

type LayoutNode = {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  kind: "center" | "outgoing" | "incoming";
};

type LayoutEdge = {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label: string;
};

function truncate(label: string, max = 22): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function fanPositions(
  count: number,
  centerX: number,
  y: number,
  spacing: number
): number[] {
  if (count <= 0) return [];
  if (count === 1) return [centerX];
  const width = (count - 1) * spacing;
  const start = centerX - width / 2;
  return Array.from({ length: count }, (_, i) => start + i * spacing);
}

/** Lightweight one-hop SVG map — no graph library dependency. */
export default function OntologyGraphMap({ graph, onSelectEntity }: Props) {
  const outgoing = graph.outgoingRelationships.filter((r) => r.targetEntity);
  const incoming = graph.incomingRelationships.filter((r) => r.sourceEntity);

  if (!outgoing.length && !incoming.length) {
    return (
      <p className="text-xs text-ink-muted">
        No relationships to map for this entity yet.
      </p>
    );
  }

  const width = 640;
  const height = incoming.length && outgoing.length ? 360 : 280;
  const centerX = width / 2;
  const centerY = height / 2;
  const nodeW = 128;
  const nodeH = 44;
  const spacing = Math.min(150, Math.max(110, width / Math.max(outgoing.length, incoming.length, 1) / 1.1));

  const nodes: LayoutNode[] = [
    {
      id: graph.entity.id,
      label: graph.entity.name,
      type: graph.entity.entity_type,
      x: centerX,
      y: centerY,
      kind: "center",
    },
  ];

  const outXs = fanPositions(outgoing.length, centerX, centerY + 110, spacing);
  outgoing.forEach((rel, i) => {
    nodes.push({
      id: rel.targetEntity.id,
      label: rel.targetEntity.name,
      type: rel.targetEntity.entity_type,
      x: outXs[i]!,
      y: centerY + 110,
      kind: "outgoing",
    });
  });

  const inXs = fanPositions(incoming.length, centerX, centerY - 110, spacing);
  incoming.forEach((rel, i) => {
    nodes.push({
      id: rel.sourceEntity.id,
      label: rel.sourceEntity.name,
      type: rel.sourceEntity.entity_type,
      x: inXs[i]!,
      y: centerY - 110,
      kind: "incoming",
    });
  });

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: LayoutEdge[] = [];

  for (const rel of outgoing) {
    const target = nodeById.get(rel.targetEntity.id);
    if (!target) continue;
    edges.push({
      id: rel.id,
      fromX: centerX,
      fromY: centerY + nodeH / 2,
      toX: target.x,
      toY: target.y - nodeH / 2,
      label: rel.relationship_type,
    });
  }

  for (const rel of incoming) {
    const source = nodeById.get(rel.sourceEntity.id);
    if (!source) continue;
    edges.push({
      id: rel.id,
      fromX: source.x,
      fromY: source.y + nodeH / 2,
      toX: centerX,
      toY: centerY - nodeH / 2,
      label: rel.relationship_type,
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-gradient-to-b from-stone-50 to-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[480px]"
        role="img"
        aria-label={`One-hop map for ${graph.entity.name}`}
      >
        <defs>
          <marker
            id="ontology-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="#a8a29e" />
          </marker>
        </defs>

        {edges.map((edge) => {
          const midX = (edge.fromX + edge.toX) / 2;
          const midY = (edge.fromY + edge.toY) / 2;
          return (
            <g key={edge.id}>
              <line
                x1={edge.fromX}
                y1={edge.fromY}
                x2={edge.toX}
                y2={edge.toY}
                stroke="#d6d3d1"
                strokeWidth="1.5"
                markerEnd="url(#ontology-arrow)"
              />
              <rect
                x={midX - 42}
                y={midY - 9}
                width={84}
                height={16}
                rx={4}
                fill="white"
                stroke="#e7e5e4"
              />
              <text
                x={midX}
                y={midY + 3}
                textAnchor="middle"
                className="fill-stone-500"
                style={{ fontSize: 8, fontFamily: "ui-monospace, monospace" }}
              >
                {truncate(edge.label, 14)}
              </text>
            </g>
          );
        })}

        {nodes.map((node) => {
          const isCenter = node.kind === "center";
          const fill = isCenter ? "#0f766e" : "#ffffff";
          const stroke = isCenter ? "#0f766e" : "#d6d3d1";
          const titleFill = isCenter ? "#ffffff" : "#1c1917";
          const typeFill = isCenter ? "#ccfbf1" : "#78716c";
          const clickable = !isCenter && Boolean(onSelectEntity);

          return (
            <g
              key={`${node.kind}-${node.id}`}
              transform={`translate(${node.x - nodeW / 2}, ${node.y - nodeH / 2})`}
              style={{ cursor: clickable ? "pointer" : "default" }}
              onClick={() => {
                if (clickable && onSelectEntity) onSelectEntity(node.id);
              }}
            >
              <rect
                width={nodeW}
                height={nodeH}
                rx={10}
                fill={fill}
                stroke={stroke}
                strokeWidth={isCenter ? 0 : 1}
              />
              <text
                x={nodeW / 2}
                y={18}
                textAnchor="middle"
                fill={titleFill}
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {truncate(node.label)}
              </text>
              <text
                x={nodeW / 2}
                y={33}
                textAnchor="middle"
                fill={typeFill}
                style={{ fontSize: 9 }}
              >
                {node.type}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="border-t border-stone-100 px-3 py-2 text-[11px] text-ink-muted">
        One-hop map · click a connected entity to open it
      </p>
    </div>
  );
}
