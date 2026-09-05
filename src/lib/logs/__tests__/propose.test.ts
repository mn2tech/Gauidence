import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseProposedDailyLog,
  proposedDailyLogSummary,
  stripProposedDailyLogSection,
  wantsDailyLogCapture,
  isDailyLogConfirmationMessage,
} from "../propose.ts";
import { todayLogDate } from "../types.ts";

describe("daily log capture propose helpers", () => {
  it("detects capture intent", () => {
    assert.equal(wantsDailyLogCapture("Remember that Emma has soccer Tuesday"), true);
    assert.equal(wantsDailyLogCapture("Add this to the vault: met with John"), true);
    assert.equal(wantsDailyLogCapture("Save this list"), true);
    assert.equal(wantsDailyLogCapture("Add these to Nolan's vault"), true);
    assert.equal(wantsDailyLogCapture("Make them permanent"), true);
    assert.equal(wantsDailyLogCapture("Save what you just listed"), true);
    assert.equal(wantsDailyLogCapture("Create a daily log with today's schedule"), true);
    assert.equal(wantsDailyLogCapture("Make me a daily log for today"), true);
    assert.equal(wantsDailyLogCapture("Write a daily log entry"), true);
    assert.equal(wantsDailyLogCapture("Save this to my space"), true);
    assert.equal(wantsDailyLogCapture("Remind me about registration"), false);
    assert.equal(wantsDailyLogCapture("What did I log yesterday?"), false);
    assert.equal(wantsDailyLogCapture("Upload this photo"), false);
  });

  it("does not re-trigger capture when affirming an existing proposal", () => {
    const history = [
      {
        role: "assistant" as const,
        content: `## PROPOSED DAILY LOG
title: Movie night
content: Saw Spider-Man at AMC.
log_date: 2026-08-06`,
      },
    ];
    assert.equal(wantsDailyLogCapture("yes save it", history), false);
    assert.equal(wantsDailyLogCapture("add it to the vault", history), false);
    assert.equal(wantsDailyLogCapture("go ahead", history), false);
    assert.equal(
      wantsDailyLogCapture("Remember that Emma has soccer Tuesday", history),
      true
    );
  });

  it("detects short confirmation phrases", () => {
    assert.equal(isDailyLogConfirmationMessage("yes save it"), true);
    assert.equal(isDailyLogConfirmationMessage("add it to the vault"), true);
    assert.equal(isDailyLogConfirmationMessage("Remember that"), false);
  });

  it("parses a valid proposed daily log block", () => {
    const content = `Got it — I'll keep that on file.

## PROPOSED DAILY LOG
title: Soccer practice
content: Emma has soccer Tuesday at 4pm at Lincoln Field.
log_date: 2026-08-05`;
    const proposal = parseProposedDailyLog(content, "2026-08-03");
    assert.deepEqual(proposal, {
      title: "Soccer practice",
      content: "Emma has soccer Tuesday at 4pm at Lincoln Field.",
      logDate: "2026-08-05",
    });
  });

  it("parses multiline content", () => {
    const content = `## PROPOSED DAILY LOG
title: Meeting notes
content: Met with John about Q3 goals.
He will send the deck Friday.
log_date: 2026-08-03`;
    const proposal = parseProposedDailyLog(content, "2026-08-03");
    assert.equal(proposal?.content, "Met with John about Q3 goals.\nHe will send the deck Friday.");
  });

  it("defaults log date when missing or invalid", () => {
    const content = `## PROPOSED DAILY LOG
content: Quick note`;
    const proposal = parseProposedDailyLog(content, "2026-08-03");
    assert.deepEqual(proposal, {
      title: undefined,
      content: "Quick note",
      logDate: "2026-08-03",
    });
  });

  it("strips the proposal section from display text", () => {
    const content = `I'll save that for you.

## PROPOSED DAILY LOG
title: Soccer practice
content: Emma has soccer Tuesday at 4pm.
log_date: 2026-08-05

## GIDEON'S SUGGESTION
Confirm when ready.`;
    const stripped = stripProposedDailyLogSection(content);
    assert.match(stripped, /I'll save that for you/);
    assert.match(stripped, /GIDEON'S SUGGESTION/);
    assert.doesNotMatch(stripped, /PROPOSED DAILY LOG/);
    assert.doesNotMatch(stripped, /Emma has soccer/);
  });

  it("builds a readable summary", () => {
    const today = todayLogDate("America/New_York");
    const summary = proposedDailyLogSummary(
      {
        title: "Soccer practice",
        content: "Emma has soccer Tuesday at 4pm.",
        logDate: today,
      },
      "America/New_York"
    );
    assert.match(summary, /Soccer practice/);
    assert.match(summary, /today/i);
    assert.match(summary, /Emma has soccer/);
  });
});
