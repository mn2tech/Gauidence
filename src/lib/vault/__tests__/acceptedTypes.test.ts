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

  it("includes CSV", () => {
    assert.equal(VAULT_ACCEPTED_TYPES["text/csv"], "CSV");
    assert.match(VAULT_FILE_ACCEPT, /\.csv/);
    assert.match(VAULT_FILE_ACCEPT, /text\/csv/);
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

  it("resolves CSV from MIME or extension", () => {
    assert.equal(
      resolveVaultFileMimeType({ type: "text/csv", name: "export.csv" }),
      "text/csv"
    );
    assert.equal(
      resolveVaultFileMimeType({ type: "application/csv", name: "export.csv" }),
      "text/csv"
    );
    assert.equal(
      resolveVaultFileMimeType({ type: "", name: "contacts.CSV" }),
      "text/csv"
    );
    // Windows often labels .csv as Excel MIME — prefer extension.
    assert.equal(
      resolveVaultFileMimeType({
        type: "application/vnd.ms-excel",
        name: "rows.csv",
      }),
      "text/csv"
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
