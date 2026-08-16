import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { proposalMatchesEntity } from "../entity360";
import { formatEntity360UserAnswer } from "../formatForGideon";
import {
  formatClientProposalLabel,
  proposalTitleWithoutClientPrefix,
  commitmentItemsForProposal,
} from "../displayNames";
import { buildAdvisoryInsights } from "../advisory";
import type { Entity360 } from "../types";

describe("proposalTitleWithoutClientPrefix", () => {
  it("strips a leading client name from proposal titles", () => {
    assert.equal(
      proposalTitleWithoutClientPrefix(
        "Washington Christian Academy — ai_phone_agent",
        "Washington Christian Academy"
      ),
      "ai_phone_agent"
    );
    assert.equal(
      proposalTitleWithoutClientPrefix(
        "Homepage Redesign Sprint",
        "Proxdose"
      ),
      "Homepage Redesign Sprint"
    );
    assert.equal(
      proposalTitleWithoutClientPrefix(
        "Ashton Manor — Guardian Knowledge Base",
        "AshtonManor"
      ),
      "Guardian Knowledge Base"
    );
    assert.equal(
      formatClientProposalLabel(
        "AshtonManor",
        "Ashton Manor — Guardian Knowledge Base"
      ),
      "AshtonManor — Guardian Knowledge Base"
    );
  });
});

describe("commitmentItemsForProposal", () => {
  it("drops homepage template deliverables on phone-agent proposals", () => {
    assert.deepEqual(
      commitmentItemsForProposal({
        clientName: "Washington Christian Academy",
        title: "Washington Christian Academy — ai_phone_agent",
        deliverables: [
          { title: "Homepage redesign" },
          { title: "Trust & conversion upgrades" },
          { title: "Launch & documentation" },
        ],
      }),
      ["ai_phone_agent"]
    );
    assert.deepEqual(
      commitmentItemsForProposal({
        clientName: "Proxdose",
        title: "Proxdose — Homepage Redesign Sprint",
        deliverables: [
          { title: "Homepage redesign" },
          { title: "Trust & conversion upgrades" },
        ],
      }),
      ["Homepage redesign", "Trust & conversion upgrades"]
    );
  });
});

describe("advisory labels", () => {
  it("does not leak meta gaps or duplicate client names", () => {
    const { insights } = buildAdvisoryInsights({
      proposalFollowUps: [
        {
          proposalId: "p1",
          title: "Ashton Manor — Guardian Knowledge Base",
          clientName: "AshtonManor",
          amountLabel: "$5,000.00",
          status: "viewed",
          score: 9,
          reasons: ["Proposal status is viewed."],
          recommendedAction:
            'Follow up with AshtonManor on "Ashton Manor — Guardian Knowledge Base".',
        },
      ],
      commitmentDueSoon: [],
      risks: [],
      gaps: [
        {
          title: "Missing information",
          summary:
            "Prefer stating uncertainty when Guardian lacks confirmation.",
        },
      ],
    });
    assert.equal(insights[0]?.title, "AshtonManor — Guardian Knowledge Base");
    assert.doesNotMatch(insights[0]?.recommendedNextStep ?? "", /Ashton Manor — Guardian/);
    // Gaps still supported when real, but retrieve no longer injects the meta one.
    assert.ok(insights.some((i) => i.type === "missing_information"));
  });
});

describe("proposalMatchesEntity", () => {
  it("does not match every proposal when client name is missing", () => {
    const mentionKeys = new Set(["proxdose"]);
    assert.equal(
      proposalMatchesEntity(
        {
          title: "ai_phone_agent",
          summary: null,
          client_profile_id: "other",
        },
        {
          mentionKeys,
          profileNames: {},
          entityName: "PROXDOSE",
        }
      ),
      false
    );
    assert.equal(
      proposalMatchesEntity(
        {
          title: "Homepage Redesign Sprint",
          summary: null,
          client_profile_id: "c1",
        },
        {
          mentionKeys,
          profileNames: { c1: "Proxdose" },
          entityName: "PROXDOSE",
        }
      ),
      true
    );
    assert.equal(
      proposalMatchesEntity(
        {
          title: "Homepage Redesign Sprint for Proxdose",
          summary: null,
          client_profile_id: "unknown",
        },
        {
          mentionKeys,
          profileNames: {},
          entityName: "PROXDOSE",
        }
      ),
      true
    );
  });
});

describe("formatEntity360UserAnswer", () => {
  it("prefers SERVES over noisy PROPOSED_TO relationships", () => {
    const entity360: Entity360 = {
      entity: {
        id: "1",
        name: "PROXDOSE",
        type: "client",
        aliases: [],
        description: null,
        domain: "proxdose.com",
        confidence: 0.9,
      },
      relationships: [
        {
          type: "PROPOSED_TO",
          direction: "incoming",
          relatedName: "Authenticated Follow-up Review",
          relatedType: "task",
          relatedId: "x",
        },
        {
          type: "SERVES",
          direction: "incoming",
          relatedName: "NM2TECH LLC",
          relatedType: "organization",
          relatedId: "y",
        },
      ],
      people: [],
      proposals: [
        {
          id: "p1",
          title: "Homepage Redesign Sprint",
          status: "viewed",
          amountLabel: "USD 4,500.00",
          clientName: "Proxdose",
          updatedAt: null,
          sentAt: null,
        },
      ],
      projects: [],
      contracts: [],
      assessments: [
        {
          id: "a1",
          name: "Production Website Security Assessment - PROXDOSE",
          type: "document",
          summary: "8 findings with prioritized remediation",
        },
      ],
      commitments: [],
      risks: [],
      recentActivity: [],
      evidence: [],
      gaps: [],
    };
    const text = formatEntity360UserAnswer(entity360);
    assert.match(text, /NM2TECH|client\/prospect/i);
    assert.doesNotMatch(text, /Authenticated Follow-up Review/);
    assert.match(text, /Homepage Redesign Sprint/);
    assert.doesNotMatch(text, /Washington Christian|Ashton Manor|SSVFD/);
  });

  it("ignores mis-typed assessment PROPOSED_TO edges and uses CRM proposals", () => {
    const entity360: Entity360 = {
      entity: {
        id: "1",
        name: "PROXDOSE",
        type: "client",
        aliases: [],
        description: null,
        domain: "proxdose.com",
        confidence: 0.9,
      },
      relationships: [
        {
          type: "PROPOSED_TO",
          direction: "incoming",
          relatedName: "Authenticated Follow-up Review",
          relatedType: "proposal",
          relatedId: "x",
        },
      ],
      people: [],
      proposals: [
        {
          id: "p1",
          title: "Proxdose — Homepage Redesign Sprint",
          status: "viewed",
          amountLabel: "$4,500.00",
          clientName: null,
          updatedAt: null,
          sentAt: null,
        },
      ],
      projects: [],
      contracts: [],
      assessments: [],
      commitments: [],
      risks: [],
      recentActivity: [],
      evidence: [],
      gaps: [],
    };
    const text = formatEntity360UserAnswer(entity360);
    assert.doesNotMatch(text, /Authenticated Follow-up Review/);
    assert.match(text, /commercial proposal activity/i);
    assert.match(text, /Homepage Redesign Sprint/);
    assert.doesNotMatch(text, /PROXDOSE — Proxdose — Homepage/);
    assert.match(text, /• Proxdose — Homepage Redesign Sprint — \$4,500\.00/);
  });
});
