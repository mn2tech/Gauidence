import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUMMIT_CATEGORY_ROUTES,
  SUMMIT_DISCLAIMER,
  SUMMIT_SLUG,
  SUMMIT_SUGGESTED_QUESTIONS,
  summitAgencyPath,
  summitOpportunityPath,
  summitOrganizationPath,
  summitPublicPath,
  summitResourcePath,
  summitSessionPath,
  summitTakeawayPath,
} from "@/lib/summit-space/constants";
import {
  filterSummitEntitiesForCategory,
  SUMMIT_CATEGORY_LABELS,
} from "@/lib/summit-space/categories";
import { NO_SUMMIT_INFORMATION } from "@/lib/summit-space/ask";
import {
  buildSummitCoverageReport,
  isPrimeContractor,
  summitCategoryCounts,
} from "@/lib/summit-space/graph";
import {
  DEFAULT_PRIVATE_PRIORITIES,
  stripPrivateFields,
} from "@/lib/summit-space/privateCapture";
import {
  buildAgencyPageData,
  buildOpportunityPageData,
  buildOrganizationPageData,
  buildSessionPageData,
  buildTakeawayPageData,
  entitiesByType,
  entityBySlug,
  formatSummitKnowledgeForPrompt,
} from "@/lib/summit-space/retrieve";
import {
  formatSourceAttribution,
  SUMMIT_SOURCE_LABELS,
} from "@/lib/summit-space/sourceTypes";
import type {
  PublishedSummitKnowledge,
  SummitEntityRow,
  SummitRelationshipRow,
  SummitSpaceRow,
} from "@/lib/summit-space/types";

const mockSpace: SummitSpaceRow = {
  id: "space-1",
  slug: SUMMIT_SLUG,
  profile_id: null,
  name: "2026 Small Business Government Contracting Summit",
  subtitle: "Small Business Contracting Intelligence Hub",
  description: "Test description",
  owner_label: "NM2TECH LLC",
  is_public: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function entity(
  partial: Partial<SummitEntityRow> & Pick<SummitEntityRow, "id" | "entity_type" | "slug" | "name">
): SummitEntityRow {
  return {
    summit_slug: SUMMIT_SLUG,
    description: null,
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    source_type: "summit",
    last_updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const mockEntities: SummitEntityRow[] = [
  entity({
    id: "org-saic",
    entity_type: "organization",
    slug: "saic",
    name: "SAIC",
    description: "Prime contractor",
    properties: {
      role: "prime_contractor",
      federal_focus: "Defense IT",
      questions_to_ask: ["How to register?"],
    },
  }),
  entity({
    id: "org-apex",
    entity_type: "organization",
    slug: "apex-accelerator",
    name: "APEX Accelerator",
    description: "Support organization",
    properties: { role: "support_organization" },
  }),
  entity({
    id: "person-rita",
    entity_type: "person",
    slug: "rita-brooks",
    name: "Rita Brooks",
    description: "Director at SAIC",
    properties: { title: "Director", organization: "SAIC" },
  }),
  entity({
    id: "session-sub",
    entity_type: "session",
    slug: "subcontracting-opportunities",
    name: "Subcontracting Opportunities for Small Businesses",
    description: "Panel session",
    properties: {},
  }),
  entity({
    id: "opp-saic",
    entity_type: "opportunity",
    slug: "explore-saic-small-business-subcontracting",
    name: "Explore SAIC Small Business Subcontracting",
    description: "Follow-up with SAIC small business program",
    properties: {
      opportunity_type: "Prime Contractor Outreach",
      organization_slug: "saic",
      why_it_matters: "SAIC was on the panel",
      recommended_next_step: "Research SAIC program",
      capability_areas: ["IT", "data"],
    },
  }),
  entity({
    id: "agency-sba",
    entity_type: "agency",
    slug: "small-business-administration",
    name: "U.S. Small Business Administration (SBA)",
    description: "Federal small business agency",
    source_type: "public",
    source_label: "U.S. Small Business Administration",
    properties: {
      why_it_matters: "SBA supports federal contracting",
      official_resource_url: "https://www.sba.gov/federal-contracting",
    },
  }),
  entity({
    id: "resource-sam",
    entity_type: "resource",
    slug: "sam-gov",
    name: "SAM.gov",
    description: "Official registration system",
    source_type: "public",
    source_label: "SAM.gov",
    properties: {
      who_should_use: "All federal contractors",
      why_it_matters: "Required for awards",
      official_url: "https://sam.gov",
    },
  }),
  entity({
    id: "takeaway-summit",
    entity_type: "action_item",
    slug: "takeaway-explore-subcontracting-pathways",
    name: "Explore subcontracting pathways with panel prime contractors",
    description: "Panel takeaway",
    source_type: "summit",
    properties: { category: "takeaway" },
  }),
  entity({
    id: "takeaway-insight",
    entity_type: "action_item",
    slug: "takeaway-dont-stop-at-registration",
    name: "Don't stop at supplier registration",
    description: "Guardian synthesis",
    source_type: "guardian_insight",
    properties: { category: "takeaway", synthesis_basis: "Panel themes" },
  }),
];

const mockRelationships: SummitRelationshipRow[] = [
  {
    id: "rel-1",
    summit_slug: SUMMIT_SLUG,
    source_entity_id: "person-rita",
    relationship_type: "works_for",
    target_entity_id: "org-saic",
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rel-2",
    summit_slug: SUMMIT_SLUG,
    source_entity_id: "session-sub",
    relationship_type: "mentions",
    target_entity_id: "org-saic",
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rel-3",
    summit_slug: SUMMIT_SLUG,
    source_entity_id: "opp-saic",
    relationship_type: "related_to",
    target_entity_id: "org-saic",
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rel-4",
    summit_slug: SUMMIT_SLUG,
    source_entity_id: "org-saic",
    relationship_type: "offers",
    target_entity_id: "opp-saic",
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rel-5",
    summit_slug: SUMMIT_SLUG,
    source_entity_id: "opp-saic",
    relationship_type: "related_to",
    target_entity_id: "session-sub",
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rel-6",
    summit_slug: SUMMIT_SLUG,
    source_entity_id: "resource-sam",
    relationship_type: "supports",
    target_entity_id: "agency-sba",
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "SBA",
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rel-7",
    summit_slug: SUMMIT_SLUG,
    source_entity_id: "takeaway-summit",
    relationship_type: "related_to",
    target_entity_id: "session-sub",
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "rel-8",
    summit_slug: SUMMIT_SLUG,
    source_entity_id: "person-rita",
    relationship_type: "spoke_at",
    target_entity_id: "session-sub",
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const mockKnowledge: PublishedSummitKnowledge = {
  space: mockSpace,
  entities: mockEntities,
  relationships: mockRelationships,
};

describe("summit space constants", () => {
  it("exposes public path for QR/share", () => {
    assert.equal(
      summitPublicPath(SUMMIT_SLUG),
      "/s/small-business-summit-2026"
    );
    assert.equal(
      summitOrganizationPath(SUMMIT_SLUG, "saic"),
      "/s/small-business-summit-2026/organization/saic"
    );
    assert.equal(
      summitOpportunityPath(SUMMIT_SLUG, "explore-saic-small-business-subcontracting"),
      "/s/small-business-summit-2026/opportunity/explore-saic-small-business-subcontracting"
    );
    assert.equal(
      summitAgencyPath(SUMMIT_SLUG, "small-business-administration"),
      "/s/small-business-summit-2026/agency/small-business-administration"
    );
    assert.equal(
      summitResourcePath(SUMMIT_SLUG, "sam-gov"),
      "/s/small-business-summit-2026/resource/sam-gov"
    );
    assert.equal(
      summitSessionPath(SUMMIT_SLUG, "subcontracting-opportunities"),
      "/s/small-business-summit-2026/session/subcontracting-opportunities"
    );
    assert.equal(
      summitTakeawayPath(SUMMIT_SLUG, "takeaway-dont-stop-at-registration"),
      "/s/small-business-summit-2026/takeaway/takeaway-dont-stop-at-registration"
    );
  });

  it("defines all homepage category routes", () => {
    assert.equal(SUMMIT_CATEGORY_ROUTES.length, 6);
    for (const route of SUMMIT_CATEGORY_ROUTES) {
      assert.ok(SUMMIT_CATEGORY_LABELS[route]);
      assert.ok(summitPublicPath(SUMMIT_SLUG).includes("/s/"));
    }
  });

  it("includes suggested questions for attendees", () => {
    assert.ok(SUMMIT_SUGGESTED_QUESTIONS.length >= 8);
    assert.ok(
      SUMMIT_SUGGESTED_QUESTIONS.some((q) =>
        q.toLowerCase().includes("subcontracting")
      )
    );
    assert.ok(
      SUMMIT_SUGGESTED_QUESTIONS.some((q) =>
        q.toLowerCase().includes("saic")
      )
    );
  });

  it("includes procurement disclaimer", () => {
    assert.ok(SUMMIT_DISCLAIMER.includes("Verify procurement"));
  });
});

describe("summit category filtering and counts", () => {
  it("filters opportunities, agencies, resources, and takeaways", () => {
    assert.equal(
      filterSummitEntitiesForCategory("opportunities", mockEntities).length,
      1
    );
    assert.equal(
      filterSummitEntitiesForCategory("agencies", mockEntities).length,
      1
    );
    assert.equal(
      filterSummitEntitiesForCategory("resources", mockEntities).length,
      1
    );
    assert.equal(
      filterSummitEntitiesForCategory("takeaways", mockEntities).length,
      2
    );
    assert.equal(
      filterSummitEntitiesForCategory("sessions", mockEntities).length,
      1
    );
  });

  it("excludes APEX from prime contractors", () => {
    const primes = filterSummitEntitiesForCategory(
      "prime-contractors",
      mockEntities
    );
    assert.equal(primes.length, 1);
    assert.equal(primes[0]?.slug, "saic");
    const apex = entityBySlug(mockEntities, "apex-accelerator")!;
    assert.equal(isPrimeContractor(apex), false);
  });

  it("computes dynamic category counts from entities", () => {
    const counts = summitCategoryCounts(mockKnowledge);
    assert.equal(counts.opportunities, 1);
    assert.equal(counts["prime-contractors"], 1);
    assert.equal(counts.agencies, 1);
    assert.equal(counts.resources, 1);
    assert.equal(counts.takeaways, 2);
    assert.equal(counts.sessions, 1);
  });

  it("does not count non-takeaway action items", () => {
    const withAction = [
      ...mockEntities,
      entity({
        id: "action-followup",
        entity_type: "action_item",
        slug: "follow-up-email",
        name: "Send follow-up email",
        properties: {},
      }),
    ];
    assert.equal(
      filterSummitEntitiesForCategory("takeaways", withAction).length,
      2
    );
  });
});

describe("summit knowledge retrieval helpers", () => {
  it("filters entities by type", () => {
    const orgs = entitiesByType(mockEntities, "organization");
    assert.equal(orgs.length, 2);
  });

  it("builds organization page with speakers, sessions, and opportunities", () => {
    const page = buildOrganizationPageData(mockKnowledge, "saic");
    assert.ok(page);
    assert.equal(page!.organization.name, "SAIC");
    assert.equal(page!.speakers.length, 1);
    assert.equal(page!.sessions.length, 1);
    assert.equal(page!.opportunities.length, 1);
  });

  it("builds opportunity page with related organization and session", () => {
    const page = buildOpportunityPageData(
      mockKnowledge,
      "explore-saic-small-business-subcontracting"
    );
    assert.ok(page);
    assert.equal(page!.organization?.name, "SAIC");
    assert.equal(page!.sessions.length, 1);
    assert.ok(page!.opportunity.properties.why_it_matters);
  });

  it("builds agency page with supported resources", () => {
    const page = buildAgencyPageData(
      mockKnowledge,
      "small-business-administration"
    );
    assert.ok(page);
    assert.equal(page!.resources.length, 1);
    assert.equal(page!.resources[0]?.name, "SAM.gov");
  });

  it("builds session page with speakers and opportunities", () => {
    const page = buildSessionPageData(
      mockKnowledge,
      "subcontracting-opportunities"
    );
    assert.ok(page);
    assert.equal(page!.speakers.length, 1);
    assert.equal(page!.organizations.length, 1);
    assert.equal(page!.opportunities.length, 1);
  });

  it("builds takeaway page with session evidence", () => {
    const summitTakeaway = buildTakeawayPageData(
      mockKnowledge,
      "takeaway-explore-subcontracting-pathways"
    );
    assert.ok(summitTakeaway);
    assert.equal(summitTakeaway!.sessions.length, 1);

    const insightTakeaway = buildTakeawayPageData(
      mockKnowledge,
      "takeaway-dont-stop-at-registration"
    );
    assert.ok(insightTakeaway);
    assert.equal(insightTakeaway!.takeaway.source_type, "guardian_insight");
  });

  it("returns null for unknown slugs", () => {
    assert.equal(buildOrganizationPageData(mockKnowledge, "unknown"), null);
    assert.equal(buildOpportunityPageData(mockKnowledge, "unknown"), null);
  });
});

describe("source type labeling", () => {
  it("labels summit, public, and guardian insight sources", () => {
    assert.equal(formatSourceAttribution("summit"), SUMMIT_SOURCE_LABELS.summit);
    assert.equal(formatSourceAttribution("public"), SUMMIT_SOURCE_LABELS.public);
    assert.equal(
      formatSourceAttribution("guardian_insight"),
      SUMMIT_SOURCE_LABELS.guardian_insight
    );
  });

  it("formats knowledge with correct attribution per source type", () => {
    const prompt = formatSummitKnowledgeForPrompt(mockKnowledge);
    assert.ok(prompt.includes("VERIFIED SUMMIT INFORMATION"));
    assert.ok(prompt.includes("PUBLICLY VERIFIED INFORMATION"));
    assert.ok(prompt.includes("GUARDIAN INSIGHT"));
    assert.ok(prompt.includes("SAM.gov"));
    assert.ok(prompt.includes("Explore SAIC Small Business Subcontracting"));
    assert.ok(prompt.includes("Capability areas: IT, data"));
  });

  it("summit takeaways use summit source type in prompt", () => {
    const prompt = formatSummitKnowledgeForPrompt(mockKnowledge);
    assert.ok(prompt.includes("Explore subcontracting pathways"));
  });
});

describe("knowledge graph cross-linking", () => {
  it("discovers opportunities from organization via offers relationship", () => {
    const page = buildOrganizationPageData(mockKnowledge, "saic");
    assert.equal(page!.opportunities[0]?.slug, "explore-saic-small-business-subcontracting");
  });

  it("does not fabricate agency-prime relationships", () => {
    const agencyPage = buildAgencyPageData(
      mockKnowledge,
      "small-business-administration"
    );
    assert.equal(agencyPage!.organizations.length, 0);
  });

  it("lists only verified relationships in prompt", () => {
    const prompt = formatSummitKnowledgeForPrompt(mockKnowledge);
    assert.ok(prompt.includes("SAIC offers Explore SAIC Small Business Subcontracting"));
    assert.ok(!prompt.includes("SAIC primes_for"));
    assert.ok(prompt.includes("do not invent additional links"));
  });
});

describe("summit private capture", () => {
  it("defines default priorities for NM2TECH", () => {
    const saic = DEFAULT_PRIVATE_PRIORITIES.find(
      (p) => p.organization_name === "SAIC"
    );
    assert.equal(saic?.priority, "HIGH");
  });

  it("strips private fields from public payloads", () => {
    const safe = stripPrivateFields({
      name: "SAIC",
      priority: "HIGH",
      notes: "secret strategy",
      relationship_strength: "strong",
    });
    assert.equal(safe.name, "SAIC");
    assert.equal((safe as Record<string, unknown>).priority, undefined);
    assert.equal((safe as Record<string, unknown>).notes, undefined);
  });
});

describe("summit Gideon mode", () => {
  it("uses a no-information fallback message", () => {
    assert.ok(NO_SUMMIT_INFORMATION.includes("verified summit information"));
  });

  it("includes cross-entity types for Gideon retrieval", () => {
    const prompt = formatSummitKnowledgeForPrompt(mockKnowledge);
    assert.ok(prompt.includes("ORGANIZATIONS:"));
    assert.ok(prompt.includes("OPPORTUNITIES:"));
    assert.ok(prompt.includes("AGENCIES:"));
    assert.ok(prompt.includes("RESOURCES:"));
    assert.ok(prompt.includes("SUMMIT TAKEAWAYS:"));
    assert.ok(prompt.includes("RELATIONSHIPS"));
  });
});

describe("admin knowledge coverage", () => {
  it("reports entity counts and enrichment gaps", () => {
    const report = buildSummitCoverageReport(mockKnowledge);
    assert.equal(report.counts.Opportunities, 1);
    assert.equal(report.counts.People, 1);
    assert.ok(report.gaps.length > 0);
    assert.ok(report.gaps.includes("Opportunities") || report.gaps.includes("Agencies"));
  });
});

describe("public vs private data separation", () => {
  it("private capture priorities are not in public knowledge format", () => {
    const prompt = formatSummitKnowledgeForPrompt(mockKnowledge);
    assert.ok(!prompt.includes("secret strategy"));
    assert.ok(!prompt.includes("relationship_strength"));
    assert.ok(!prompt.includes("capture strategy"));
  });

  it("only published public entities appear in formatted prompt", () => {
    const draftEntity: SummitEntityRow = {
      ...mockEntities[0]!,
      id: "draft-org",
      name: "Secret Org",
      lifecycle_status: "draft",
      visibility: "private",
    };
    const withDraft: PublishedSummitKnowledge = {
      ...mockKnowledge,
      entities: [...mockEntities, draftEntity],
    };
    const prompt = formatSummitKnowledgeForPrompt(withDraft);
    assert.ok(!prompt.includes("Secret Org"));
  });
});
