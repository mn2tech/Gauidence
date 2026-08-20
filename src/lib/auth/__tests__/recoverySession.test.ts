import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RECOVERY_SESSION_ERROR } from "@/lib/auth/recoverySession";

describe("recovery session helpers", () => {
  it("exposes a stable expired-link message", () => {
    assert.match(RECOVERY_SESSION_ERROR, /invalid or has expired/i);
  });
});
