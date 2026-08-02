import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkingInDisplay,
  searchScopeLabel,
} from "../searchScope.ts";

describe("buildWorkingInDisplay", () => {
  const business = {
    id: "biz",
    display_name: "NM2TECH",
    profile_type: "business" as const,
  };

  it("shows working mode for the active workspace", () => {
    const display = buildWorkingInDisplay({
      workspaceProfile: business,
    });
    assert.equal(display.mode, "working");
    assert.equal(display.primaryName, "NM2TECH");
    assert.equal(display.secondaryLabel, "Business");
    assert.equal(display.homeName, null);
  });

  it("shows searching mode when chat scope is temporary", () => {
    const display = buildWorkingInDisplay({
      workspaceProfile: business,
      chatScopedProfile: { profileId: "payroll", profileName: "Payroll" },
    });
    assert.equal(display.mode, "searching");
    assert.equal(display.primaryName, "Payroll");
    assert.equal(display.homeName, "NM2TECH");
  });
});

describe("searchScopeLabel", () => {
  it("labels workspace and global scopes", () => {
    assert.equal(searchScopeLabel("workspace"), "This workspace");
    assert.equal(searchScopeLabel("global"), "Everywhere");
  });
});
