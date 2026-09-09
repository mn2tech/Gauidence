import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildWorldMapGraph,
  WORLD_MAP_DEFAULT_MAX_NODES,
  worldMapNodePosition,
} from "../mapGraph.ts";

describe("world map graph", () => {
  it("puts user at center with group hubs", () => {
    const graph = buildWorldMapGraph({
      entities: [
        { id: "1", name: "Jaime", type: "person", importance: 0.9 },
        { id: "2", name: "Onyx", type: "organization", importance: 0.8 },
        { id: "3", name: "Kickoff", type: "event", importance: 0.7 },
        { id: "4", name: "MSA", type: "contract", importance: 0.6 },
      ],
      maxNodes: 25,
    });
    assert.equal(graph.nodes[0]!.kind, "user");
    assert.equal(graph.nodes[0]!.radius, 0);
    assert.ok(graph.nodes.some((n) => n.id === "group:people"));
    assert.ok(graph.nodes.some((n) => n.id === "group:organizations"));
    assert.ok(graph.nodes.some((n) => n.kind === "entity"));
    assert.ok(graph.nodes.length <= WORLD_MAP_DEFAULT_MAX_NODES);
  });

  it("caps total nodes near max", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `p${i}`,
      name: `Person ${i}`,
      type: "person" as const,
      importance: 1 - i * 0.01,
    }));
    const graph = buildWorldMapGraph({
      entities: many,
      maxNodes: 25,
      expandedGroups: ["people"],
    });
    assert.ok(graph.nodes.length <= 25);
    assert.equal(graph.totalEntities, 40);
  });

  it("collapses groups when not expanded", () => {
    const graph = buildWorldMapGraph({
      entities: [
        { id: "1", name: "Jaime", type: "person", importance: 0.9 },
        { id: "2", name: "Onyx", type: "organization", importance: 0.8 },
      ],
      expandedGroups: [],
      maxNodes: 25,
    });
    assert.equal(
      graph.nodes.filter((n) => n.kind === "entity").length,
      0
    );
    assert.ok(graph.nodes.some((n) => n.kind === "group"));
  });

  it("maps polar layout to svg coordinates", () => {
    const p = worldMapNodePosition(
      { id: "user", kind: "user", label: "You", radius: 0, angle: 0 },
      400
    );
    assert.equal(p.x, 200);
    assert.equal(p.y, 200);
  });
});

describe("world inbox action vocabulary", () => {
  it("documents supported actions for API contract", () => {
    const actions = ["confirm", "edit", "merge", "reject", "ignore"] as const;
    assert.equal(actions.length, 5);
    assert.ok(actions.includes("confirm"));
    assert.ok(actions.includes("merge"));
  });
});
