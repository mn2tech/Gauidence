import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLeadFollowUps,
  formatLeadPipeline,
  parseLeadsGideonQuery,
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
