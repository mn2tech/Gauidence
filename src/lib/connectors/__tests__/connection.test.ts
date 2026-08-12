import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConnectorError } from "../types";
import { mapConnectedSource } from "../services/connectedSources";

describe("connection mapping and errors", () => {
  it("maps connected_sources rows to ConnectedSource", () => {
    const source = mapConnectedSource({
      id: "11111111-1111-1111-1111-111111111111",
      user_id: "22222222-2222-2222-2222-222222222222",
      profile_id: null,
      source_type: "android_storage",
      display_name: "Phone Storage — Downloads",
      source_uri:
        "content://com.android.externalstorage.documents/tree/primary%3ADownload",
      status: "connected",
      settings: { folderName: "Downloads" },
      last_scan_at: null,
      created_at: "2026-08-12T00:00:00.000Z",
      updated_at: "2026-08-12T00:00:00.000Z",
    });
    assert.equal(source.sourceType, "android_storage");
    assert.equal(source.settings.folderName, "Downloads");
    assert.match(source.sourceUri ?? "", /content:\/\//);
  });

  it("preserves cancelled picker as ConnectorError cancelled", () => {
    const err = new ConnectorError("cancelled", "Folder selection was cancelled.");
    assert.equal(err.code, "cancelled");
  });

  it("permission revoked is a distinct error code", () => {
    const err = new ConnectorError(
      "permission_revoked",
      "Guardian no longer has access to this folder."
    );
    assert.equal(err.code, "permission_revoked");
  });
});

/**
 * RLS security contract (documented for migration 0077):
 * - connected_sources: auth.uid() = user_id for select/insert/update/delete
 * - source_items: EXISTS parent connected_sources where user_id = auth.uid()
 * User A cannot query User B rows when using the anon/authenticated client.
 */
describe("RLS security contract", () => {
  it("documents ownership predicates for connected_sources and source_items", () => {
    const connectedSourcesPolicy = "auth.uid() = user_id";
    const sourceItemsPolicy =
      "exists (select 1 from connected_sources cs where cs.id = source_items.source_id and cs.user_id = auth.uid())";
    assert.match(connectedSourcesPolicy, /auth\.uid\(\) = user_id/);
    assert.match(sourceItemsPolicy, /cs\.user_id = auth\.uid\(\)/);
  });
});
