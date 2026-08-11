"use client";

import type { OntologyEntity, OntologyRelationship } from "@/lib/ontology/types";

export type SpaceGraphData = {
  entities: OntologyEntity[];
  relationships: OntologyRelationship[];
  truncated?: boolean;
};

type Props = {
  graph: SpaceGraphData;
  selectedId?: string | null;
  onSelectEntity?: (entityId: string) => void;
};

type LayoutNode = {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  degree: number;
};

function truncate(label: string, max = 18): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Deterministic circular / ring layout by degree (no graph library). */
function layoutNodes(entities: OntologyEntity[], relationships: OntologyRelationship[]) {
  const degree = new Map<string, number>();
  for (const e of entities) degree.set(e.id, 0);
  for (const r of relationships) {
    degree.set(r.source_entity_id, (degree.get(r.source_entity_id) ?? 0) + 1);
    degree.set(r.target_entity_id, (degree.get(r.target_entity_id) ?? 0) + 1);
  }

  const sorted = [...entities].sort(
    (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0)
  );

  const n = sorted.length;
  const width = Math.max(720, Math.min(1200, 280 + n * 28));
  const height = Math.max(520, Math.min(900, 240 + n * 22));
  const cx = width / 2;
  const cy = height / 2;

  const nodes: LayoutNode[] = [];
  if (n === 0) return { nodes, width, height };

  if (n === 1) {
    const only = sorted[0]!;
    nodes.push({
      id: only.id,
      label: only.name,
      type: only.entity_type,
      x: cx,
      y: cy,
      degree: degree.get(only.id) ?? 0,
    });
    return { nodes, width, height };
  }

  // Hub(s) near center; everyone else on rings.
  const hubCount = Math.min(3, Math.max(1, Math.floor(n / 12)));
  const hubs = sorted.slice(0, hubCount);
  const rest = sorted.slice(hubCount);

  hubs.forEach((entity, i) => {
    const angle = (i / hubs.length) * Math.PI * 2 - Math.PI / 2;
    const r = hubs.length === 1 ? 0 : 56;
    nodes.push({
      id: entity.id,
      label: entity.name,
      type: entity.entity_type,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      degree: degree.get(entity.id) ?? 0,
    });
  });

  const ringCapacity = Math.max(8, Math.ceil(Math.sqrt(rest.length) * 3));
  let index = 0;
  let ring = 0;
  while (index < rest.length) {
    const slice = rest.slice(index, index + ringCapacity);
    const radius = 130 + ring * 110;
    slice.forEach((entity, i) => {
      const angle = (i / slice.length) * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        id: entity.id,
        label: entity.name,
        type: entity.entity_type,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        degree: degree.get(entity.id) ?? 0,
      });
    });
    index += ringCapacity;
    ring += 1;
  }

  return { nodes, width, height };
}

/** Space-wide ontology map (all visible edges, capped). */
export default function OntologySpaceMap({
  graph,
  selectedId,
  onSelectEntity,
}: Props) {
  const { entities, relationships, truncated } = graph;

  if (!entities.length) {
    return (
      <p className="text-sm text-ink-muted">
        No entities to map yet. Backfill documents or wait for extraction.
      </p>
    );
  }

  const { nodes, width, height } = layoutNodes(entities, relationships);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nodeW = 112;
  const nodeH = 40;

  return (
    <div className="overflow-auto rounded-lg border border-stone-200 bg-gradient-to-b from-stone-50 to-white">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[640px]"
        role="img"
        aria-label="Space ontology map"
      >
        <defs>
          <marker
            id="space-ontology-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L6,3 L0,6 Z" fill="#a8a29e" />
          </marker>
        </defs>

        {relationships.map((rel) => {
          const from = byId.get(rel.source_entity_id);
          const to = byId.get(rel.target_entity_id);
          if (!from || !to) return null;
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          return (
            <g key={rel.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#e7e5e4"
                strokeWidth="1.25"
                markerEnd="url(#space-ontology-arrow)"
              />
              <text
                x={midX}
                y={midY - 4}
                textAnchor="middle"
                className="fill-stone-400"
                style={{ fontSize: 7, fontFamily: "ui-monospace, monospace" }}
              >
                {truncate(rel.relationship_type, 16)}
              </text>
            </g>
          );
        })}

        {nodes.map((node) => {
          const selected = node.id === selectedId;
          const isHub = node.degree >= 3;
          const fill = selected ? "#0f766e" : isHub ? "#134e4a" : "#ffffff";
          const stroke = selected || isHub ? "#0f766e" : "#d6d3d1";
          const titleFill = selected || isHub ? "#ffffff" : "#1c1917";
          const typeFill = selected || isHub ? "#ccfbf1" : "#78716c";

          return (
            <g
              key={node.id}
              transform={`translate(${node.x - nodeW / 2}, ${node.y - nodeH / 2})`}
              style={{ cursor: onSelectEntity ? "pointer" : "default" }}
              onClick={() => onSelectEntity?.(node.id)}
            >
              <rect
                width={nodeW}
                height={nodeH}
                rx={10}
                fill={fill}
                stroke={stroke}
                strokeWidth={selected ? 2 : 1}
              />
              <text
                x={nodeW / 2}
                y={16}
                textAnchor="middle"
                fill={titleFill}
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {truncate(node.label)}
              </text>
              <text
                x={nodeW / 2}
                y={30}
                textAnchor="middle"
                fill={typeFill}
                style={{ fontSize: 8 }}
              >
                {node.type}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="border-t border-stone-100 px-3 py-2 text-[11px] text-ink-muted">
        Space map · {entities.length} entities · {relationships.length} links
        {truncated ? " · truncated for size" : ""} · click a node for details
      </p>
    </div>
  );
}
