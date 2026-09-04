import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseFromHeader } from "../parse";
import {
  classifyInboxBucket,
  suggestSpaceForBucket,
} from "../classify";

describe("gmail classify", () => {
  it("parses From headers", () => {
    assert.deepEqual(parseFromHeader(`"BGE" <noreply@bge.com>`), {
      fromName: "BGE",
      fromEmail: "noreply@bge.com",
    });
    assert.deepEqual(parseFromHeader("solo@example.com"), {
      fromName: "solo@example.com",
      fromEmail: "solo@example.com",
    });
  });

  it("classifies bills and school senders", () => {
    assert.equal(
      classifyInboxBucket({
        fromEmail: "noreply@bge.com",
        fromName: "BGE",
        subject: "Your bill is ready",
      }),
      "bills"
    );
    assert.equal(
      classifyInboxBucket({
        fromEmail: "noreply@montgomeryschoolsmd.org",
        fromName: "MCPS",
        subject: "Absence reported",
      }),
      "school"
    );
  });

  it("suggests Spaces by profile type", () => {
    const spaces = [
      { id: "p", display_name: "Kola", profile_type: "personal" },
      { id: "c", display_name: "Nolan", profile_type: "child" },
      { id: "b", display_name: "Biz", profile_type: "business" },
    ];
    assert.equal(suggestSpaceForBucket("bills", spaces), "p");
    assert.equal(suggestSpaceForBucket("school", spaces), "c");
    assert.equal(suggestSpaceForBucket("work", spaces), "b");
  });
});
