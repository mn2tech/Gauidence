/**
 * Watch Engine — evaluate My World objects and create attention guardian_items.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSemanticEvent } from "@/lib/semantic/log";
import {
  SEMANTIC_ENTITY_SELECT,
  SEMANTIC_FACT_SELECT,
} from "@/lib/semantic/types";
import {
  evaluateWorldWatchCandidates,
  type WorldWatchCandidate,
  type WorldWatchEntity,
  type WorldWatchFact,
  type WorldWatchInbox,
  type WorldWatchTimeline,
} from "./watchEvaluate";

export {
  evaluateWorldWatchCandidates,
  candidatesFromOpenCommitments,
  candidatesFromTimeline,
  candidatesFromInbox,
  candidatesFromImportantEntities,
} from "./watchEvaluate";
export type { WorldWatchCandidate } from "./watchEvaluate";

async function hasActiveDedupe(
  supabase: SupabaseClient,
  userId: string,
  dedupeKey: string
): Promise<boolean> {
  const { data } = await supabase
    .from("guardian_items")
    .select("id")
    .eq("user_id", userId)
    .eq("dedupe_key", dedupeKey)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function persistWorldWatchCandidate(
  supabase: SupabaseClient,
  userId: string,
  preferredSpaceId: string | undefined,
  candidate: WorldWatchCandidate
): Promise<boolean> {
  if (await hasActiveDedupe(supabase, userId, candidate.dedupeKey)) {
    return false;
  }

  let spaceId =
    candidate.preferredSpaceId ?? preferredSpaceId ?? null;
  if (!spaceId) {
    // Fall back to first authorized profile for the user
    const { data: profile } = await supabase
      .from("guardian_profiles")
      .select("id")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    spaceId = profile?.id ?? null;
  }
  if (!spaceId) return false;

  if (preferredSpaceId && spaceId !== preferredSpaceId) {
    // Prefer attaching to the job's Space when candidate has no space
    if (!candidate.preferredSpaceId) {
      spaceId = preferredSpaceId;
    } else {
      return false;
    }
  }

  const metadata = {
    semantic_entity_ids: candidate.semanticEntityIds ?? [],
    semantic_fact_ids: candidate.semanticFactIds ?? [],
    world_watch: true,
  };

  const { error } = await supabase.from("guardian_items").insert({
    user_id: userId,
    space_id: spaceId,
    type: candidate.type,
    title: candidate.title.slice(0, 300),
    description: candidate.description,
    status: "active",
    priority: candidate.priority,
    requires_action: candidate.requiresAction,
    due_at: candidate.dueAt ?? null,
    event_date: candidate.eventDate ?? null,
    source_type: "manual",
    source_excerpt: candidate.sourceExcerpt?.slice(0, 800) ?? null,
    confidence: candidate.confidence,
    needs_review: candidate.confidence < 0.9,
    extraction_version: "world-watch-v1",
    dedupe_key: candidate.dedupeKey,
    metadata,
  });

  if (error) {
    if (error.code === "23505") return false;
    console.error("Failed to persist world watch candidate:", error.message);
    return false;
  }
  return true;
}

async function loadWorldWatchContext(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  entities: WorldWatchEntity[];
  facts: WorldWatchFact[];
  timeline: WorldWatchTimeline[];
  inbox: WorldWatchInbox[];
}> {
  const [entitiesRes, factsRes, timelineRes, inboxRes] = await Promise.all([
    supabase
      .from("semantic_entities")
      .select(SEMANTIC_ENTITY_SELECT)
      .eq("user_id", userId)
      .or("status.is.null,status.eq.active")
      .order("importance_score", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("semantic_facts")
      .select(SEMANTIC_FACT_SELECT)
      .eq("user_id", userId)
      .eq("predicate", "open_commitment")
      .limit(100),
    supabase
      .from("world_timeline_entries")
      .select(
        "id, title, summary, entry_type, primary_entity_id, space_id, occurred_at, importance_score"
      )
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(80),
    supabase
      .from("world_inbox_items")
      .select("id, type, title, space_id, payload")
      .eq("user_id", userId)
      .eq("status", "pending")
      .limit(40),
  ]);

  const entities: WorldWatchEntity[] = (entitiesRes.data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.canonical_name ?? ""),
    entity_type: String(row.entity_type ?? "thing"),
    importance_score:
      typeof row.importance_score === "number" ? row.importance_score : null,
    status: typeof row.status === "string" ? row.status : null,
    last_seen_at:
      typeof row.last_seen_at === "string" ? row.last_seen_at : null,
  }));

  const facts: WorldWatchFact[] = (factsRes.data ?? []).map((row) => ({
    id: String(row.id),
    subject_entity_id:
      typeof row.subject_entity_id === "string" ? row.subject_entity_id : null,
    predicate: String(row.predicate ?? ""),
    value_text: typeof row.value_text === "string" ? row.value_text : null,
    value_date: typeof row.value_date === "string" ? row.value_date : null,
    confidence: typeof row.confidence === "number" ? row.confidence : null,
  }));

  const timeline: WorldWatchTimeline[] = (timelineRes.data ?? []).map(
    (row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      summary: typeof row.summary === "string" ? row.summary : null,
      entry_type: String(row.entry_type ?? "other_important"),
      primary_entity_id:
        typeof row.primary_entity_id === "string"
          ? row.primary_entity_id
          : null,
      space_id: typeof row.space_id === "string" ? row.space_id : null,
      occurred_at: String(row.occurred_at ?? new Date(0).toISOString()),
      importance_score:
        typeof row.importance_score === "number" ? row.importance_score : null,
    })
  );

  const inbox: WorldWatchInbox[] = (inboxRes.data ?? []).map((row) => ({
    id: String(row.id),
    type: String(row.type ?? ""),
    title: typeof row.title === "string" ? row.title : null,
    space_id: typeof row.space_id === "string" ? row.space_id : null,
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : null,
  }));

  return { entities, facts, timeline, inbox };
}

/**
 * Evaluate World Watch rules and create guardian_items (attention).
 * Deduped globally per user via dedupe_key.
 */
export async function evaluateWorldWatchRules(
  supabase: SupabaseClient,
  userId: string,
  options: { spaceId?: string; now?: Date } = {}
): Promise<{ created: number; evaluated: number }> {
  const loaded = await loadWorldWatchContext(supabase, userId);
  const candidates = evaluateWorldWatchCandidates({
    now: options.now ?? new Date(),
    ...loaded,
  });

  let created = 0;
  for (const candidate of candidates) {
    const ok = await persistWorldWatchCandidate(
      supabase,
      userId,
      options.spaceId,
      candidate
    );
    if (ok) {
      created += 1;
      logSemanticEvent("world_watch_rule_fired", {
        user_id: userId,
        space_id: options.spaceId ?? null,
        dedupe_key: candidate.dedupeKey,
        type: candidate.type,
      });
    }
  }

  return { created, evaluated: candidates.length };
}
