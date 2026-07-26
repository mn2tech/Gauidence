import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAssistantMessagePlainText,
  formatAssistantMessageSpeechText,
} from "../assistantMessageText";

describe("assistantMessageText", () => {
  it("strips proposed reminder and joins sections for copy", () => {
    const content = `## FROM YOUR DOCUMENTS
Camp starts June 10.

## PROPOSED REMINDER
title: Pack lunch
date: 2026-06-09
time: 07:30`;

    const plain = formatAssistantMessagePlainText(content);
    assert.match(plain, /Camp starts June 10/);
    assert.doesNotMatch(plain, /PROPOSED REMINDER/);
    assert.doesNotMatch(plain, /Pack lunch/);
  });

  it("removes markdown markers for speech", () => {
    const speech = formatAssistantMessageSpeechText(
      "## GENERAL KNOWLEDGE\n**Today** is Sunday."
    );
    assert.equal(speech, "General knowledge\nToday is Sunday.");
  });
});
