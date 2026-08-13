import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkingInDisplay,
  parseSearchScope,
  searchScopeHeading,
  searchScopeHint,
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

describe("parseSearchScope", () => {
  it("defaults to workspace", () => {
    assert.equal(parseSearchScope(undefined), "workspace");
    assert.equal(parseSearchScope("workspace"), "workspace");
  });

  it("accepts global", () => {
    assert.equal(parseSearchScope("global"), "global");
  });
});

describe("searchScopeLabel", () => {
  it("labels workspace and global scopes", () => {
    assert.equal(searchScopeLabel("workspace"), "This space");
    assert.equal(searchScopeLabel("global"), "All spaces");
  });
});

describe("searchScopeHeading", () => {
  it("uses the space name or all-spaces heading", () => {
    assert.equal(searchScopeHeading("workspace", "NM2TECH"), "NM2TECH");
    assert.equal(searchScopeHeading("global", "NM2TECH"), "All your spaces");
  });
});

describe("searchScopeHint", () => {
  it("explains this-space vs all-spaces in one line", () => {
    assert.equal(
      searchScopeHint("workspace", "NM2TECH"),
      "Answers come only from this space."
    );
    assert.equal(
      searchScopeHint("global", "NM2TECH"),
      "Answers can come from any space you can access. New files still save in NM2TECH."
    );
  });
});
