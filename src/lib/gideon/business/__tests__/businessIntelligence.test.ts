import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectBusinessQueryIntent,
  extractBusinessEntityMentions,
  planBusinessQuery,
} from "../queryPlanner";
import {
  classifyBusinessKnowledge,
  shouldExcludeFromBusinessOntology,
} from "../knowledgeFilter";
import { scoreProposalFollowUp } from "../proposalFollowUp";
import { formatEvidenceAnswerFromClaims, parseClaimsJson } from "../claims";
import { buildAdvisoryInsights } from "../advisory";
import { deriveCommitmentsFromProposal } from "../commitmentDerive";
import { canonicalizeOrganizationKey, extractDomainHint } from "../../../ontology/normalize";

describe("business query planner", () => {
  it("classifies the seven acceptance questions", () => {
    assert.equal(
      detectBusinessQueryIntent("Show me everything we know about Proxdose."),
      "ENTITY_360"
    );
    assert.equal(
      detectBusinessQueryIntent(
        "Which clients have proposals but no active project?"
      ),
      "RELATIONSHIP_QUERY"
    );
    assert.equal(
      detectBusinessQueryIntent("What proposals need follow-up?"),
      "PROPOSAL_ANALYSIS"
    );
    assert.equal(
      detectBusinessQueryIntent("What relationships do we have with Onyx?"),
      "RELATIONSHIP_QUERY"
    );
    assert.equal(
      detectBusinessQueryIntent("What commitments have we made to each client?"),
      "COMMITMENT_ANALYSIS"
    );
    assert.equal(
      detectBusinessQueryIntent("Where did you get that information?"),
      "EVIDENCE_REQUEST"
    );
    assert.equal(
      detectBusinessQueryIntent("What should I focus on next?"),
      "ADVISORY"
    );
  });

  it("builds intent-specific retrieval flags", () => {
    const entityPlan = planBusinessQuery(
      "Show me everything we know about Proxdose."
    );
    assert.equal(entityPlan.intent, "ENTITY_360");
    assert.ok(entityPlan.requiresOntology);
    assert.ok(entityPlan.requiresSearch);
    assert.ok(entityPlan.entities.some((e) => /proxdose/i.test(e)));

    const evidencePlan = planBusinessQuery("Where did you get that?");
    assert.equal(evidencePlan.intent, "EVIDENCE_REQUEST");
    assert.equal(evidencePlan.requiresSearch, false);
    assert.equal(evidencePlan.requiresOntology, false);

    const proposalPlan = planBusinessQuery("What proposals need follow-up?");
    assert.equal(proposalPlan.requiresStructuredData, true);
    assert.equal(proposalPlan.requiresSearch, false);
  });

  it("extracts entity mentions", () => {
    const mentions = extractBusinessEntityMentions(
      "What relationships do we have with Onyx?"
    );
    assert.ok(mentions.some((m) => /onyx/i.test(m)));
  });
});

describe("business knowledge filter", () => {
  it("filters system/process metadata from Proxdose facts", () => {
    assert.equal(
      shouldExcludeFromBusinessOntology({
        name: "Review the 118 queued documents",
      }),
      true
    );
    assert.equal(
      shouldExcludeFromBusinessOntology({
        name: "Monitor asynchronous ontology extraction",
      }),
      true
    );
    assert.equal(
      shouldExcludeFromBusinessOntology({
        name: "Wait for processing",
        description: "Wait for asynchronous processing to complete",
      }),
      true
    );
    assert.equal(
      shouldExcludeFromBusinessOntology({
        name: "Configure additional settings",
      }),
      true
    );
  });

  it("keeps real business facts", () => {
    assert.equal(
      shouldExcludeFromBusinessOntology({
        name: "PROXDOSE",
        entityType: "client",
      }),
      false
    );
    assert.equal(
      classifyBusinessKnowledge("unsupported PHP runtime security findings")
        .category,
      "BUSINESS_RISK"
    );
    assert.equal(
      classifyBusinessKnowledge("Homepage Redesign Sprint $4,500 proposal")
        .category,
      "BUSINESS_OPPORTUNITY"
    );
  });
});

describe("proposal follow-up scoring", () => {
  it("scores stale open proposals with reasons", () => {
    const scored = scoreProposalFollowUp(
      {
        id: "p1",
        business_profile_id: "b",
        client_profile_id: "c",
        created_by: "u",
        template_id: null,
        title: "Homepage Redesign Sprint",
        summary: null,
        introduction: null,
        terms: null,
        status: "sent",
        version: 1,
        currency: "USD",
        tax_rate_bps: 0,
        subtotal_cents: 450000,
        tax_cents: 0,
        total_cents: 450000,
        line_items: [],
        timeline: [],
        deliverables: [],
        addons: [],
        expires_at: null,
        sent_at: "2026-06-01T00:00:00Z",
        first_viewed_at: null,
        last_viewed_at: null,
        accepted_at: null,
        declined_at: null,
        client_feedback: null,
        document_id: null,
        work_project_id: null,
        portal_token_hash: null,
        portal_token_expires_at: null,
        external_metadata: {},
        created_at: "2026-06-01T00:00:00Z",
        updated_at: "2026-06-01T00:00:00Z",
      },
      {
        clientName: "PROXDOSE",
        now: new Date("2026-08-15T00:00:00Z"),
      }
    );
    assert.ok(scored);
    assert.ok(scored!.score >= 3);
    assert.ok(scored!.reasons.some((r) => /no active project/i.test(r)));
  });
});

describe("claims and evidence", () => {
  it("answers evidence requests from prior claims", () => {
    const claims = parseClaimsJson([
      {
        claim: "PROXDOSE has a $4,500 homepage redesign proposal.",
        evidence: [
          {
            sourceId: "p1",
            sourceType: "proposal",
            label: "Homepage Redesign Sprint Proposal",
            reference: "Investment",
          },
        ],
      },
    ]);
    const answer = formatEvidenceAnswerFromClaims(claims);
    assert.match(answer, /Homepage Redesign Sprint Proposal/);
    assert.match(answer, /Guardian sources/i);
  });
});

describe("advisory ranking", () => {
  it("ranks proposal follow-ups as focus items", () => {
    const { insights } = buildAdvisoryInsights({
      proposalFollowUps: [
        {
          proposalId: "p1",
          title: "Homepage Redesign Sprint",
          clientName: "PROXDOSE",
          amountLabel: "USD 4,500",
          status: "sent",
          score: 8,
          reasons: ["No active project is linked."],
          recommendedAction: "Follow up with PROXDOSE.",
        },
      ],
      commitmentDueSoon: [],
      risks: [],
      gaps: [],
    });
    assert.equal(insights[0]?.type, "proposal_follow_up");
    assert.ok(insights[0]!.priority > 0);
  });
});

describe("commitments", () => {
  it("distinguishes proposed vs agreed deliverables", () => {
    const proposed = deriveCommitmentsFromProposal({
      proposalId: "p1",
      title: "Homepage Redesign",
      status: "sent",
      deliverables: [{ title: "Deliver redesigned homepage" }],
    });
    assert.equal(proposed[0]?.status, "PROPOSED");

    const agreed = deriveCommitmentsFromProposal({
      proposalId: "p1",
      title: "Homepage Redesign",
      status: "accepted",
      deliverables: [{ title: "Deliver redesigned homepage" }],
    });
    assert.equal(agreed[0]?.status, "AGREED");
  });
});

describe("entity resolution helpers", () => {
  it("canonicalizes Proxdose variants", () => {
    assert.equal(canonicalizeOrganizationKey("Proxdose"), "proxdose");
    assert.equal(canonicalizeOrganizationKey("PROXDOSE"), "proxdose");
    assert.equal(canonicalizeOrganizationKey("Proxdose LLC"), "proxdose");
    assert.equal(canonicalizeOrganizationKey("proxdose.com"), "proxdose");
    assert.equal(extractDomainHint("https://www.proxdose.com/about"), "proxdose.com");
  });
});
