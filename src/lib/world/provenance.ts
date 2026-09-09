/**
 * Provenance helpers for My World.
 * Every fact and relationship must reference evidence.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SemanticEvidence, SemanticObjectType } from "@/lib/semantic/types";
import { requireEvidenceExcerpt } from "./provenanceCore";

export { requireEvidenceExcerpt, WORLD_SOURCE_TYPES } from "./provenanceCore";

/**
 * Upsert evidence and link it to a semantic object. Idempotent on unique keys.
 */
export async function attachEvidence(
  supabase: SupabaseClient,
  args: {
    userId: string;
    sourceType: string;
    sourceId: string;
    spaceId?: string | null;
    sourceTitle?: string | null;
    excerpt: string;
    objectType: SemanticObjectType;
    objectId: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ evidenceId: string; linked: boolean }> {
  const excerpt = requireEvidenceExcerpt(args.excerpt, args.excerpt);

  const { data: existing } = await supabase
    .from("semantic_evidence")
    .select("id")
    .eq("user_id", args.userId)
    .eq("source_type", args.sourceType)
    .eq("source_id", args.sourceId)
    .eq("source_excerpt", excerpt)
    .maybeSingle();

  let evidenceId = existing?.id as string | undefined;

  if (!evidenceId) {
    const { data, error } = await supabase
      .from("semantic_evidence")
      .insert({
        user_id: args.userId,
        source_type: args.sourceType,
        source_id: args.sourceId,
        space_id: args.spaceId ?? null,
        source_title: args.sourceTitle ?? null,
        source_excerpt: excerpt,
        source_metadata: args.metadata ?? {},
      })
      .select("id")
      .single();

    if (error || !data) {
      const { data: again } = await supabase
        .from("semantic_evidence")
        .select("id")
        .eq("user_id", args.userId)
        .eq("source_type", args.sourceType)
        .eq("source_id", args.sourceId)
        .limit(1)
        .maybeSingle();
      if (!again?.id) {
        throw new Error(error?.message ?? "Failed to attach world evidence");
      }
      evidenceId = again.id as string;
    } else {
      evidenceId = data.id as string;
    }
  }

  const { error: linkError } = await supabase
    .from("semantic_evidence_links")
    .insert({
      user_id: args.userId,
      evidence_id: evidenceId,
      semantic_object_type: args.objectType,
      semantic_object_id: args.objectId,
    });

  if (linkError) {
    if (linkError.code === "23505") {
      return { evidenceId, linked: false };
    }
    throw new Error(linkError.message);
  }

  return { evidenceId, linked: true };
}

export async function getEvidenceForObject(
  supabase: SupabaseClient,
  args: {
    userId: string;
    objectType: SemanticObjectType;
    objectId: string;
    limit?: number;
  }
): Promise<SemanticEvidence[]> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
  const { data: links } = await supabase
    .from("semantic_evidence_links")
    .select("evidence_id")
    .eq("user_id", args.userId)
    .eq("semantic_object_type", args.objectType)
    .eq("semantic_object_id", args.objectId)
    .limit(limit);

  const ids = (links ?? []).map((l) => l.evidence_id as string);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("semantic_evidence")
    .select(
      "id, user_id, source_type, source_id, space_id, source_title, source_excerpt, source_metadata, created_at"
    )
    .eq("user_id", args.userId)
    .in("id", ids)
    .limit(limit);

  return (data ?? []) as SemanticEvidence[];
}
