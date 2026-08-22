import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPlatformAdmin } from "@/lib/admin";
import {
  assertAllowedWebsiteUrl,
  eventDuplicateKey,
  factDuplicateKey,
  isIpHostname,
  isLocalHostname,
} from "@/lib/knowledge-studio/normalize";
import { stripHtmlToText } from "@/lib/knowledge-studio/website/stripHtml";
import { CROSSROADS_ALLOWED_HOSTS } from "@/lib/knowledge-studio/constants";
import {
  isPubliclyRetrievable,
  unpublishPatch,
  archivePatch,
  editLifecyclePatch,
  restorePatch,
  publishPatch,
} from "@/lib/knowledge-studio/lifecycle";
import {
  NO_APPROVED_CROSSROADS_ANSWER,
  NO_UPCOMING_CROSSROADS_EVENT,
  scopeKnowledgeForQuestion,
} from "@/lib/knowledge-studio/eventScope";
import { formatPublishedKnowledgeForPrompt } from "@/lib/knowledge-studio/retrieve";
import {
  formatEasternDateTime,
  formatEasternTimeRange,
  isEventStillActive,
  wantsNextUpcomingEvent,
} from "@/lib/knowledge-studio/formatTime";
import type {
  KnowledgeEventRow,
  KnowledgeFactRow,
} from "@/lib/knowledge-studio/types";

describe("Knowledge Studio admin gate", () => {
  it("rejects non-admins when ADMIN_EMAILS is set", () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "admin@example.com";
    try {
      assert.equal(isPlatformAdmin("admin@example.com"), true);
      assert.equal(isPlatformAdmin("user@example.com"), false);
      assert.equal(isPlatformAdmin(null), false);
    } finally {
      process.env.ADMIN_EMAILS = prev;
    }
  });
});

describe("website domain allowlist", () => {
  it("allows only CrossRoads HTTPS hosts", () => {
    assert.ok(
      assertAllowedWebsiteUrl(
        "https://www.crossroadsconnect.us/events",
        CROSSROADS_ALLOWED_HOSTS
      )
    );
    assert.ok(
      assertAllowedWebsiteUrl(
        "https://crossroadsconnect.us/",
        CROSSROADS_ALLOWED_HOSTS
      )
    );
  });

  it("rejects arbitrary URLs, localhost, and IPs", () => {
    assert.throws(() =>
      assertAllowedWebsiteUrl("https://evil.example/", CROSSROADS_ALLOWED_HOSTS)
    );
    assert.throws(() =>
      assertAllowedWebsiteUrl("http://www.crossroadsconnect.us/", CROSSROADS_ALLOWED_HOSTS)
    );
    assert.throws(() =>
      assertAllowedWebsiteUrl("https://localhost/events", CROSSROADS_ALLOWED_HOSTS)
    );
    assert.throws(() =>
      assertAllowedWebsiteUrl("https://127.0.0.1/", CROSSROADS_ALLOWED_HOSTS)
    );
    assert.equal(isLocalHostname("localhost"), true);
    assert.equal(isIpHostname("203.0.113.10"), true);
  });
});

describe("duplicate keys", () => {
  it("matches events on org + title + start_at", () => {
    const a = eventDuplicateKey({
      organizationSlug: "crossroadsconnect",
      title: "August Gathering",
      startAt: "2026-08-21T12:00:00.000Z",
    });
    const b = eventDuplicateKey({
      organizationSlug: "crossroadsconnect",
      title: "august gathering",
      startAt: "2026-08-21T12:00:00.000Z",
    });
    assert.equal(a, b);
    const c = eventDuplicateKey({
      organizationSlug: "crossroadsconnect",
      title: "August Gathering",
      startAt: "2026-09-21T12:00:00.000Z",
    });
    assert.notEqual(a, c);
  });

  it("matches facts on normalized title/content/source", () => {
    const a = factDuplicateKey({
      organizationSlug: "crossroadsconnect",
      title: "Purpose",
      content: "Helping leaders integrate faith, purpose, and excellence.",
      sourceUrl: "https://www.crossroadsconnect.us/",
    });
    const b = factDuplicateKey({
      organizationSlug: "crossroadsconnect",
      title: "purpose",
      content: "Helping leaders integrate faith, purpose, and excellence.",
      sourceUrl: "https://www.crossroadsconnect.us/",
    });
    assert.equal(a, b);
  });
});

describe("HTML strip", () => {
  it("removes scripts and keeps visible text", () => {
    const text = stripHtmlToText(
      `<html><head><script>alert(1)</script><style>.x{}</style></head>
       <body><nav>Home</nav><h1>CrossRoads Connect</h1>
       <p>Helps leaders integrate faith and purpose.</p>
       <footer>Cookie accept all</footer></body></html>`,
      5000
    );
    assert.match(text, /CrossRoads Connect/);
    assert.match(text, /faith and purpose/);
    assert.doesNotMatch(text, /alert\(1\)/);
  });
});

describe("Eastern time display", () => {
  it("shows CrossRoads gathering times in Eastern, not UTC labels", () => {
    // 12:45–14:15 UTC on Aug 21 2026 == 8:45–10:15 AM EDT
    const start = formatEasternDateTime("2026-08-21T12:45:00.000Z");
    const range = formatEasternTimeRange(
      "2026-08-21T12:45:00.000Z",
      "2026-08-21T14:15:00.000Z"
    );
    assert.ok(start);
    assert.match(start!, /8:45\s*AM/i);
    assert.doesNotMatch(start!, /\bUTC\b/i);
    assert.ok(range);
    assert.match(range!, /8:45\s*AM/i);
    assert.match(range!, /10:15\s*AM/i);
    assert.match(range!, /Eastern Time/i);
  });
});

describe("public knowledge visibility helpers", () => {
  const draftFact = {
    id: "1",
    organization_slug: "crossroadsconnect",
    category: "purpose",
    title: "Purpose",
    content: "Draft only",
    source_label: "CrossRoads Connect website",
    source_url: "https://www.crossroadsconnect.us/",
    lifecycle_status: "draft",
    visibility: "private",
    published_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as KnowledgeFactRow;

  const publishedFact = {
    ...draftFact,
    id: "2",
    content: "Helping leaders integrate faith, purpose, and excellence.",
    lifecycle_status: "published",
    visibility: "public",
    published_at: "2026-01-02T00:00:00Z",
  } as KnowledgeFactRow;

  const publishedEvent = {
    id: "e1",
    organization_slug: "crossroadsconnect",
    title: "August Gathering",
    description: "Networking breakfast",
    start_at: "2026-08-21T12:00:00.000Z",
    end_at: null,
    location: "Rockville, MD",
    organizer: "CrossRoads Connect",
    contact: null,
    rsvp_url: "https://www.crossroadsconnect.us/events",
    cost: "Free",
    audience: "Leaders",
    source_label: "CrossRoads Connect website",
    source_url: "https://www.crossroadsconnect.us/events",
    lifecycle_status: "published",
    visibility: "public",
    published_at: "2026-01-02T00:00:00Z",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as KnowledgeEventRow;

  it("formats only the published knowledge passed in", () => {
    const prompt = formatPublishedKnowledgeForPrompt({
      facts: [publishedFact],
      events: [publishedEvent],
    });
    assert.match(prompt, /Helping leaders integrate/);
    assert.match(prompt, /August Gathering/);
    assert.match(prompt, /When \(America\/New_York\)/);
    assert.doesNotMatch(prompt, /Draft only/);
  });

  it("exposes the safe unsupported-answer copy", () => {
    assert.match(
      NO_APPROVED_CROSSROADS_ANSWER,
      /don't have approved CrossRoads Connect information/i
    );
  });

  it("treats draft/private rows as out of public scope by status fields", () => {
    assert.notEqual(draftFact.lifecycle_status, "published");
    assert.notEqual(draftFact.visibility, "public");
    assert.equal(publishedFact.lifecycle_status, "published");
    assert.equal(publishedFact.visibility, "public");
  });
});

describe("upcoming event filtering", () => {
  // Gathering: Aug 21 2026 8:45–10:15 AM EDT
  const gathering = {
    id: "e1",
    organization_slug: "crossroadsconnect",
    title: "CrossRoads Connect Gathering",
    description: "Breakfast",
    start_at: "2026-08-21T12:45:00.000Z",
    end_at: "2026-08-21T14:15:00.000Z",
    location: "Rockville, MD",
    organizer: null,
    contact: null,
    rsvp_url: null,
    cost: null,
    audience: null,
    source_label: "CrossRoads Connect website",
    source_url: "https://www.crossroadsconnect.us/events",
    lifecycle_status: "published",
    visibility: "public",
    published_at: "2026-01-02T00:00:00Z",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as KnowledgeEventRow;

  const laterEvent = {
    ...gathering,
    id: "e2",
    title: "September Gathering",
    start_at: "2026-09-18T12:45:00.000Z",
    end_at: "2026-09-18T14:15:00.000Z",
  } as KnowledgeEventRow;

  // Evening after the Aug 21 gathering ended (10:34 PM EDT)
  const afterGatheringMs = Date.parse("2026-08-22T02:34:00.000Z");

  it("detects next-event questions", () => {
    assert.equal(wantsNextUpcomingEvent("What is the next event?"), true);
    assert.equal(wantsNextUpcomingEvent("Where is the next event?"), true);
    assert.equal(wantsNextUpcomingEvent("How do I RSVP?"), false);
  });

  it("treats ended gatherings as inactive", () => {
    assert.equal(isEventStillActive(gathering, afterGatheringMs), false);
    assert.equal(
      isEventStillActive(gathering, Date.parse("2026-08-21T13:00:00.000Z")),
      true
    );
  });

  it("drops past events when asking for the next event", () => {
    const scoped = scopeKnowledgeForQuestion(
      { facts: [], events: [gathering, laterEvent] },
      "What is the next event?",
      afterGatheringMs
    );
    assert.equal(scoped.events.length, 1);
    assert.equal(scoped.events[0]?.title, "September Gathering");
  });

  it("keeps past events for non-next questions", () => {
    const scoped = scopeKnowledgeForQuestion(
      { facts: [], events: [gathering] },
      "Is there a fee?",
      afterGatheringMs
    );
    assert.equal(scoped.events.length, 1);
  });

  it("exposes no-upcoming copy", () => {
    assert.match(NO_UPCOMING_CROSSROADS_EVENT, /upcoming/i);
  });
});

describe("lifecycle transitions affect public retrieval", () => {
  it("unpublish and archive remove public visibility", () => {
    const published = {
      lifecycle_status: "published",
      visibility: "public",
    };
    assert.equal(isPubliclyRetrievable(published), true);

    const unpublished = {
      lifecycle_status: unpublishPatch().lifecycle_status!,
      visibility: unpublishPatch().visibility!,
    };
    assert.equal(isPubliclyRetrievable(unpublished), false);

    const archived = {
      lifecycle_status: archivePatch().lifecycle_status!,
      visibility: archivePatch().visibility!,
    };
    assert.equal(isPubliclyRetrievable(archived), false);
  });

  it("published edit becomes needs_review and is not public", () => {
    const afterEdit = {
      lifecycle_status: editLifecyclePatch("published").lifecycle_status!,
      visibility: editLifecyclePatch("published").visibility!,
    };
    assert.equal(isPubliclyRetrievable(afterEdit), false);
  });

  it("restore and republish paths", () => {
    const restored = {
      lifecycle_status: restorePatch().lifecycle_status!,
      visibility: restorePatch().visibility!,
    };
    assert.equal(isPubliclyRetrievable(restored), false);

    const republished = {
      lifecycle_status: publishPatch().lifecycle_status!,
      visibility: publishPatch().visibility!,
    };
    assert.equal(isPubliclyRetrievable(republished), true);
  });
});
