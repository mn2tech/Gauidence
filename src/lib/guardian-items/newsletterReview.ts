import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { appNow } from "@/lib/clock";
import {
  buildNewsletterReviewSummary,
  formatReviewCountLines,
  type NewsletterReviewSummary,
} from "./newsletter/review";
import type { GuardianExtractedItem } from "./schema";
import type { GuardianItemType } from "./types";
import type { ItemActionResult } from "./actions";

export type NewsletterReviewPayload = {
  documentId: string;
  documentTitle: string | null;
  extractionStatus: string | null;
  classificationConfidence: number | null;
  summary: NewsletterReviewSummary;
  countLines: string[];
  items: {
    id: string;
    type: string;
    title: string;
    description: string | null;
    event_date: string | null;
    start_at: string | null;
    end_at: string | null;
    confidence: number | null;
    needs_review: boolean;
    child_id: string | null;
    status: string;
  }[];
};

/**
 * Build the post-extraction review payload for a school newsletter document.
 */
export async function getNewsletterReviewForDocument(
  supabase: SupabaseClient,
  documentId: string
): Promise<NewsletterReviewPayload | null> {
  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, file_name, newsletter_extraction_status, newsletter_classification_confidence, profile_id"
    )
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return null;

  const { data: rows } = await supabase
    .from("guardian_items")
    .select(
      "id, type, title, description, event_date, start_at, end_at, due_at, confidence, needs_review, child_id, status, source_excerpt, metadata, requires_action, priority"
    )
    .eq("source_document_id", documentId)
    .in("status", ["active"])
    .order("event_date", { ascending: true, nullsFirst: false });

  const items = (rows ?? []).map((row) => ({
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    event_date: (row.event_date as string | null) ?? null,
    start_at: (row.start_at as string | null) ?? null,
    end_at: (row.end_at as string | null) ?? null,
    confidence: (row.confidence as number | null) ?? null,
    needs_review: Boolean(row.needs_review),
    child_id: (row.child_id as string | null) ?? null,
    status: row.status as string,
  }));

  const extracted: GuardianExtractedItem[] = (rows ?? []).map((row) => ({
    type: row.type as GuardianItemType,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    event_date: (row.event_date as string | null) ?? null,
    due_at: null,
    start_at: (row.start_at as string | null) ?? null,
    end_at: (row.end_at as string | null) ?? null,
    requires_action: Boolean(row.requires_action),
    priority: (row.priority as "low" | "normal" | "high" | "urgent") ?? "normal",
    child_reference: null,
    confidence: Number(row.confidence ?? 0.9),
    source_excerpt: String(row.source_excerpt ?? row.title).slice(0, 500),
    metadata: (row.metadata as Record<string, unknown>) ?? null,
  }));

  let childName: string | null = null;
  const childId = items.find((i) => i.child_id)?.child_id ?? null;
  if (childId) {
    const { data: child } = await supabase
      .from("guardian_profiles")
      .select("display_name")
      .eq("id", childId)
      .maybeSingle();
    childName = child?.display_name ?? null;
  }

  const spellingWords =
    (
      (rows ?? []).find((r) => r.type === "spelling_list")?.metadata as
        | { spelling_words?: string[] }
        | null
        | undefined
    )?.spelling_words ?? [];

  const summary = buildNewsletterReviewSummary({
    items: extracted,
    meta: {
      publicationDate: null,
      homeworkWeekStart: null,
      teacherName: null,
      schoolName: null,
      spellingWords,
    },
    childName,
    childId,
  });

  return {
    documentId: doc.id,
    documentTitle: doc.file_name,
    extractionStatus: doc.newsletter_extraction_status,
    classificationConfidence: doc.newsletter_classification_confidence,
    summary,
    countLines: formatReviewCountLines(summary.counts),
    items,
  };
}

export async function confirmGuardianItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<ItemActionResult> {
  const now = appNow().toISOString();
  const { data, error } = await supabase
    .from("guardian_items")
    .update({
      needs_review: false,
      updated_at: now,
    })
    .eq("id", itemId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.message.includes("row-level security")) {
      return {
        ok: false,
        error: "You don't have permission to update this item.",
        status: 403,
      };
    }
    return { ok: false, error: "Couldn't confirm that item.", status: 502 };
  }
  if (!data) {
    return { ok: false, error: "Item not found or already updated.", status: 404 };
  }
  return { ok: true };
}

export async function assignGuardianItemChild(
  supabase: SupabaseClient,
  itemId: string,
  childId: string
): Promise<ItemActionResult> {
  const { data: child } = await supabase
    .from("guardian_profiles")
    .select("id, profile_type")
    .eq("id", childId)
    .maybeSingle();

  if (
    !child ||
    (child.profile_type !== "child" && child.profile_type !== "student")
  ) {
    return {
      ok: false,
      error: "Choose a child or student Space.",
      status: 400,
    };
  }

  const now = appNow().toISOString();
  const { data, error } = await supabase
    .from("guardian_items")
    .update({
      child_id: childId,
      needs_review: false,
      updated_at: now,
    })
    .eq("id", itemId)
    .eq("status", "active")
    .select("id, source_document_id")
    .maybeSingle();

  if (error) {
    if (error.message.includes("row-level security")) {
      return {
        ok: false,
        error: "You don't have permission to update this item.",
        status: 403,
      };
    }
    return { ok: false, error: "Couldn't assign that child.", status: 502 };
  }
  if (!data) {
    return { ok: false, error: "Item not found or already updated.", status: 404 };
  }

  // Propagate child to sibling newsletter items from the same document
  if (data.source_document_id) {
    await supabase
      .from("guardian_items")
      .update({
        child_id: childId,
        needs_review: false,
        updated_at: now,
      })
      .eq("source_document_id", data.source_document_id)
      .eq("status", "active")
      .is("child_id", null);

    await supabase
      .from("documents")
      .update({ newsletter_extraction_status: "completed" })
      .eq("id", data.source_document_id);
  }

  return { ok: true };
}

export async function updateGuardianItemFields(
  supabase: SupabaseClient,
  itemId: string,
  patch: {
    title?: string;
    description?: string | null;
    event_date?: string | null;
    start_at?: string | null;
    end_at?: string | null;
  }
): Promise<ItemActionResult> {
  const now = appNow().toISOString();
  const { data, error } = await supabase
    .from("guardian_items")
    .update({
      ...patch,
      needs_review: false,
      updated_at: now,
    })
    .eq("id", itemId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.message.includes("row-level security")) {
      return {
        ok: false,
        error: "You don't have permission to update this item.",
        status: 403,
      };
    }
    return { ok: false, error: "Couldn't update that item.", status: 502 };
  }
  if (!data) {
    return { ok: false, error: "Item not found or already updated.", status: 404 };
  }
  return { ok: true };
}
