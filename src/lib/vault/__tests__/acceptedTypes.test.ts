import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveVaultFileMimeType,
  VAULT_ACCEPTED_TYPES,
  VAULT_FILE_ACCEPT,
} from "../acceptedTypes";

describe("vault accepted types", () => {
  it("includes JSON", () => {
    assert.equal(VAULT_ACCEPTED_TYPES["application/json"], "JSON");
    assert.match(VAULT_FILE_ACCEPT, /\.json/);
    assert.match(VAULT_FILE_ACCEPT, /application\/json/);
  });

  it("resolves JSON from MIME or extension", () => {
    assert.equal(
      resolveVaultFileMimeType({
        type: "application/json",
        name: "export.json",
      }),
      "application/json"
    );
    assert.equal(
      resolveVaultFileMimeType({ type: "", name: "contacts.JSON" }),
      "application/json"
    );
  });

  it("still rejects unknown types", () => {
    assert.equal(
      resolveVaultFileMimeType({ type: "application/zip", name: "a.zip" }),
      "application/zip"
    );
    assert.equal(
      Boolean(
        VAULT_ACCEPTED_TYPES[
          resolveVaultFileMimeType({ type: "application/zip", name: "a.zip" })
        ]
      ),
      false
    );
  });
});
