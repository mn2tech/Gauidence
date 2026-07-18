import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseProposedReminder,
  stripProposedReminderSection,
  wantsReminderAgent,
} from "../propose.ts";

describe("reminder agent propose helpers", () => {
  it("detects reminder intent", () => {
    assert.equal(wantsReminderAgent("Remind me about registration"), true);
    assert.equal(wantsReminderAgent("Set a reminder for the invoice"), true);
    assert.equal(wantsReminderAgent("What is the due date?"), false);
  });

  it("parses a valid proposed reminder block", () => {
    const content = `Registration renews soon.

## PROPOSED REMINDER
title: Mini Cooper registration
date: 2026-08-01
time: 09:00`;
    const proposal = parseProposedReminder(content, Date.parse("2026-07-18T12:00:00Z"));
    assert.deepEqual(proposal, {
      title: "Mini Cooper registration",
      date: "2026-08-01",
      time: "09:00",
    });
  });

  it("rejects past dates", () => {
    const content = `## PROPOSED REMINDER
title: Old thing
date: 2020-01-01
time: 09:00`;
    assert.equal(
      parseProposedReminder(content, Date.parse("2026-07-18T12:00:00Z")),
      null
    );
  });

  it("strips the proposal section from display text", () => {
    const content = `Due August 1.

## PROPOSED REMINDER
title: Renew registration
date: 2026-08-01
time: 09:00

## GIDEON'S SUGGESTION
Confirm on the dashboard.`;
    const stripped = stripProposedReminderSection(content);
    assert.match(stripped, /Due August 1/);
    assert.match(stripped, /GIDEON'S SUGGESTION/);
    assert.doesNotMatch(stripped, /PROPOSED REMINDER/);
    assert.doesNotMatch(stripped, /Renew registration/);
  });
});
