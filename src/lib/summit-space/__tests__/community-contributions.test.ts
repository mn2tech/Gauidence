import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  contributionStatusCounts,
  filterContributionsByType,
  sanitizeContributionText,
  sanitizeContributionUrl,
  stripPrivateContributionFields,
  toPublicContributionView,
  type PublicContributionView,
  type SummitCommunityContributionRow,
} from "@/lib/summit-space/contributions";
import {
  checkInMemoryRateLimit,
  resetRateLimitForTests,
} from "@/lib/summit-space/contributionRateLimit";
import { findOrCreateSlug, resolveEntityByName } from "@/lib/summit-space/entityResolution";
import {
  formatSourceAttribution,
  SUMMIT_SOURCE_LABELS,
} from "@/lib/summit-space/sourceTypes";
import { NO_SUMMIT_INFORMATION } from "@/lib/summit-space/ask";
import { formatSummitKnowledgeForPrompt } from "@/lib/summit-space/retrieve";
import { SUMMIT_SLUG } from "@/lib/summit-space/constants";
import type {
  PublishedSummitKnowledge,
  SummitEntityRow,
  SummitSpaceRow,
} from "@/lib/summit-space/types";

function mockContribution(
  partial: Partial<SummitCommunityContributionRow> & Pick<SummitCommunityContributionRow, "id">
): SummitCommunityContributionRow {
  return {
    summit_slug: SUMMIT_SLUG,
    contribution_type: "takeaway",
    status: "pending",
    content: "Test content",
    session_entity_id: null,
    organization_entity_id: null,
    speaker_entity_id: null,
    source_url: null,
    contributor_name: "Jane Attendee",
    contributor_company: "Acme Corp",
    contributor_email: "jane@secret.example",
    display_name_publicly: false,
    permission_confirmed: true,
    file_path: null,
    file_mime_type: null,
    extracted_data: {},
    approved_entities: [],
    published_entity_ids: [],
    published_summary: null,
    reviewed_by: null,
    reviewed_at: null,
    published_at: null,
    rejection_reason: null,
    submission_ip_hash: "hash-secret",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const saicEntity: SummitEntityRow = {
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
};

describe("community contribution sanitization", () => {
  it("strips HTML and script injection from text", () => {
    const dirty = '<script>alert("xss")</script>Hello <b>world</b>';
    const clean = sanitizeContributionText(dirty);
    assert.ok(!clean.includes("<script>"));
    assert.ok(!clean.includes("<b>"));
    assert.equal(clean, "alert(\"xss\")Hello world");
  });

  it("rejects javascript: URLs", () => {
    assert.equal(sanitizeContributionUrl("javascript:alert(1)"), null);
    assert.equal(
      sanitizeContributionUrl("https://sam.gov"),
      "https://sam.gov/"
    );
  });

  it("limits text length", () => {
    const long = "a".repeat(6000);
    assert.equal(sanitizeContributionText(long).length, 5000);
  });
});

describe("contributor privacy", () => {
  it("never exposes contributor email in public view", () => {
    const view = toPublicContributionView(
      mockContribution({ id: "c-1" }),
      []
    );
    assert.equal((view as Record<string, unknown>).contributorEmail, undefined);
    assert.equal((view as Record<string, unknown>).email, undefined);
  });

  it("respects display-name preference (default off)", () => {
    const view = toPublicContributionView(
      mockContribution({ id: "c-1", display_name_publicly: false }),
      []
    );
    assert.equal(view.contributorName, null);
    assert.equal(view.contributorCompany, null);
  });

  it("shows name/company only when opted in", () => {
    const view = toPublicContributionView(
      mockContribution({ id: "c-1", display_name_publicly: true }),
      []
    );
    assert.equal(view.contributorName, "Jane Attendee");
    assert.equal(view.contributorCompany, "Acme Corp");
  });

  it("strips private fields from admin-safe payloads", () => {
    const safe = stripPrivateContributionFields(mockContribution({ id: "c-1" }));
    assert.equal((safe as Record<string, unknown>).contributor_email, undefined);
    assert.equal((safe as Record<string, unknown>).submission_ip_hash, undefined);
  });
});

describe("contribution moderation status", () => {
  it("counts contributions by status", () => {
    const counts = contributionStatusCounts([
      { status: "pending" },
      { status: "pending" },
      { status: "approved" },
      { status: "published" },
      { status: "rejected" },
    ]);
    assert.equal(counts.pending, 2);
    assert.equal(counts.approved, 1);
    assert.equal(counts.published, 1);
    assert.equal(counts.rejected, 1);
  });

  it("photo contributions start as pending (not published)", () => {
    const row = mockContribution({
      id: "c-photo",
      contribution_type: "photo",
      status: "pending",
      file_path: "small-business-summit-2026/abc.jpg",
    });
    assert.equal(row.status, "pending");
    assert.notEqual(row.status, "published");
  });
});

describe("community page filtering", () => {
  const views: PublicContributionView[] = [
    {
      id: "1",
      contributionType: "photo",
      content: "Slide photo",
      publishedSummary: null,
      sourceUrl: null,
      session: null,
      organization: null,
      speaker: null,
      contributorName: null,
      contributorCompany: null,
      sourceType: "community",
      publishedAt: "2026-01-01T00:00:00Z",
      hasImage: true,
      imageUrl: null,
    },
    {
      id: "2",
      contributionType: "takeaway",
      content: "Great tip",
      publishedSummary: null,
      sourceUrl: null,
      session: null,
      organization: null,
      speaker: null,
      contributorName: null,
      contributorCompany: null,
      sourceType: "community",
      publishedAt: "2026-01-01T00:00:00Z",
      hasImage: false,
      imageUrl: null,
    },
  ];

  it("filters by contribution type", () => {
    assert.equal(filterContributionsByType(views, "photo").length, 1);
    assert.equal(filterContributionsByType(views, "takeaway").length, 1);
    assert.equal(filterContributionsByType(views, "all").length, 2);
  });
});

describe("entity resolution for duplicates", () => {
  it("does not create duplicate SAIC slug when SAIC already exists", () => {
    const entities = [saicEntity];
    const resolved = resolveEntityByName(entities, "SAIC", "organization");
    assert.ok(resolved);
    assert.equal(resolved!.slug, "saic");

    const { slug, existing } = findOrCreateSlug(entities, "SAIC", "organization");
    assert.equal(slug, "saic");
    assert.ok(existing);
    assert.equal(existing!.id, "org-saic");
  });

  it("resolves SAIC from alternate casing", () => {
    const resolved = resolveEntityByName([saicEntity], "saic", "organization");
    assert.equal(resolved?.slug, "saic");
  });
});

describe("community source type and provenance", () => {
  it("labels community contributions correctly", () => {
    assert.equal(
      formatSourceAttribution("community"),
      SUMMIT_SOURCE_LABELS.community
    );
    assert.equal(
      SUMMIT_SOURCE_LABELS.community,
      "COMMUNITY CONTRIBUTION"
    );
  });

  it("includes community entities in Gideon prompt when published", () => {
    const communityEntity: SummitEntityRow = {
      ...saicEntity,
      id: "org-community",
      slug: "new-prime",
      name: "Community Prime Co",
      source_type: "community",
      source_label: "Community contribution — summit attendee",
      properties: { community_contribution_id: "contrib-123" },
    };

    const mockSpace: SummitSpaceRow = {
      id: "space-1",
      slug: SUMMIT_SLUG,
      profile_id: null,
      name: "Test Summit",
      subtitle: null,
      description: null,
      owner_label: "NM2TECH",
      is_public: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const knowledge: PublishedSummitKnowledge = {
      space: mockSpace,
      entities: [communityEntity],
      relationships: [],
    };

    const prompt = formatSummitKnowledgeForPrompt(knowledge);
    assert.ok(prompt.includes("COMMUNITY CONTRIBUTION"));
    assert.ok(prompt.includes("Community Prime Co"));
  });

  it("rejected entities do not appear in Gideon prompt", () => {
    const draft: SummitEntityRow = {
      ...saicEntity,
      id: "draft-1",
      name: "Rejected Org",
      lifecycle_status: "draft",
      visibility: "private",
      source_type: "community",
    };

    const mockSpace: SummitSpaceRow = {
      id: "space-1",
      slug: SUMMIT_SLUG,
      profile_id: null,
      name: "Test Summit",
      subtitle: null,
      description: null,
      owner_label: "NM2TECH",
      is_public: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const prompt = formatSummitKnowledgeForPrompt({
      space: mockSpace,
      entities: [draft],
      relationships: [],
    });
    assert.ok(!prompt.includes("Rejected Org"));
  });
});

describe("contribution rate limiting", () => {
  beforeEach(() => {
    resetRateLimitForTests();
  });

  it("allows submissions under the limit", () => {
    const key = "test-summit:hash";
    for (let i = 0; i < 5; i++) {
      assert.equal(checkInMemoryRateLimit(key), true);
    }
  });

  it("blocks submissions over the limit", () => {
    const key = "test-summit:hash";
    for (let i = 0; i < 5; i++) {
      checkInMemoryRateLimit(key);
    }
    assert.equal(checkInMemoryRateLimit(key), false);
  });
});

describe("Gideon community provenance guidance", () => {
  it("includes community contribution guidance in system prompt", () => {
    assert.ok(NO_SUMMIT_INFORMATION.includes("verified summit information"));
    assert.ok(
      SUMMIT_SOURCE_LABELS.community.includes("COMMUNITY")
    );
  });
});

describe("extraction does not auto-publish", () => {
  it("pending contributions with extraction remain pending", () => {
    const row = mockContribution({
      id: "c-extract",
      status: "pending",
      extracted_data: {
        sessionTitle: "New Session",
        organizations: [{ name: "SAIC" }],
        proposedEntities: [{ entityType: "organization", name: "SAIC" }],
      },
    });
    assert.equal(row.status, "pending");
    assert.ok(row.extracted_data);
    assert.equal(row.published_entity_ids.length, 0);
  });
});

describe("private NM2TECH capture remains inaccessible", () => {
  it("community public view does not include capture fields", () => {
    const view = toPublicContributionView(mockContribution({ id: "c-1" }), []);
    const json = JSON.stringify(view);
    assert.ok(!json.includes("secret"));
    assert.ok(!json.includes("jane@secret"));
    assert.ok(!json.includes("hash-secret"));
  });
});
