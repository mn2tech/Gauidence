import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPLOYEE_HUB_PATH,
  isEmployeeHubProfile,
  postLoginPathForProfile,
} from "../routing";

describe("employee hub routing", () => {
  it("detects employee hub profiles", () => {
    assert.equal(
      isEmployeeHubProfile({
        profile_type: "employee",
        parent_profile_id: "biz-1",
      }),
      true
    );
    assert.equal(
      isEmployeeHubProfile({
        profile_type: "employee",
        parent_profile_id: null,
      }),
      false
    );
    assert.equal(
      isEmployeeHubProfile({
        profile_type: "business",
        parent_profile_id: "biz-1",
      }),
      false
    );
  });

  it("routes employees to the hub", () => {
    assert.equal(
      postLoginPathForProfile({
        profile_type: "employee",
        parent_profile_id: "biz-1",
      }),
      EMPLOYEE_HUB_PATH
    );
    assert.equal(
      postLoginPathForProfile({
        profile_type: "personal",
        parent_profile_id: null,
      }),
      "/ask"
    );
  });
});
