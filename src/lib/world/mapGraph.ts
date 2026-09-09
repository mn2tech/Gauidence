/**
 * Pure World Map graph builder — user at center, groups, capped entities.
 */

import { worldEntityGroup, worldEntityTypeLabel } from "./labels";

export type WorldMapEntityInput = {
  id: string;
  name: string;
  type: string;
  importance?: number | null;
  description?: string | null;
};

export type WorldMapNodeKind = "user" | "group" | "entity";

export type WorldMapNode = {
  id: string;
  kind: WorldMapNodeKind;
  label: string;
  group?: "people" | "organizations" | "events" | "things";
  entityId?: string;
  typeLabel?: string;
  /** Polar layout helpers (0..1 radius, radians angle). */
  radius: number;
  angle: number;
  childCount?: number;
};

export type WorldMapEdge = {
  from: string;
  to: string;
};

export type WorldMapGraph = {
  nodes: WorldMapNode[];
  edges: WorldMapEdge[];
  /** Total entity candidates before capping. */
  totalEntities: number;
  maxNodes: number;
};

export const WORLD_MAP_DEFAULT_MAX_NODES = 25;

const GROUP_ORDER = [
  "people",
  "organizations",
  "events",
  "things",
] as const;

const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], string> = {
  people: "People",
  organizations: "Organizations",
  events: "Events",
  things: "Things",
};

/**
 * Build a hierarchical map: You → groups → important entities.
 * Caps total nodes (~25 by default). Expand via `expandedGroups`.
 */
export function buildWorldMapGraph(args: {
  entities: WorldMapEntityInput[];
  expandedGroups?: Array<"people" | "organizations" | "events" | "things">;
  maxNodes?: number;
  userLabel?: string;
}): WorldMapGraph {
  const maxNodes = Math.max(
    5,
    Math.min(args.maxNodes ?? WORLD_MAP_DEFAULT_MAX_NODES, 40)
  );
  const expanded = new Set(
    args.expandedGroups === undefined
      ? [...GROUP_ORDER]
      : args.expandedGroups
  );

  const byGroup: Record<
    (typeof GROUP_ORDER)[number],
    WorldMapEntityInput[]
  > = {
    people: [],
    organizations: [],
    events: [],
    things: [],
  };

  for (const e of args.entities) {
    const g = worldEntityGroup(e.type);
    byGroup[g].push(e);
  }

  for (const g of GROUP_ORDER) {
    byGroup[g].sort(
      (a, b) => (b.importance ?? 0) - (a.importance ?? 0) || a.name.localeCompare(b.name)
    );
  }

  const nodes: WorldMapNode[] = [
    {
      id: "user",
      kind: "user",
      label: args.userLabel?.trim() || "You",
      radius: 0,
      angle: 0,
    },
  ];
  const edges: WorldMapEdge[] = [];

  // Reserve slots: 1 user + up to 4 groups
  const groupSlots = GROUP_ORDER.filter((g) => byGroup[g].length > 0);
  let remaining = maxNodes - 1 - groupSlots.length;

  groupSlots.forEach((g, i) => {
    const groupId = `group:${g}`;
    const angle = (i / Math.max(groupSlots.length, 1)) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      id: groupId,
      kind: "group",
      label: GROUP_LABEL[g],
      group: g,
      radius: 0.42,
      angle,
      childCount: byGroup[g].length,
    });
    edges.push({ from: "user", to: groupId });
  });

  if (remaining < 0) remaining = 0;

  // Distribute entity slots across expanded groups with content
  const expandable = groupSlots.filter((g) => expanded.has(g));
  const perGroup =
    expandable.length > 0
      ? Math.max(1, Math.floor(remaining / expandable.length))
      : 0;
  let leftover = expandable.length > 0 ? remaining % expandable.length : 0;

  for (const g of expandable) {
    const budget = perGroup + (leftover > 0 ? 1 : 0);
    if (leftover > 0) leftover -= 1;
    const picks = byGroup[g].slice(0, budget);
    const groupId = `group:${g}`;
    const groupNode = nodes.find((n) => n.id === groupId);
    const baseAngle = groupNode?.angle ?? 0;

    picks.forEach((e, idx) => {
      const spread = Math.min(1.1, 0.35 + picks.length * 0.08);
      const angle =
        baseAngle - spread / 2 + (picks.length === 1 ? 0 : (idx / (picks.length - 1 || 1)) * spread);
      const nodeId = `entity:${e.id}`;
      nodes.push({
        id: nodeId,
        kind: "entity",
        label: e.name,
        group: g,
        entityId: e.id,
        typeLabel: worldEntityTypeLabel(e.type),
        radius: 0.78,
        angle,
      });
      edges.push({ from: groupId, to: nodeId });
    });
  }

  return {
    nodes,
    edges,
    totalEntities: args.entities.length,
    maxNodes,
  };
}

/** Convert polar node layout to SVG coordinates. */
export function worldMapNodePosition(
  node: WorldMapNode,
  size: number
): { x: number; y: number } {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.42;
  const r = node.radius * maxR;
  return {
    x: cx + r * Math.cos(node.angle),
    y: cy + r * Math.sin(node.angle),
  };
}
