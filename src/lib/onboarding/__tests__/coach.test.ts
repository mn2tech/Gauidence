import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GUARDIAN_COACH_SETUP_MARKER,
  parseCoachAssistantMessage,
} from "../coach.ts";

describe("parseCoachAssistantMessage", () => {
  it("returns plain reply when no setup marker", () => {
    const result = parseCoachAssistantMessage("What kind of business do you run?");
    assert.equal(result.reply, "What kind of business do you run?");
    assert.equal(result.setup, null);
  });

  it("parses setup JSON after marker", () => {
    const raw = `Great — I'll set up a business workspace for you.
${GUARDIAN_COACH_SETUP_MARKER}
{"intent":"business","schoolIntent":null,"workspaceName":"NM2TECH","summary":"Business owner workspace"}`;
    const result = parseCoachAssistantMessage(raw);
    assert.match(result.reply, /business workspace/);
    assert.equal(result.setup?.intent, "business");
    assert.equal(result.setup?.workspaceName, "NM2TECH");
  });

  it("requires schoolIntent for school intent", () => {
    const raw = `Got it.
${GUARDIAN_COACH_SETUP_MARKER}
{"intent":"school","schoolIntent":null,"workspaceName":"Teaching"}`;
    const result = parseCoachAssistantMessage(raw);
    assert.equal(result.setup, null);
  });

  it("parses school teacher setup", () => {
    const raw = `Perfect.
${GUARDIAN_COACH_SETUP_MARKER}
{"intent":"school","schoolIntent":"teacher","workspaceName":"Teaching","summary":"Teacher workspace"}`;
    const result = parseCoachAssistantMessage(raw);
    assert.equal(result.setup?.intent, "school");
    assert.equal(result.setup?.schoolIntent, "teacher");
  });
});
