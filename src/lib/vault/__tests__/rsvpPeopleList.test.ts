import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildListAnswerFromChunks,
  looksLikePersonListItem,
  wantsPeopleRoster,
  wantsTranscription,
  preferFullerListAnswer,
  sanitizePeopleRosterAnswer,
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

  it("rejects website nav and job-title junk from RSVP answers", () => {
    assert.equal(looksLikePersonListItem("CrossRoads Connect"), false);
    assert.equal(looksLikePersonListItem("Contact"), false);
    assert.equal(looksLikePersonListItem("Founder"), false);
    assert.equal(looksLikePersonListItem("Events — CrossRoads Connect Cross Roads"), false);
    assert.equal(looksLikePersonListItem("Friday — 2026"), false);
    assert.equal(looksLikePersonListItem("Executive Leader — Power Lifter"), false);
    assert.equal(
      looksLikePersonListItem("VP — Commercial Banking · John Marshall Bank"),
      false
    );
    assert.equal(
      looksLikePersonListItem(
        "Field Director — Montgomery County · Fellowship OF Christian Athletes"
      ),
      false
    );
    assert.equal(looksLikePersonListItem("RSVP — CrossRoads connect Cross Roads"), false);
  });

  it("sanitizes junk model RSVP lists into a clear fallback", () => {
    const junk = `Launch Event Registration List - June 2026

1. CrossRoads Connect
2. Contact
3. Events — CrossRoads Connect Cross Roads
4. Friday — 2026
5. Executive Leader — Power Lifter
6. VP — Commercial Banking · John Marshall Bank
7. Founder
8. Field Director — Montgomery County · Fellowship OF Christian Athletes
9. RSVP — CrossRoads connect Cross Roads`;
    const out = sanitizePeopleRosterAnswer(junk);
    assert.match(out, /couldn't find clear attendee names/i);
    assert.doesNotMatch(out, /CrossRoads Connect/);
    assert.doesNotMatch(out, /Executive Leader/);
  });

  it("keeps real people when sanitizing a mixed list", () => {
    const mixed = `August RSVP list

1. Contact
2. Joshua Mughogho — Triwell Tech
3. Events — Home
4. Jeff Hunt — Fellowship
5. Founder`;
    const out = sanitizePeopleRosterAnswer(mixed);
    assert.match(out, /Joshua Mughogho/);
    assert.match(out, /Jeff Hunt/);
    assert.doesNotMatch(out, /^1\. Contact$/m);
    assert.doesNotMatch(out, /Founder/);
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
