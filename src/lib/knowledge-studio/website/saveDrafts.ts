import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CROSSROADS_ORG_SLUG,
  CROSSROADS_WEBSITE_SOURCE_LABEL,
} from "@/lib/knowledge-studio/constants";
import {
  eventDuplicateKey,
  factDuplicateKey,
} from "@/lib/knowledge-studio/normalize";
import type {
  ExtractedEvent,
  ExtractedFact,
  KnowledgeEventRow,
  KnowledgeFactRow,
  WebsiteScanSaveResult,
} from "@/lib/knowledge-studio/types";

function isPublished(row: { lifecycle_status: string; visibility: string }): boolean {
  return row.lifecycle_status === "published" && row.visibility === "public";
}

function isProtectedFromOverwrite(row: { lifecycle_status: string }): boolean {
  return row.lifecycle_status !== "archived";
}

function factTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

function eventTitleKey(title: string): string {
  return title.trim().toLowerCase();
}

/**
 * Persist website scan candidates as private drafts.
 * Never auto-publishes. Never silently overwrites published rows.
 */
export async function saveWebsiteScanDrafts(args: {
  admin: SupabaseClient;
  userId: string;
  organizationSlug?: string;
  sourceLabel?: string;
  facts: ExtractedFact[];
  events: ExtractedEvent[];
}): Promise<WebsiteScanSaveResult> {
  const organizationSlug = args.organizationSlug ?? CROSSROADS_ORG_SLUG;
  const sourceLabel = args.sourceLabel ?? CROSSROADS_WEBSITE_SOURCE_LABEL;

  const [{ data: existingFacts }, { data: existingEvents }] = await Promise.all([
    args.admin
      .from("knowledge_facts")
      .select(
        "id, organization_slug, title, content, source_url, lifecycle_status, visibility"
      )
      .eq("organization_slug", organizationSlug),
    args.admin
      .from("knowledge_events")
      .select(
        "id, organization_slug, title, start_at, lifecycle_status, visibility"
      )
      .eq("organization_slug", organizationSlug),
  ]);

  const factKeys = new Map<string, { published: boolean }>();
  for (const row of (existingFacts ?? []) as Pick<
    KnowledgeFactRow,
    "organization_slug" | "title" | "content" | "source_url" | "lifecycle_status" | "visibility"
  >[]) {
    factKeys.set(
      factDuplicateKey({
        organizationSlug: row.organization_slug,
        title: row.title,
        content: row.content,
        sourceUrl: row.source_url,
      }),
      { published: isPublished(row) }
    );
  }

  const eventKeys = new Map<string, { published: boolean }>();
  for (const row of (existingEvents ?? []) as Pick<
    KnowledgeEventRow,
    "organization_slug" | "title" | "start_at" | "lifecycle_status" | "visibility"
  >[]) {
    eventKeys.set(
      eventDuplicateKey({
        organizationSlug: row.organization_slug,
        title: row.title,
        startAt: row.start_at,
      }),
      { published: isPublished(row) }
    );
  }

  let factsCreated = 0;
  let eventsCreated = 0;
  let skippedDuplicates = 0;

  for (const fact of args.facts) {
    const key = factDuplicateKey({
      organizationSlug,
      title: fact.title,
      content: fact.content,
      sourceUrl: fact.source_url,
    });
    const existing = factKeys.get(key);
    if (existing) {
      skippedDuplicates += 1;
      continue;
    }

    // Same title but different content vs any protected row → needs_review candidate.
    const protectedSameTitle = ((existingFacts ?? []) as KnowledgeFactRow[]).find(
      (row) =>
        isProtectedFromOverwrite(row) &&
        factTitleKey(row.title) === factTitleKey(fact.title) &&
        factDuplicateKey({
          organizationSlug: row.organization_slug,
          title: row.title,
          content: row.content,
          sourceUrl: row.source_url,
        }) !== key
    );

    const lifecycle_status = protectedSameTitle ? "needs_review" : "draft";

    const { error } = await args.admin.from("knowledge_facts").insert({
      organization_slug: organizationSlug,
      category: fact.category || "general",
      title: fact.title,
      content: fact.content,
      source_label: sourceLabel,
      source_url: fact.source_url || null,
      lifecycle_status,
      visibility: "private",
      created_by: args.userId,
    });
    if (error) {
      console.error("knowledge_facts insert failed:", error.message);
      continue;
    }
    factKeys.set(key, { published: false });
    factsCreated += 1;
  }

  for (const event of args.events) {
    const key = eventDuplicateKey({
      organizationSlug,
      title: event.title,
      startAt: event.start_at,
    });
    const existing = eventKeys.get(key);
    if (existing) {
      skippedDuplicates += 1;
      continue;
    }

    const protectedSameKeyConflict = ((existingEvents ?? []) as KnowledgeEventRow[]).find(
      (row) =>
        isProtectedFromOverwrite(row) &&
        eventTitleKey(row.title) === eventTitleKey(event.title) &&
        eventDuplicateKey({
          organizationSlug: row.organization_slug,
          title: row.title,
          startAt: row.start_at,
        }) !== key
    );

    const lifecycle_status = protectedSameKeyConflict ? "needs_review" : "draft";

    const { error } = await args.admin.from("knowledge_events").insert({
      organization_slug: organizationSlug,
      title: event.title,
      description: event.description || null,
      start_at: event.start_at,
      end_at: event.end_at,
      location: event.location || null,
      organizer: event.organizer || null,
      contact: event.contact || null,
      rsvp_url: event.rsvp_url || null,
      cost: event.cost || null,
      audience: event.audience || null,
      source_label: sourceLabel,
      source_url: event.source_url || null,
      lifecycle_status,
      visibility: "private",
      created_by: args.userId,
    });
    if (error) {
      console.error("knowledge_events insert failed:", error.message);
      continue;
    }
    eventKeys.set(key, { published: false });
    eventsCreated += 1;
  }

  return {
    facts_found: args.facts.length,
    facts_created: factsCreated,
    events_found: args.events.length,
    events_created: eventsCreated,
    skipped_duplicates: skippedDuplicates,
  };
}
