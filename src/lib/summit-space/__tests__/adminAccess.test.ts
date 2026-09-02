import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlatformAdmin } from "@/lib/admin";

describe("summit admin access", () => {
  it("allows platform admins through ADMIN_EMAILS", () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "owner@nm2tech.com";
    try {
      assert.equal(isPlatformAdmin("owner@nm2tech.com"), true);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });
});
