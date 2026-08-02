import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AGENT_MODE_SYSTEM_NOTE } from "../constants.ts";

describe("agent mode", () => {
  it("includes multi-step planning and confirmation rules", () => {
    assert.match(AGENT_MODE_SYSTEM_NOTE, /Agent mode is ON/);
    assert.match(AGENT_MODE_SYSTEM_NOTE, /confirmation/);
    assert.match(AGENT_MODE_SYSTEM_NOTE, /multi-step/);
  });
});
