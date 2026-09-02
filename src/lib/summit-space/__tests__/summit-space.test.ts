import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SUMMIT_DISCLAIMER,
  SUMMIT_SLUG,
  SUMMIT_SUGGESTED_QUESTIONS,
  summitOrganizationPath,
  summitPublicPath,
} from "@/lib/summit-space/constants";
import { NO_SUMMIT_INFORMATION } from "@/lib/summit-space/ask";
import {
  DEFAULT_PRIVATE_PRIORITIES,
  stripPrivateFields,
} from "@/lib/summit-space/privateCapture";
import {
  buildOrganizationPageData,
  entitiesByType,
  entityBySlug,
  formatSummitKnowledgeForPrompt,
} from "@/lib/summit-space/retrieve";
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

const mockEntities: SummitEntityRow[] = [
  {
    id: "org-saic",
    summit_slug: SUMMIT_SLUG,
    entity_type: "organization",
    slug: "saic",
    name: "SAIC",
    description: "Prime contractor",
    properties: { role: "prime_contractor" },
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    source_type: "summit",
    last_updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "person-rita",
    summit_slug: SUMMIT_SLUG,
    entity_type: "person",
    slug: "rita-brooks",
    name: "Rita Brooks",
    description: "Director at SAIC",
    properties: { title: "Director", organization: "SAIC" },
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    source_type: "summit",
    last_updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "session-sub",
    summit_slug: SUMMIT_SLUG,
    entity_type: "session",
    slug: "subcontracting-opportunities",
    name: "Subcontracting Opportunities for Small Businesses",
    description: "Panel session",
    properties: {},
    lifecycle_status: "published",
    visibility: "public",
    source_label: "Summit panel",
    source_url: null,
    source_type: "summit",
    last_updated_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
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
  });

  it("includes suggested questions for attendees", () => {
    assert.ok(SUMMIT_SUGGESTED_QUESTIONS.length >= 6);
    assert.ok(
      SUMMIT_SUGGESTED_QUESTIONS.some((q) =>
        q.toLowerCase().includes("prime contractor")
      )
    );
  });

  it("includes procurement disclaimer", () => {
    assert.ok(SUMMIT_DISCLAIMER.includes("Verify procurement"));
  });
});

describe("summit knowledge retrieval helpers", () => {
  it("filters entities by type", () => {
    const orgs = entitiesByType(mockEntities, "organization");
    assert.equal(orgs.length, 1);
    assert.equal(orgs[0]?.name, "SAIC");
  });

  it("finds entity by slug", () => {
    assert.equal(entityBySlug(mockEntities, "saic")?.name, "SAIC");
    assert.equal(entityBySlug(mockEntities, "missing"), undefined);
  });

  it("builds organization page with speakers and sessions", () => {
    const page = buildOrganizationPageData(mockKnowledge, "saic");
    assert.ok(page);
    assert.equal(page!.organization.name, "SAIC");
    assert.equal(page!.speakers.length, 1);
    assert.equal(page!.speakers[0]?.name, "Rita Brooks");
    assert.equal(page!.sessions.length, 1);
  });

  it("returns null for unknown organization slug", () => {
    assert.equal(buildOrganizationPageData(mockKnowledge, "unknown"), null);
  });

  it("formats knowledge for Gideon with attribution labels", () => {
    const prompt = formatSummitKnowledgeForPrompt(mockKnowledge);
    assert.ok(prompt.includes("VERIFIED SUMMIT INFORMATION"));
    assert.ok(prompt.includes("SAIC"));
    assert.ok(prompt.includes("Rita Brooks"));
    assert.ok(prompt.includes("works for"));
  });
});

describe("summit private capture", () => {
  it("defines default priorities for NM2TECH", () => {
    const saic = DEFAULT_PRIVATE_PRIORITIES.find(
      (p) => p.organization_name === "SAIC"
    );
    assert.equal(saic?.priority, "HIGH");
    const boeing = DEFAULT_PRIVATE_PRIORITIES.find(
      (p) => p.organization_name === "The Boeing Company"
    );
    assert.equal(boeing?.priority, "MEDIUM");
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
});

describe("public vs private data separation", () => {
  it("private capture priorities are not in public knowledge format", () => {
    const prompt = formatSummitKnowledgeForPrompt(mockKnowledge);
    assert.ok(!prompt.includes("HIGH"));
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
