import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  connectorCitationDocumentId,
  isConnectorCitationDocumentId,
} from "../connectorCitationIds.ts";

describe("connectorCitationDocumentId", () => {
  it("prefixes item ids so they never collide with vault UUIDs", () => {
    const id = connectorCitationDocumentId(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    );
    assert.equal(id, "connector:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    assert.equal(isConnectorCitationDocumentId(id), true);
    assert.equal(
      isConnectorCitationDocumentId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
      false
    );
  });
});
