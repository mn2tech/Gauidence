import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseCompanyOrContact,
  parseLeadSearchQuery,
  parseLeadStatus,
  parseOptionalText,
  parseUuid,
} from "../validators";
import {
  computeLeadSummary,
  leadDisplayName,
  type BusinessLead,
} from "../types";
import { findDuplicateReasons } from "../duplicates";
import { suggestColumnMapping, mapRowToLead } from "../importMap";

describe("leads validators", () => {
  it("parseUuid accepts valid uuid", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    assert.equal(parseUuid(id), id);
  });

  it("parseUuid rejects invalid", () => {
    assert.equal(parseUuid("not-a-uuid"), null);
    assert.equal(parseUuid(""), null);
  });

  it("parseLeadStatus normalizes status", () => {
    assert.equal(parseLeadStatus("follow-up"), "follow_up");
    assert.equal(parseLeadStatus("New"), "new");
    assert.equal(parseLeadStatus("invalid"), null);
  });

  it("parseCompanyOrContact requires at least one name", () => {
    assert.deepEqual(
      parseCompanyOrContact("ABC Co", "John"),
      { companyName: "ABC Co", contactName: "John" }
    );
    assert.equal(parseCompanyOrContact("", ""), null);
    assert.deepEqual(parseCompanyOrContact("ABC", ""), {
      companyName: "ABC",
      contactName: null,
    });
  });

  it("parseOptionalText trims and rejects empty", () => {
    assert.equal(parseOptionalText("  hello  "), "hello");
    assert.equal(parseOptionalText("   "), null);
  });

  it("parseLeadSearchQuery requires non-empty", () => {
    assert.equal(parseLeadSearchQuery("abc"), "abc");
    assert.equal(parseLeadSearchQuery(""), null);
  });
});

describe("leads types", () => {
  const baseLead = (overrides: Partial<BusinessLead> = {}): BusinessLead => ({
    id: "1",
    business_profile_id: "bp",
    company_name: null,
    contact_name: null,
    job_title: null,
    email: null,
    phone: null,
    website: null,
    address: null,
    source: null,
    source_detail: null,
    notes: null,
    status: "new",
    lead_score: null,
    recommended_service: null,
    opportunity_summary: null,
    conversation_angle: null,
    next_action: null,
    last_activity_at: null,
    proposal_id: null,
    document_id: null,
    opportunity_brief: {},
    created_by: "u",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  });

  it("leadDisplayName prefers company", () => {
    assert.equal(
      leadDisplayName(baseLead({ company_name: "ABC", contact_name: "John" })),
      "ABC"
    );
    assert.equal(
      leadDisplayName(baseLead({ contact_name: "John" })),
      "John"
    );
    assert.equal(leadDisplayName(baseLead()), "Untitled lead");
  });

  it("computeLeadSummary counts statuses", () => {
    const leads = [
      baseLead({ status: "new" }),
      baseLead({ status: "new" }),
      baseLead({ status: "contacted" }),
      baseLead({ status: "interested" }),
      baseLead({ status: "proposal" }),
      baseLead({ status: "won" }),
    ];
    const s = computeLeadSummary(leads);
    assert.equal(s.total, 6);
    assert.equal(s.new, 2);
    assert.equal(s.contacted, 1);
    assert.equal(s.interested, 1);
    assert.equal(s.proposal, 1);
    assert.equal(s.won, 1);
  });
});

describe("leads duplicates", () => {
  const existing: BusinessLead = {
    id: "1",
    business_profile_id: "bp",
    company_name: "ABC Co",
    contact_name: "John Smith",
    email: "john@abc.com",
    phone: "301-555-0100",
    website: "abc.com",
    job_title: null,
    address: null,
    source: null,
    source_detail: null,
    notes: null,
    status: "new",
    lead_score: null,
    recommended_service: null,
    opportunity_summary: null,
    conversation_angle: null,
    next_action: null,
    last_activity_at: null,
    proposal_id: null,
    document_id: null,
    opportunity_brief: {},
    created_by: "u",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };

  it("matches email", () => {
    const reasons = findDuplicateReasons({ email: "john@abc.com" }, existing);
    assert.ok(reasons.includes("email"));
  });

  it("matches company and contact together", () => {
    const reasons = findDuplicateReasons(
      { companyName: "ABC Co", contactName: "John Smith" },
      existing
    );
    assert.ok(reasons.includes("company_and_contact"));
  });
});

describe("leads import mapping", () => {
  it("suggests column mapping from headers", () => {
    const mapping = suggestColumnMapping(["Company Name", "Contact", "Email"]);
    assert.equal(mapping.company, 0);
    assert.equal(mapping.contact, 1);
    assert.equal(mapping.email, 2);
  });

  it("maps row values using mapping", () => {
    const mapped = mapRowToLead(["ABC", "John", "john@abc.com"], {
      company: 0,
      contact: 1,
      email: 2,
    });
    assert.equal(mapped.companyName, "ABC");
    assert.equal(mapped.contactName, "John");
    assert.equal(mapped.email, "john@abc.com");
  });

  it("combines first and last name columns", () => {
    const mapped = mapRowToLead(["ABC", "John", "Smith"], {
      company: 0,
      firstName: 1,
      lastName: 2,
    });
    assert.equal(mapped.companyName, "ABC");
    assert.equal(mapped.contactName, "John Smith");
  });
});
