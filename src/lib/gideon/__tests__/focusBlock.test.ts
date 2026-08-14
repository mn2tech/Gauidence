import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFocusRemainingAnswer,
  formatCountdown,
  isFocusRemainingQuestion,
  parseFocusBlockFromAssistant,
  parseFocusBlockStart,
  remainingMs,
  stripFocusBlockSection,
  wantsFocusBlockStart,
} from "../focusBlock.ts";

const TZ = "America/New_York";
const NOW = new Date("2026-08-14T14:31:00.000Z"); // 10:31 AM Eastern

describe("focus block countdown", () => {
  it("formats remaining time", () => {
    assert.equal(formatCountdown(46 * 60_000 + 12_000), "46:12");
    assert.equal(formatCountdown(0), "0:00");
    assert.equal(formatCountdown(3661_000), "1:01:01");
  });

  it("detects remaining-time questions without treating them as definitions", () => {
    assert.equal(isFocusRemainingQuestion("how much time is left?"), true);
    assert.equal(isFocusRemainingQuestion("What's the countdown?"), true);
    assert.equal(isFocusRemainingQuestion("What is the Pomodoro technique?"), false);
  });

  it("starts a 90-minute block from now", () => {
    const block = parseFocusBlockStart(
      "Start a 90-minute focus block now.",
      NOW,
      TZ
    );
    assert.ok(block);
    assert.equal(block.label, "Focus block");
    assert.equal(remainingMs(block, NOW), 90 * 60_000);
  });

  it("starts a 90/20 block until an explicit end time", () => {
    const block = parseFocusBlockStart(
      "Start the work block until 11:05 AM",
      NOW,
      TZ
    );
    assert.ok(block);
    const left = remainingMs(block, NOW);
    assert.ok(left > 33 * 60_000 && left < 35 * 60_000);
  });

  it("parses ## FOCUS BLOCK from Gideon", () => {
    const block = parseFocusBlockFromAssistant(
      `You're in a 90/20 block.\n\n## FOCUS BLOCK\nlabel: Guardian launch\ndate: 2026-08-14\ntime: 11:05\n`,
      NOW,
      TZ
    );
    assert.ok(block);
    assert.equal(block.label, "Guardian launch");
    assert.ok(remainingMs(block, NOW) > 30 * 60_000);
  });

  it("parses remaining-time copy with ending at", () => {
    const block = parseFocusBlockFromAssistant(
      "Right now (10:19 AM) you have 46 minutes left in the work block, ending at 11:05 AM. If you want, set a phone timer for 11:05 so you don't have to keep checking in.",
      NOW,
      TZ
    );
    assert.ok(block);
    const left = remainingMs(block, NOW);
    assert.ok(left > 33 * 60_000 && left < 35 * 60_000);
  });

  it("strips the FOCUS BLOCK section from chat text", () => {
    const stripped = stripFocusBlockSection(
      `The live clock is at the top.\n\n## FOCUS BLOCK\nlabel: Focus\ndate: 2026-08-14\ntime: 11:05\n`
    );
    assert.equal(stripped.includes("FOCUS BLOCK"), false);
    assert.match(stripped, /live clock/);
  });

  it("answers remaining time from the active block", () => {
    const endsAt = new Date(NOW.getTime() + 46 * 60_000).toISOString();
    const answer = buildFocusRemainingAnswer(
      {
        label: "Guardian — product",
        startsAt: NOW.toISOString(),
        endsAt,
      },
      TZ,
      NOW
    );
    assert.match(answer, /46:00 left/);
    assert.match(answer, /live clock/i);
  });

  it("wantsFocusBlockStart matches natural phrasing", () => {
    assert.equal(wantsFocusBlockStart("Start a 90/20 block"), true);
    assert.equal(wantsFocusBlockStart("Help me plan today."), false);
  });
});
