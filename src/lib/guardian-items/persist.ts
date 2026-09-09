import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { appNow } from "@/lib/clock";
import { buildDedupeKey, titlesLikelySameAttention } from "./dedupe";
import {
  evaluateLifecycle,
  mapItemTypeToEntityType,
  toTemporalMetadata,
} from "./lifecycle";
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

  const entityType = mapItemTypeToEntityType(
    item.type,
    [item.title, item.description, item.source_excerpt].filter(Boolean).join(" ")
  );
  const temporal = toTemporalMetadata(
    evaluateLifecycle({
      entityType,
      startDate: item.event_date,
      endDate: item.event_date,
      dueDate: item.due_at,
      now: args.today
        ? new Date(`${args.today}T12:00:00.000Z`)
        : appNow(),
      title: item.title,
      description: item.description,
      sourceExcerpt: item.source_excerpt,
      confidence,
      sourceEvidence: [{ text: item.source_excerpt }],
    })
  );

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
    metadata: { temporal },
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
        metadata: row.metadata,
        updated_at: appNow().toISOString(),
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

  // User already completed/dismissed this exact key — do not resurrect it.
  const { data: resolvedExact } = await supabase
    .from("guardian_items")
    .select("id, status")
    .eq("space_id", association.spaceId)
    .eq("dedupe_key", dedupeKey)
    .in("status", ["completed", "dismissed"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (resolvedExact?.id) {
    logGuardianEvent("guardian_item_deduped", {
      item_id: resolvedExact.id,
      space_id: association.spaceId,
      type: item.type,
      document_id: args.sourceDocumentId,
      skipped_resolved: resolvedExact.status,
    });
    return { outcome: "skipped", reason: "already_resolved" };
  }

  // Near-duplicate from the same document (paraphrased titles).
  const { data: sameSource } = await supabase
    .from("guardian_items")
    .select("id, title, confidence, status")
    .eq("space_id", association.spaceId)
    .eq("source_document_id", args.sourceDocumentId)
    .in("status", ["active", "completed", "dismissed"])
    .limit(50);

  const fuzzyActive = (sameSource ?? []).find(
    (candidate) =>
      candidate.status === "active" &&
      titlesLikelySameAttention(String(candidate.title ?? ""), item.title)
  );

  if (fuzzyActive?.id) {
    const existingTitle = String(fuzzyActive.title ?? "");
    const preferIncomingTitle =
      confidence > Number(fuzzyActive.confidence ?? 0) ||
      (/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(item.title) &&
        !/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(existingTitle));

    await supabase
      .from("guardian_items")
      .update({
        ...(preferIncomingTitle ? { title: row.title } : {}),
        description: row.description,
        confidence: Math.max(confidence, Number(fuzzyActive.confidence ?? 0)),
        needs_review: needsReview,
        priority,
        source_excerpt: row.source_excerpt,
        metadata: row.metadata,
        updated_at: appNow().toISOString(),
      })
      .eq("id", fuzzyActive.id);

    logGuardianEvent("guardian_item_deduped", {
      item_id: fuzzyActive.id,
      space_id: association.spaceId,
      type: item.type,
      document_id: args.sourceDocumentId,
      fuzzy: true,
    });
    return { outcome: "deduped", id: fuzzyActive.id };
  }

  const fuzzyResolved = (sameSource ?? []).find(
    (candidate) =>
      (candidate.status === "completed" || candidate.status === "dismissed") &&
      titlesLikelySameAttention(String(candidate.title ?? ""), item.title)
  );

  if (fuzzyResolved?.id) {
    logGuardianEvent("guardian_item_deduped", {
      item_id: fuzzyResolved.id,
      space_id: association.spaceId,
      type: item.type,
      document_id: args.sourceDocumentId,
      skipped_resolved: fuzzyResolved.status,
      fuzzy: true,
    });
    return { outcome: "skipped", reason: "already_resolved" };
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
  const title = args.title.slice(0, 300);
  const description = args.description?.trim()
    ? args.description.trim().slice(0, 500)
    : null;

  // Reschedule path: same topic, new time → update existing Attention item.
  const { data: candidates } = await supabase
    .from("guardian_items")
    .select("*")
    .eq("space_id", args.spaceId)
    .eq("status", "active")
    .in("type", ["reminder", "deadline", "follow_up", "event"])
    .order("updated_at", { ascending: false })
    .limit(40);

  const match = (candidates ?? []).find((row) =>
    titlesLikelySameAttention(String(row.title ?? ""), title)
  );

  if (match?.id) {
    const { data: updated, error: updateError } = await supabase
      .from("guardian_items")
      .update({
        title,
        description: description ?? match.description,
        type,
        event_date: args.eventDate,
        due_at: args.dueAt,
        requires_action: true,
        updated_at: appNow().toISOString(),
      })
      .eq("id", match.id)
      .select("*")
      .single();

    if (!updateError && updated) {
      logGuardianEvent("guardian_item_deduped", {
        item_id: updated.id,
        space_id: args.spaceId,
        type,
        source_type: "user",
        rescheduled: true,
      });
      return updated as GuardianItemRow;
    }
  }

  const dedupeKey = buildDedupeKey({
    type,
    title,
    effectiveDate: args.eventDate,
    childId: null,
    sourceDocumentId: null,
  });

  const row = {
    user_id: args.userId,
    space_id: args.spaceId,
    child_id: null,
    school_context_id: null,
    type,
    title,
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
    // Stable key so identical manual reminders still collapse.
    dedupe_key: `${dedupeKey}|manual`.slice(0, 500),
  };

  const { data, error } = await supabase
    .from("guardian_items")
    .insert(row)
    .select("*")
    .single();

  if (error || !data) {
    // Unique race — fetch and update times instead of failing.
    if (error?.code === "23505") {
      const { data: raced } = await supabase
        .from("guardian_items")
        .select("*")
        .eq("space_id", args.spaceId)
        .eq("dedupe_key", row.dedupe_key)
        .eq("status", "active")
        .maybeSingle();
      if (raced?.id) {
        const { data: updated } = await supabase
          .from("guardian_items")
          .update({
            title,
            description,
            event_date: args.eventDate,
            due_at: args.dueAt,
            updated_at: appNow().toISOString(),
          })
          .eq("id", raced.id)
          .select("*")
          .single();
        if (updated) return updated as GuardianItemRow;
      }
    }
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
