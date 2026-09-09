import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  askAboutWorldEntityHref,
  worldEntityGroup,
  worldEntityHref,
  worldEntityTypeLabel,
} from "../labels.ts";
import { filterEntitiesByAuthorizedSpaces } from "../authFilter.ts";
import type { SemanticEntity } from "../../semantic/types.ts";

function fakeEntity(
  id: string,
  name: string,
  type = "person"
): SemanticEntity {
  return {
    id,
    user_id: "u1",
    canonical_name: name,
    entity_type: type,
    normalized_name: name.toLowerCase(),
    description: null,
    aliases: [],
    attributes: {},
    confidence: 0.9,
    first_seen_at: null,
    last_seen_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("world consumer labels", () => {
  it("groups entity types for tabs", () => {
    assert.equal(worldEntityGroup("person"), "people");
    assert.equal(worldEntityGroup("organization"), "organizations");
    assert.equal(worldEntityGroup("client"), "organizations");
    assert.equal(worldEntityGroup("event"), "events");
    assert.equal(worldEntityGroup("contract"), "things");
  });

  it("uses consumer type labels", () => {
    assert.equal(worldEntityTypeLabel("person"), "Person");
    assert.equal(worldEntityTypeLabel("location"), "Place");
    assert.ok(!worldEntityTypeLabel("person").includes("entity"));
  });

  it("builds Ask Gideon deep link with worldEntityId", () => {
    const href = askAboutWorldEntityHref({
      entityId: "abc-123",
      entityName: "Onyx",
      spaceId: "space-1",
    });
    assert.ok(href.startsWith("/ask?"));
    assert.ok(href.includes("worldEntityId=abc-123"));
    assert.ok(href.includes("profileId=space-1"));
    assert.ok(decodeURIComponent(href).includes("Onyx"));
  });

  it("builds entity page path", () => {
    assert.equal(worldEntityHref("e1"), "/world/e1");
  });
});

describe("world retrieval authorization", () => {
  it("search-style visibility respects Space evidence", () => {
    const entities = [
      fakeEntity("visible", "Jaime"),
      fakeEntity("hidden", "Secret Contact"),
    ];
    const entityEvidenceSpaces = new Map<string, Array<string | null>>([
      ["visible", ["space-a"]],
      ["hidden", ["space-b"]],
    ]);
    const visible = filterEntitiesByAuthorizedSpaces({
      entities,
      entityEvidenceSpaces,
      authorizedSpaceIds: new Set(["space-a"]),
    });
    assert.deepEqual(
      visible.map((e) => e.id),
      ["visible"]
    );
  });
});
