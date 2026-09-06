import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickGideonSpeechVoice } from "../gideonSpeechVoice.ts";

describe("pickGideonSpeechVoice", () => {
  it("prefers Microsoft David over Zira", () => {
    const picked = pickGideonSpeechVoice([
      { name: "Microsoft Zira - English (United States)", lang: "en-US" },
      { name: "Microsoft David - English (United States)", lang: "en-US" },
    ]);
    assert.ok(picked);
    assert.match(picked!.name, /David/i);
  });

  it("prefers Google UK English Male over female", () => {
    const picked = pickGideonSpeechVoice([
      { name: "Google UK English Female", lang: "en-GB" },
      { name: "Google UK English Male", lang: "en-GB" },
    ]);
    assert.ok(picked);
    assert.match(picked!.name, /Male/i);
  });

  it("avoids female-named voices when a neutral English option exists", () => {
    const picked = pickGideonSpeechVoice([
      { name: "Microsoft Zira - English (United States)", lang: "en-US" },
      { name: "English (America)", lang: "en-US", localService: true },
    ]);
    assert.ok(picked);
    assert.doesNotMatch(picked!.name, /Zira/i);
  });

  it("returns null for empty list", () => {
    assert.equal(pickGideonSpeechVoice([]), null);
  });
});
