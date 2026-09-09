/**
 * World timeline persistence — high-signal moments (idempotent via dedupe_key).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scoreTimelineImportance,
  shouldEmitTimelineEntry,
} from "./importance";
import {
  inferTimelineEntriesFromExtraction,
  type TimelineCandidate,
} from "./timelineInfer";
import type { WorldTimelineEntry } from "./types";

export {
  inferTimelineEntriesFromExtraction,
  filterTimelineCandidatesForEmit,
} from "./timelineInfer";
export type { TimelineCandidate } from "./timelineInfer";

export async function emitWorldTimelineEntry(
  supabase: SupabaseClient,
  args: {
    userId: string;
    spaceId?: string | null;
    candidate: TimelineCandidate;
    sourceType: string;
    sourceId: string;
    evidenceId?: string | null;
  }
): Promise<{ id: string; created: boolean } | null> {
  const importance = scoreTimelineImportance(
    args.candidate.entryType,
    args.candidate.confidence
  );
  if (!shouldEmitTimelineEntry(importance, args.candidate.entryType)) {
    return null;
  }

  const { data: existing } = await supabase
    .from("world_timeline_entries")
    .select("id")
    .eq("user_id", args.userId)
    .eq("dedupe_key", args.candidate.dedupeKey)
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id as string, created: false };
  }

  const { data, error } = await supabase
    .from("world_timeline_entries")
    .insert({
      user_id: args.userId,
      space_id: args.spaceId ?? null,
      entry_type: args.candidate.entryType,
      title: args.candidate.title,
      summary: args.candidate.summary ?? null,
      occurred_at: args.candidate.occurredAt ?? new Date().toISOString(),
      importance_score: importance,
      confidence: args.candidate.confidence ?? null,
      primary_entity_id: args.candidate.primaryEntityId ?? null,
      related_entity_ids: args.candidate.relatedEntityIds ?? [],
      source_type: args.sourceType,
      source_id: args.sourceId,
      evidence_id: args.evidenceId ?? null,
      dedupe_key: args.candidate.dedupeKey,
      metadata: args.candidate.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: again } = await supabase
        .from("world_timeline_entries")
        .select("id")
        .eq("user_id", args.userId)
        .eq("dedupe_key", args.candidate.dedupeKey)
        .maybeSingle();
      if (again?.id) return { id: again.id as string, created: false };
    }
    throw new Error(error.message);
  }

  return { id: data!.id as string, created: true };
}

export type { WorldTimelineEntry };
