import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDedupeKey } from "./dedupe";
import { logGuardianEvent } from "./log";
import { resolveItemPriority } from "./priority";
import {
  CONFIDENCE_AUTO,
  CONFIDENCE_REVIEW,
  GUARDIAN_ITEM_EXTRACTION_VERSION,
  type GuardianItemPriority,
  type GuardianItemRow,
  type GuardianItemType,
} from "./types";
import type { GuardianExtractedItem } from "./schema";
import type { AssociationResult } from "./associate";

export type PersistExtractedItemArgs = {
  supabase: SupabaseClient;
  association: AssociationResult;
  item: GuardianExtractedItem;
  sourceDocumentId: string;
  sourceDocumentTitle?: string | null;
  today: string;
};

export type PersistResult =
  | { outcome: "created"; id: string }
  | { outcome: "deduped"; id: string }
  | { outcome: "low_confidence" }
  | { outcome: "skipped"; reason: string };

function effectiveDateFromExtracted(item: GuardianExtractedItem): string | null {
  if (item.event_date) return item.event_date;
  if (item.due_at) return item.due_at;
  return null;
}

export async function persistExtractedGuardianItem(
  args: PersistExtractedItemArgs
): Promise<PersistResult> {
  const { item, association, supabase } = args;
  const confidence = item.confidence;

  if (confidence < CONFIDENCE_REVIEW) {
    logGuardianEvent("guardian_item_low_confidence", {
      space_id: association.spaceId,
      type: item.type,
      confidence,
      document_id: args.sourceDocumentId,
    });
    return { outcome: "low_confidence" };
  }

  const effectiveDate = effectiveDateFromExtracted(item);
  const priority = resolveItemPriority({
    type: item.type as GuardianItemType,
    requiresAction: item.requires_action,
    llmPriority: item.priority as GuardianItemPriority,
    effectiveDate,
    today: args.today,
  });

  const dedupeKey = buildDedupeKey({
    type: item.type as GuardianItemType,
    title: item.title,
    effectiveDate,
    childId: association.childId,
    sourceDocumentId: args.sourceDocumentId,
  });

  const needsReview = confidence < CONFIDENCE_AUTO;

  const row = {
    user_id: association.userId,
    space_id: association.spaceId,
    child_id: association.childId,
    school_context_id: association.schoolContextId,
    type: item.type,
    title: item.title.slice(0, 300),
    description: item.description ?? null,
    event_date: item.event_date ?? null,
    due_at: item.due_at ? `${item.due_at}T12:00:00.000Z` : null,
    status: "active" as const,
    priority,
    requires_action: item.requires_action,
    source_type: "document",
    source_document_id: args.sourceDocumentId,
    source_excerpt: item.source_excerpt.slice(0, 800),
    confidence,
    needs_review: needsReview,
    extraction_version: GUARDIAN_ITEM_EXTRACTION_VERSION,
    dedupe_key: dedupeKey,
  };

  const { data: existing } = await supabase
    .from("guardian_items")
    .select("id")
    .eq("space_id", association.spaceId)
    .eq("dedupe_key", dedupeKey)
    .eq("status", "active")
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("guardian_items")
      .update({
        title: row.title,
        description: row.description,
        confidence,
        needs_review: needsReview,
        priority,
        source_excerpt: row.source_excerpt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    logGuardianEvent("guardian_item_deduped", {
      item_id: existing.id,
      space_id: association.spaceId,
      type: item.type,
      document_id: args.sourceDocumentId,
    });
    return { outcome: "deduped", id: existing.id };
  }

  const { data, error } = await supabase
    .from("guardian_items")
    .insert(row)
    .select("id")
    .single();

  if (error || !data) {
    // Race on unique index — treat as dedupe.
    if (error?.code === "23505") {
      const { data: raced } = await supabase
        .from("guardian_items")
        .select("id")
        .eq("space_id", association.spaceId)
        .eq("dedupe_key", dedupeKey)
        .eq("status", "active")
        .maybeSingle();
      if (raced?.id) {
        logGuardianEvent("guardian_item_deduped", {
          item_id: raced.id,
          space_id: association.spaceId,
          type: item.type,
          document_id: args.sourceDocumentId,
        });
        return { outcome: "deduped", id: raced.id };
      }
    }
    throw new Error(error?.message ?? "Failed to insert guardian item");
  }

  logGuardianEvent("guardian_item_created", {
    item_id: data.id,
    space_id: association.spaceId,
    type: item.type,
    needs_review: needsReview,
    document_id: args.sourceDocumentId,
  });

  return { outcome: "created", id: data.id };
}

export async function insertManualGuardianItem(
  supabase: SupabaseClient,
  args: {
    userId: string;
    spaceId: string;
    title: string;
    dueAt: string;
    eventDate: string;
    type?: GuardianItemType;
    description?: string | null;
  }
): Promise<GuardianItemRow | null> {
  const type = args.type ?? "reminder";
  const dedupeKey = buildDedupeKey({
    type,
    title: args.title,
    effectiveDate: args.eventDate,
    childId: null,
    sourceDocumentId: null,
  });

  const description = args.description?.trim()
    ? args.description.trim().slice(0, 500)
    : null;

  const row = {
    user_id: args.userId,
    space_id: args.spaceId,
    child_id: null,
    school_context_id: null,
    type,
    title: args.title.slice(0, 300),
    description,
    event_date: args.eventDate,
    due_at: args.dueAt,
    status: "active" as const,
    priority: "normal" as const,
    requires_action: true,
    source_type: "user",
    source_document_id: null,
    source_excerpt: null,
    confidence: 1,
    needs_review: false,
    extraction_version: null,
    dedupe_key: `${dedupeKey}|manual|${Date.now()}`,
  };

  const { data, error } = await supabase
    .from("guardian_items")
    .insert(row)
    .select("*")
    .single();

  if (error || !data) {
    console.error("Manual guardian item insert failed:", error?.message);
    return null;
  }

  logGuardianEvent("guardian_item_created", {
    item_id: data.id,
    space_id: args.spaceId,
    type,
    source_type: "user",
  });

  return data as GuardianItemRow;
}
