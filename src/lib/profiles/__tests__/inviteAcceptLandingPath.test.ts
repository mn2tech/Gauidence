import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inviteAcceptLandingPath } from "@/lib/routes";
import { SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";
import { EMPLOYEE_HUB_PATH } from "@/lib/employee-hub/routing";

describe("inviteAcceptLandingPath", () => {
  it("sends Family partners on simple-home to Today", () => {
    assert.equal(
      inviteAcceptLandingPath({
        profileId: "fam-1",
        profileType: "family",
        role: "editor",
        simpleHome: true,
      }),
      SIMPLE_HOME_PATH
    );
  });

  it("sends other simple-home invites to Today", () => {
    assert.equal(
      inviteAcceptLandingPath({
        profileId: "biz-1",
        profileType: "business",
        role: "editor",
        simpleHome: true,
      }),
      SIMPLE_HOME_PATH
    );
  });

  it("routes employees to hub", () => {
    assert.equal(
      inviteAcceptLandingPath({
        profileId: "emp-1",
        profileType: "employee",
        parentProfileId: "biz-1",
        role: "viewer",
      }),
      EMPLOYEE_HUB_PATH
    );
  });
});
