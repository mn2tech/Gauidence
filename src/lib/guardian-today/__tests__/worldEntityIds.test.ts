import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickPreferredWorldEntityId,
  readSemanticEntityIdsFromMetadata,
} from "../worldEntityIds.ts";

describe("World entity ids for Today Ask Gideon", () => {
  it("reads semantic_entity_ids from metadata", () => {
    assert.deepEqual(
      readSemanticEntityIdsFromMetadata({
        semantic_entity_ids: ["e1", "e2"],
      }),
      ["e1", "e2"]
    );
    assert.deepEqual(readSemanticEntityIdsFromMetadata(null), []);
  });

  it("prefers topic entities and title matches", () => {
    const id = pickPreferredWorldEntityId(
      [
        {
          id: "person-1",
          entity_type: "person",
          canonical_name: "Alison Sellner",
        },
        {
          id: "topic-1",
          entity_type: "topic",
          canonical_name: "Resource teacher",
        },
      ],
      "Resource teacher"
    );
    assert.equal(id, "topic-1");
  });
});
