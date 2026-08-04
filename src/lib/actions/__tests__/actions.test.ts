import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearActionsForTests,
  getMatchingActions,
  registerAction,
} from "../registry.ts";
import { createReminderAction, searchVaultAction } from "../actions/core.ts";
import { captureDailyLogAction } from "../actions/dailyLog.ts";
import {
  collectActionSystemNotes,
  collectThinkingSteps,
} from "../runner.ts";
import type { ActionContext } from "../types.ts";

const baseCtx = (question: string): ActionContext => ({
  question,
  userId: "u1",
  activeProfile: {
    id: "p1",
    display_name: "NM2TECH",
    profile_type: "business",
  },
});

describe("Guardian Action Engine", () => {
  beforeEach(() => {
    clearActionsForTests();
    registerAction(createReminderAction);
    registerAction(searchVaultAction);
    registerAction(captureDailyLogAction);
  });

  it("matches create_reminder intent", () => {
    const matches = getMatchingActions(baseCtx("remind me about the invoice"));
    assert.ok(matches.some((a) => a.id === "create_reminder"));
  });

  it("matches search_vault intent", () => {
    const matches = getMatchingActions(baseCtx("find my passport"));
    assert.ok(matches.some((a) => a.id === "search_vault"));
  });

  it("injects reminder system note", () => {
    const note = collectActionSystemNotes(
      baseCtx("set a reminder for tomorrow")
    );
    assert.match(note, /PROPOSED REMINDER/i);
  });

  it("matches capture_daily_log intent", () => {
    const matches = getMatchingActions(
      baseCtx("remember that Emma has soccer on Tuesday")
    );
    assert.ok(matches.some((a) => a.id === "capture_daily_log"));
  });

  it("injects daily log capture system note", () => {
    const note = collectActionSystemNotes(
      baseCtx("add this to the vault: met with John")
    );
    assert.match(note, /PROPOSED DAILY LOG/i);
  });

  it("builds thinking steps for search", () => {
    const steps = collectThinkingSteps(baseCtx("where is my insurance?"));
    assert.deepEqual(steps, [
      "Understanding request",
      "Searching workspace",
      "Ranking relevance",
    ]);
  });
});
