import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getContainerLabel,
  getContainerLabelPlural,
  profileContainerName,
  spaceMapTitle,
} from "../containerLabels";
import type { GuardianProfileType } from "../types";

function sample(type: GuardianProfileType = "personal") {
  return {
    display_name: "Michael Kola",
    profile_type: type,
    access_role: "owner" as const,
  };
}

describe("container labels", () => {
  it("maps business types to Workspace", () => {
    assert.equal(getContainerLabel("business"), "Workspace");
    assert.equal(getContainerLabel("non_profit"), "Workspace");
    assert.equal(getContainerLabelPlural("business"), "Workspaces");
  });

  it("maps personal types to Space", () => {
    assert.equal(getContainerLabel("personal"), "Space");
    assert.equal(getContainerLabel("family"), "Space");
    assert.equal(getContainerLabel("vehicle"), "Space");
    assert.equal(getContainerLabelPlural("personal"), "Spaces");
  });

  it("builds profile container names", () => {
    assert.equal(
      profileContainerName(sample("business")),
      "Michael Kola Workspace"
    );
    assert.equal(
      profileContainerName(sample("vehicle")),
      "Michael Kola Space"
    );
  });

  it("titles space map by context", () => {
    assert.equal(spaceMapTitle("business"), "Workspace Map");
    assert.equal(spaceMapTitle("personal"), "Space Map");
    assert.equal(spaceMapTitle(null), "Space Map");
  });
});
