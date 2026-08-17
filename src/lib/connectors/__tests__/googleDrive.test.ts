import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  googleDriveParentForScan,
  googleDriveSelectedFolderId,
  googleDriveSelectedFolderName,
  googleDriveSelectedKind,
} from "../googleDrive/selectedFolder.ts";
import {
  googleDriveExportMime,
  isGoogleDriveExportableMime,
  isGoogleWorkspaceMime,
} from "../googleDrive/mimes.ts";
import { isRemoteSourceItem, isRemoteSourceType } from "../remote.ts";

describe("google drive selected folder", () => {
  it("reads folderId from settings", () => {
    assert.equal(googleDriveSelectedFolderId({ folderId: "abc" }), "abc");
    assert.equal(googleDriveSelectedFolderId({}), null);
    assert.equal(googleDriveSelectedFolderName({ folderName: "Invoices" }), "Invoices");
  });

  it("defaults scan parent to My Drive root", () => {
    assert.deepEqual(googleDriveParentForScan({}), {
      folderId: "root",
      driveId: null,
    });
    assert.deepEqual(
      googleDriveParentForScan({ folderId: "fld", driveId: "drv" }),
      { folderId: "fld", driveId: "drv" }
    );
  });

  it("classifies location kind", () => {
    assert.equal(googleDriveSelectedKind({}), "my_drive");
    assert.equal(googleDriveSelectedKind({ folderKind: "shared_drive" }), "shared_drive");
    assert.equal(googleDriveSelectedKind({ folderId: "x" }), "folder");
    assert.equal(googleDriveSelectedKind({ driveId: "d1" }), "shared_drive");
  });
});

describe("google drive mimes", () => {
  it("exports Docs/Sheets/Slides to analyzable types", () => {
    assert.equal(
      googleDriveExportMime("application/vnd.google-apps.document"),
      "text/plain"
    );
    assert.equal(
      googleDriveExportMime("application/vnd.google-apps.spreadsheet"),
      "text/csv"
    );
    assert.equal(
      googleDriveExportMime("application/vnd.google-apps.presentation"),
      "application/pdf"
    );
    assert.equal(isGoogleDriveExportableMime("application/pdf"), false);
    assert.equal(
      isGoogleWorkspaceMime("application/vnd.google-apps.document"),
      true
    );
  });
});

describe("remote connectors", () => {
  it("treats google drive as remote", () => {
    assert.equal(isRemoteSourceType("google_drive"), true);
    assert.equal(isRemoteSourceType("trello"), true);
    assert.equal(isRemoteSourceType("android_storage"), false);
    assert.equal(
      isRemoteSourceItem({ metadata: { provider: "google_drive" } }),
      true
    );
  });
});
