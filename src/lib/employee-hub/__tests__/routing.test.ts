import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPLOYEE_HUB_PATH,
  employeeInvoiceUploadHref,
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

  it("builds invoice upload deep links with durable docs intent", () => {
    assert.equal(
      employeeInvoiceUploadHref("emp-1"),
      "/dashboard?docs=1&camera=1&profileId=emp-1#documents-emp-1"
    );
  });
});
