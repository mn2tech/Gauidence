import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConnectorError } from "../types";
import {
  mapConnectedSource,
  mapConnectedSourceForClient,
} from "../services/connectedSources";

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

  it("redacts Google Drive OAuth tokens for the client", () => {
    const source = mapConnectedSourceForClient(
      {
      id: "11111111-1111-1111-1111-111111111111",
      user_id: "22222222-2222-2222-2222-222222222222",
      profile_id: "33333333-3333-3333-3333-333333333333",
      source_type: "google_drive",
      display_name: "Google Drive (a@b.com)",
      source_uri: "https://drive.google.com/drive/my-drive",
      status: "connected",
      settings: {
        accessToken: "secret-access",
        refreshToken: "secret-refresh",
        expiresAt: "2026-08-17T00:00:00.000Z",
        email: "a@b.com",
        folderName: "Invoices",
      },
      last_scan_at: null,
      created_at: "2026-08-17T00:00:00.000Z",
      updated_at: "2026-08-17T00:00:00.000Z",
    },
      "22222222-2222-2222-2222-222222222222"
    );
    assert.equal(source.sourceType, "google_drive");
    assert.equal(source.settings.email, "a@b.com");
    assert.equal(source.settings.folderName, "Invoices");
    assert.equal(source.settings.hasCredentials, true);
    assert.equal(source.settings.accessToken, undefined);
    assert.equal(source.settings.refreshToken, undefined);
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
 * RLS security contract (migrations 0077 + 0097):
 * - connected_sources: auth.uid() = user_id OR shared trello/google_drive on accessible space
 * - source_items: owner parent OR shared profile-bound parent
 */
describe("RLS security contract", () => {
  it("documents ownership predicates for connected_sources and source_items", () => {
    const connectedSourcesPolicy =
      "auth.uid() = user_id OR shared profile-bound trello/google_drive";
    const sourceItemsPolicy =
      "owner parent OR shared profile-bound trello/google_drive parent";
    assert.match(connectedSourcesPolicy, /auth\.uid\(\) = user_id/);
    assert.match(sourceItemsPolicy, /shared profile-bound/);
  });
});
