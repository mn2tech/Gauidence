import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { proposalMatchesEntity } from "../entity360";
import { formatEntity360UserAnswer } from "../formatForGideon";
import { proposalTitleWithoutClientPrefix } from "../relationshipReasoning";
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
