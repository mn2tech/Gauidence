import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPlatformAdmin } from "../admin.ts";

describe("isPlatformAdmin", () => {
  it("matches allowlisted emails case-insensitively", () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "Owner@Example.com, other@x.test";
    try {
      assert.equal(isPlatformAdmin("owner@example.com"), true);
      assert.equal(isPlatformAdmin("OTHER@x.test"), true);
      assert.equal(isPlatformAdmin("nope@example.com"), false);
      assert.equal(isPlatformAdmin(null), false);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });

  it("denies everyone when ADMIN_EMAILS is unset", () => {
    const prev = process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_EMAILS;
    try {
      assert.equal(isPlatformAdmin("owner@example.com"), false);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = prev;
    }
  });
});
