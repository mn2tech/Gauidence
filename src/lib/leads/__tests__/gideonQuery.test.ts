import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLeadFollowUps,
  formatLeadPipeline,
  formatBusinessCardsAddedOn,
  formatUploadedBusinessCardsAddedOn,
  parseLeadsGideonQuery,
  resolveBusinessCardCalendarDate,
  wantsLeadsQuery,
} from "../gideonQuery";
import type { BusinessLead } from "../types";

function lead(overrides: Partial<BusinessLead> = {}): BusinessLead {
  return {
    id: "1",
    business_profile_id: "bp",
    company_name: "Acme",
    contact_name: "Jane Doe",
    job_title: "COO",
    email: "jane@acme.com",
    phone: null,
    website: null,
    address: null,
    source: null,
    source_detail: null,
    notes: null,
    status: "new",
    lead_score: 80,
    recommended_service: null,
    opportunity_summary: null,
    conversation_angle: null,
    next_action: "Send intro email",
    last_activity_at: "2026-08-18T00:00:00.000Z",
    proposal_id: null,
    document_id: null,
    created_by: "u1",
    created_at: "2026-08-18T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("leads Gideon query", () => {
  it("parses pipeline questions", () => {
    const result = parseLeadsGideonQuery("Show me my leads");
    assert.equal(result.intent, "pipeline");
    assert.equal(wantsLeadsQuery("How many leads do I have?"), true);
  });

  it("does not steal document questions", () => {
    assert.equal(wantsLeadsQuery("What does this contract say?"), false);
    assert.equal(parseLeadsGideonQuery("Create a reminder about lunch").intent, "unknown");
  });

  it("parses create with company, contact, and email", () => {
    const result = parseLeadsGideonQuery(
      "Add a lead for Acme, Jane Doe, jane@acme.com"
    );
    assert.equal(result.intent, "create");
    assert.equal(result.companyName, "Acme");
    assert.equal(result.contactName, "Jane Doe");
    assert.equal(result.email, "jane@acme.com");
    assert.equal(result.requiresConfirmation, true);
  });

  it("confirms create when the user says yes", () => {
    const result = parseLeadsGideonQuery("Yes, add this lead for Proxdose");
    assert.equal(result.intent, "create");
    assert.equal(result.confirmed, true);
    assert.equal(result.requiresConfirmation, false);
    assert.equal(result.companyName, "Proxdose");
  });

  it("parses status updates", () => {
    const result = parseLeadsGideonQuery("Mark Acme as contacted");
    assert.equal(result.intent, "update_status");
    assert.equal(result.search, "Acme");
    assert.equal(result.status, "contacted");
    assert.equal(result.requiresConfirmation, true);
  });

  it("parses a yes-add-this-lead confirmation", () => {
    const result = parseLeadsGideonQuery("Yes, add this lead");
    assert.equal(result.intent, "create");
    assert.equal(result.confirmed, true);
  });

  it("parses lookup and follow-up", () => {
    assert.equal(
      parseLeadsGideonQuery("Tell me about the Acme lead").intent,
      "lookup"
    );
    assert.equal(
      parseLeadsGideonQuery("Tell me about the Acme lead").search,
      "Acme"
    );
    assert.equal(
      parseLeadsGideonQuery("Which leads need follow-up?").intent,
      "follow_up"
    );
  });

  it("parses today's actions, federal, stale, and match questions", () => {
    assert.equal(
      parseLeadsGideonQuery("Which leads should I contact today?").intent,
      "today"
    );
    const federal = parseLeadsGideonQuery(
      "Show federal partners I haven't contacted."
    );
    assert.equal(federal.intent, "federal");
    assert.equal(federal.uncontacted, true);
    assert.equal(
      parseLeadsGideonQuery("Which relationships are becoming stale?").intent,
      "stale"
    );
    const match = parseLeadsGideonQuery(
      "Which partners match our AI capabilities?"
    );
    assert.equal(match.intent, "match");
    assert.equal(match.matchTerm, "ai");
  });

  it("treats cards added today as a business-card lookup, not a pipeline summary", () => {
    assert.equal(
      parseLeadsGideonQuery("Can you check the business cards that I added today?").intent,
      "business_cards"
    );
  });

  it("treats cards added on Friday as dated business-card activity", () => {
    const parsed = parseLeadsGideonQuery(
      "What business cards did I add on Friday?"
    );
    assert.equal(parsed.intent, "business_cards");
    assert.equal(parsed.dateReference, "friday");
    assert.equal(
      resolveBusinessCardCalendarDate(parsed.dateReference, "2026-09-12"),
      "2026-09-11"
    );
  });

  it("recognizes base-form business-card verbs after did I", () => {
    for (const question of [
      "Which business cards did I scan yesterday?",
      "What business cards did I upload today?",
      "Which business cards did I save on Monday?",
    ]) {
      assert.equal(parseLeadsGideonQuery(question).intent, "business_cards");
    }
  });

  it("resolves yesterday and last weekday references deterministically", () => {
    assert.equal(
      resolveBusinessCardCalendarDate("yesterday", "2026-09-12"),
      "2026-09-11"
    );
    assert.equal(
      resolveBusinessCardCalendarDate("last friday", "2026-09-11"),
      "2026-09-04"
    );
  });

  it("lists only business-card leads created on the requested local day", () => {
    const text = formatBusinessCardsAddedOn(
      [
        lead({
          id: "card-1",
          contact_name: "Larry Smith",
          company_name: "Example Co",
          source: "Business Card",
          created_at: "2026-09-11T13:00:00.000Z",
        }),
        lead({
          id: "proposal-1",
          company_name: "Washington Christian Academy",
          source: "Proposal",
          created_at: "2026-09-11T14:00:00.000Z",
        }),
      ],
      "2026-09-11",
      "America/New_York"
    );
    assert.match(text, /Larry Smith/);
    assert.match(text, /Friday, September 11, 2026/);
    assert.doesNotMatch(text, /Washington Christian Academy/);
  });

  it("uses linked card upload metadata when the lead source or date changed", () => {
    const text = formatBusinessCardsAddedOn(
      [
        lead({
          id: "card-2",
          contact_name: "Dennis",
          company_name: "Amor Studio Salons",
          source: "Networking Event",
          document_id: "document-1",
          created_at: "2026-09-12T02:00:00.000Z",
        }),
      ],
      "2026-09-11",
      "America/New_York",
      [
        {
          id: "document-1",
          mime_type: "image/jpeg",
          created_at: "2026-09-11T22:30:00.000Z",
        },
      ]
    );

    assert.match(text, /Dennis/);
    assert.match(text, /Amor Studio Salons/);
  });

  it("finds business cards uploaded as regular Guardian documents", () => {
    const text = formatUploadedBusinessCardsAddedOn(
      [
        {
          id: "document-2",
          file_name: "IMG_2042.jpg",
          mime_type: "image/jpeg",
          created_at: "2026-09-11T22:30:00.000Z",
          title: "Larry Smith business card",
          summary: "Business card for Larry Smith at Example Co.",
          document_type: "general",
          facts: [
            { label: "Contact name", value: "Larry Smith" },
            { label: "Company", value: "Example Co" },
          ],
        },
        {
          id: "document-3",
          file_name: "family-photo.jpg",
          mime_type: "image/jpeg",
          created_at: "2026-09-11T23:00:00.000Z",
          title: "Family photo",
          summary: "A family photograph.",
          document_type: "general",
        },
      ],
      "2026-09-11",
      "America/New_York"
    );

    assert.match(text ?? "", /Larry Smith/);
    assert.match(text ?? "", /Example Co/);
    assert.doesNotMatch(text ?? "", /family-photo/);
  });

  it("formats a pipeline summary", () => {
    const text = formatLeadPipeline([
      lead(),
      lead({ id: "2", status: "won", company_name: "Won Co" }),
    ]);
    assert.match(text, /Leads pipeline: 2/);
    assert.match(text, /Commercial/);
    assert.match(text, /Acme/);
    assert.match(text, /\/leads/);
  });

  it("formats follow-ups with next action", () => {
    const text = formatLeadFollowUps([lead({ status: "follow_up" })]);
    assert.match(text, /Send intro email/);
  });
});
