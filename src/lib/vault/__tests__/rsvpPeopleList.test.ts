import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildListAnswerFromChunks,
  looksLikePersonListItem,
  wantsPeopleRoster,
  wantsTranscription,
  preferFullerListAnswer,
} from "../gideon.ts";

describe("RSVP people list filtering", () => {
  it("detects who-has-RSVPd questions", () => {
    assert.equal(wantsPeopleRoster("Who has RSVP'd so far?"), true);
    assert.equal(wantsTranscription("Who has RSVP'd so far?"), true);
  });

  it("rejects marketing and action-item junk as people", () => {
    assert.equal(looksLikePersonListItem("launch-june-2026"), false);
    assert.equal(looksLikePersonListItem("31"), false);
    assert.equal(looksLikePersonListItem("Registration Period"), false);
    assert.equal(looksLikePersonListItem("Organization Type:"), false);
    assert.equal(
      looksLikePersonListItem(
        "CrossRoads Connect — executive networking for purpose-driven leaders."
      ),
      false
    );
    assert.equal(
      looksLikePersonListItem(
        "Send event confirmation and details to all registered attendees"
      ),
      false
    );
    assert.equal(looksLikePersonListItem("Rockville, MD 20852"), false);
    assert.equal(
      looksLikePersonListItem("Joshua Mughogho — Triwell Tech"),
      true
    );
    assert.equal(looksLikePersonListItem("Jeff Hunt"), true);
  });

  it("builds people-only lists from mixed registration facts", () => {
    const answer = buildListAnswerFromChunks(
      [
        {
          file_name: "registration.pdf",
          content: `Title: Launch Event Registration List - June 2026
- slug: launch-june-2026
- count: 31
- Person: Joshua Mughogho — Triwell Tech
- Person: Maverick Durant — TriWellTech
- Person: John Anselmo — Truist
- Note: Seats are limited
- Action: Send event confirmation and details to all registered attendees
- CrossRoads Connect — executive networking for purpose-driven leaders.
1. Tom Powell — Offit Kurman, P.A. (Principal)
2. Follow up with attendees missing phone numbers`,
        },
      ],
      { peopleOnly: true }
    );
    assert.ok(answer);
    assert.match(answer!, /Joshua Mughogho/);
    assert.match(answer!, /Tom Powell/);
    assert.doesNotMatch(answer!, /launch-june-2026/);
    assert.doesNotMatch(answer!, /Send event confirmation/);
    assert.doesNotMatch(answer!, /executive networking/);
    assert.equal(
      (answer!.match(/^\d+\./gm) ?? []).length >= 4,
      true
    );
  });

  it("does not replace a model answer with junk metadata lists", () => {
    const junkChunks = [
      {
        file_name: "reg.pdf",
        content: `Title: Launch Event
1. launch-june-2026
2. 31
3. Registration Period
4. Send event confirmation to all registered attendees
5. Prepare event materials and seating arrangements`,
      },
    ];
    const model =
      "From the registration list, confirmed attendees include Joshua Mughogho and Maverick Durant.";
    const out = preferFullerListAnswer(model, junkChunks, { peopleOnly: true });
    assert.equal(out, model);
  });
});
