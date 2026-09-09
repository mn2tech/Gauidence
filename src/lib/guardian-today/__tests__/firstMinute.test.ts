import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_NO_SOURCES,
  FIRST_MINUTE_CHIPS,
  FIRST_MINUTE_PROMISE,
  firstMinuteChipHref,
  tellGuardianHref,
} from "../firstMinute.ts";

describe("first-minute promise", () => {
  it("states the mental-load benefit", () => {
    assert.match(FIRST_MINUTE_PROMISE, /paperwork and promises/i);
    assert.match(EMPTY_NO_SOURCES.title, /one thing to watch/i);
  });

  it("builds Tell Guardian hrefs with optional draft", () => {
    assert.equal(tellGuardianHref(), "/history?tell=1");
    assert.match(
      tellGuardianHref("Passport expires March 2027"),
      /tell=1/
    );
    assert.match(
      tellGuardianHref("Passport expires March 2027"),
      /draft=Passport/
    );
  });

  it("maps example chips to draft tell links", () => {
    assert.equal(FIRST_MINUTE_CHIPS.length, 3);
    const href = firstMinuteChipHref(FIRST_MINUTE_CHIPS[0]!);
    assert.match(href, /history\?tell=1/);
    assert.match(href, /draft=/);
  });
});
