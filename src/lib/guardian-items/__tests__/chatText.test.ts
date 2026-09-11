import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldExtractGuardianItemsFromChatText } from "../chatText";

describe("Gideon pasted text Guardian Items routing", () => {
  it("routes a pasted email containing a deadline and event dates", () => {
    const email = `From: teacher@example.org
Subject: Field trip information

Hi Michael,
The permission form and $20 payment are due September 18, 2026. The school field trip is September 24, 2026. Please reply to confirm that Nolan will attend.

Thanks,
Ms. Teacher`;
    assert.equal(shouldExtractGuardianItemsFromChatText(email), true);
  });

  it("does not turn an ordinary date question into a reminder", () => {
    assert.equal(
      shouldExtractGuardianItemsFromChatText("When is my meeting on September 18, 2026?"),
      false
    );
  });

  it("does not route an email timestamp without an actionable date", () => {
    assert.equal(
      shouldExtractGuardianItemsFromChatText(
        "From: friend@example.org\nSent: September 18, 2026\nHi Michael, it was good seeing you yesterday. Thanks!"
      ),
      false
    );
  });
});

