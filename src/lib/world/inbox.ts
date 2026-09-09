/**
 * World Inbox — medium-confidence confirmations; user corrections become HIGH knowledge.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntityName } from "@/lib/semantic/normalize";
import type {
  WorldInboxItem,
  WorldInboxItemType,
  WorldInboxStatus,
} from "./types";

export async function createWorldInboxItem(
  supabase: SupabaseClient,
  args: {
    userId: string;
    spaceId?: string | null;
    type: WorldInboxItemType;
    confidence?: number | null;
    semanticEntityId?: string | null;
    relatedEntityIds?: string[];
    candidate: Record<string, unknown>;
    reason?: string;
    dedupeKey: string;
  }
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await supabase
    .from("world_inbox_items")
    .select("id")
    .eq("user_id", args.userId)
    .eq("dedupe_key", args.dedupeKey)
    .eq("status", "pending")
    .maybeSingle();

  if (existing?.id) {
    return { id: existing.id as string, created: false };
  }

  const { data, error } = await supabase
    .from("world_inbox_items")
    .insert({
      user_id: args.userId,
      space_id: args.spaceId ?? null,
      type: args.type,
      status: "pending",
      confidence: args.confidence ?? null,
      semantic_entity_id: args.semanticEntityId ?? null,
      related_entity_ids: args.relatedEntityIds ?? [],
      candidate: args.candidate,
      reason: args.reason ?? null,
      dedupe_key: args.dedupeKey,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: again } = await supabase
        .from("world_inbox_items")
        .select("id")
        .eq("user_id", args.userId)
        .eq("dedupe_key", args.dedupeKey)
        .eq("status", "pending")
        .maybeSingle();
      if (again?.id) return { id: again.id as string, created: false };
    }
    throw new Error(error.message);
  }

  return { id: data!.id as string, created: true };
}

export async function listPendingInboxItems(
  supabase: SupabaseClient,
  userId: string,
  limit = 50
): Promise<WorldInboxItem[]> {
  const { data, error } = await supabase
    .from("world_inbox_items")
    .select(
      "id, user_id, space_id, type, status, confidence, semantic_entity_id, related_entity_ids, candidate, reason, dedupe_key, created_at, updated_at, resolved_at"
    )
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) throw new Error(error.message);
  return (data ?? []) as WorldInboxItem[];
}

/**
 * Apply a user inbox decision. Confirm/merge writes high-confidence aliases.
 */
export async function applyInboxCorrection(
  supabase: SupabaseClient,
  args: {
    userId: string;
    inboxItemId: string;
    action: "confirm" | "edit" | "merge" | "reject" | "ignore";
    /** For merge: surviving entity id. */
    mergeIntoEntityId?: string;
    /** For edit/confirm: updated display name / aliases. */
    editedName?: string;
    editedAliases?: string[];
  }
): Promise<{ status: WorldInboxStatus }> {
  const { data: item, error } = await supabase
    .from("world_inbox_items")
    .select(
      "id, user_id, type, status, semantic_entity_id, related_entity_ids, candidate"
    )
    .eq("id", args.inboxItemId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error || !item) throw new Error(error?.message ?? "Inbox item not found");
  if (item.status !== "pending") {
    return { status: item.status as WorldInboxStatus };
  }

  const now = new Date().toISOString();
  let status: WorldInboxStatus = "ignored";

  if (args.action === "ignore") {
    status = "ignored";
  } else if (args.action === "reject") {
    status = "rejected";
    if (item.semantic_entity_id) {
      await supabase
        .from("semantic_entities")
        .update({ status: "rejected" })
        .eq("id", item.semantic_entity_id)
        .eq("user_id", args.userId);
    }
  } else if (args.action === "confirm" || args.action === "edit") {
    status = args.action === "edit" ? "edited" : "confirmed";
    const entityId = item.semantic_entity_id as string | null;
    if (entityId) {
      const patch: Record<string, unknown> = {
        status: "active",
        confidence: 1,
      };
      if (args.editedName?.trim()) {
        patch.canonical_name = args.editedName.trim();
        patch.normalized_name = normalizeEntityName(args.editedName);
      }
      if (args.editedAliases?.length) {
        const { data: row } = await supabase
          .from("semantic_entities")
          .select("aliases")
          .eq("id", entityId)
          .maybeSingle();
        const existing = Array.isArray(row?.aliases)
          ? (row!.aliases as string[])
          : [];
        const merged = [
          ...new Set([...existing, ...args.editedAliases.map((a) => a.trim())]),
        ].filter(Boolean);
        patch.aliases = merged;
      }
      await supabase
        .from("semantic_entities")
        .update(patch)
        .eq("id", entityId)
        .eq("user_id", args.userId);
    }
  } else if (args.action === "merge") {
    status = "merged";
    const survivor = args.mergeIntoEntityId;
    const candidateId = item.semantic_entity_id as string | null;
    if (!survivor || !candidateId) {
      throw new Error("merge requires mergeIntoEntityId and candidate entity");
    }

    const { data: candidate } = await supabase
      .from("semantic_entities")
      .select("canonical_name, aliases")
      .eq("id", candidateId)
      .eq("user_id", args.userId)
      .maybeSingle();

    const { data: survivorRow } = await supabase
      .from("semantic_entities")
      .select("aliases")
      .eq("id", survivor)
      .eq("user_id", args.userId)
      .maybeSingle();

    const aliases = [
      ...new Set([
        ...(Array.isArray(survivorRow?.aliases)
          ? (survivorRow!.aliases as string[])
          : []),
        ...(Array.isArray(candidate?.aliases)
          ? (candidate!.aliases as string[])
          : []),
        candidate?.canonical_name,
      ]),
    ].filter((a): a is string => Boolean(a?.trim()));

    await supabase
      .from("semantic_entities")
      .update({
        aliases,
        confidence: 1,
        status: "active",
        last_seen_at: now,
      })
      .eq("id", survivor)
      .eq("user_id", args.userId);

    await supabase
      .from("semantic_entities")
      .update({
        status: "merged",
        merged_into_id: survivor,
      })
      .eq("id", candidateId)
      .eq("user_id", args.userId);
  }

  await supabase
    .from("world_inbox_items")
    .update({ status, resolved_at: now })
    .eq("id", args.inboxItemId)
    .eq("user_id", args.userId);

  return { status };
}
