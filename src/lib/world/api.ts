/**
 * My World read APIs — permission-safe over semantic_* + inbox/timeline/items.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listGuardianProfiles } from "@/lib/profiles/server";
import { getSemanticEntityDetail } from "@/lib/semantic/query";
import type {
  SemanticEntity,
  SemanticEvidence,
  SemanticFact,
  SemanticRelationship,
} from "@/lib/semantic/types";
import { listWorldEntitiesVisible } from "./auth";
import { listPendingInboxItems } from "./inbox";
import {
  worldEntityGroup,
  worldEntityTypeLabel,
  worldRelationshipLabel,
} from "./labels";
import type { WorldEntity, WorldInboxItem } from "./types";
import type {
  WorldAttentionItem,
  WorldCounts,
  WorldEntityDetail,
  WorldEntitySummary,
  WorldOverview,
} from "./apiTypes";

export type {
  WorldAttentionItem,
  WorldCounts,
  WorldEntityDetail,
  WorldEntitySummary,
  WorldOverview,
} from "./apiTypes";

async function authorizedSpaceIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const profiles = await listGuardianProfiles(supabase, userId);
  return profiles.map((p) => p.id);
}

function toSummary(entity: WorldEntity | SemanticEntity): WorldEntitySummary {
  const importance =
    typeof entity.importance_score === "number"
      ? entity.importance_score
      : null;
  return {
    id: entity.id,
    name: entity.canonical_name,
    type: entity.entity_type,
    typeLabel: worldEntityTypeLabel(entity.entity_type),
    group: worldEntityGroup(entity.entity_type),
    description: entity.description,
    importance,
    lastSeenAt: entity.last_seen_at,
  };
}

function filterEvidenceBySpaces(
  evidence: SemanticEvidence[],
  authorized: Set<string>
): SemanticEvidence[] {
  return evidence.filter(
    (e) =>
      e.space_id == null ||
      e.space_id === "" ||
      authorized.has(e.space_id)
  );
}

export async function getAuthorizedWorldSpaceIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  return authorizedSpaceIds(supabase, userId);
}

export async function getImportantEntities(
  supabase: SupabaseClient,
  userId: string,
  options: { limit?: number; group?: string } = {}
): Promise<WorldEntitySummary[]> {
  const spaceIds = await authorizedSpaceIds(supabase, userId);
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);
  const entities = await listWorldEntitiesVisible(supabase, {
    userId,
    authorizedSpaceIds: spaceIds,
    limit: 80,
  });

  let filtered = entities;
  if (options.group) {
    filtered = entities.filter((e) => worldEntityGroup(e.entity_type) === options.group);
  }

  return filtered
    .map(toSummary)
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, limit);
}

export async function searchWorld(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  options: { limit?: number } = {}
): Promise<WorldEntitySummary[]> {
  const q = query.trim();
  if (!q) return [];
  const spaceIds = await authorizedSpaceIds(supabase, userId);
  const entities = await listWorldEntitiesVisible(supabase, {
    userId,
    authorizedSpaceIds: spaceIds,
    search: q,
    limit: options.limit ?? 30,
  });
  return entities.map(toSummary);
}

export async function getWorldTimeline(
  supabase: SupabaseClient,
  userId: string,
  options: { limit?: number; entityId?: string } = {}
): Promise<WorldOverview["recentChanges"]> {
  const spaceIds = await authorizedSpaceIds(supabase, userId);
  const authorized = new Set(spaceIds);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

  let query = supabase
    .from("world_timeline_entries")
    .select(
      "id, title, summary, occurred_at, entry_type, primary_entity_id, space_id, importance_score"
    )
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit * 2);

  if (options.entityId) {
    query = query.eq("primary_entity_id", options.entityId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as Array<{
    id: string;
    title: string;
    summary: string | null;
    occurred_at: string;
    entry_type: string;
    primary_entity_id: string | null;
    space_id: string | null;
  }>)
    .filter(
      (row) =>
        row.space_id == null || authorized.has(row.space_id)
    )
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      occurredAt: row.occurred_at,
      entryType: row.entry_type,
      entityId: row.primary_entity_id,
    }));
}

export async function getWorldAttention(
  supabase: SupabaseClient,
  userId: string,
  options: { limit?: number; entityId?: string } = {}
): Promise<WorldAttentionItem[]> {
  const spaceIds = await authorizedSpaceIds(supabase, userId);
  if (spaceIds.length === 0) return [];
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);

  const { data, error } = await supabase
    .from("guardian_items")
    .select(
      "id, title, description, due_at, event_date, priority, space_id, action_label, metadata, requires_action"
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("requires_action", true)
    .in("space_id", spaceIds)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(limit * 2);

  if (error || !data) return [];

  const items: WorldAttentionItem[] = [];
  for (const row of data) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const entityIds = Array.isArray(meta.semantic_entity_ids)
      ? (meta.semantic_entity_ids as unknown[]).filter(
          (id): id is string => typeof id === "string"
        )
      : [];
    if (options.entityId && !entityIds.includes(options.entityId)) {
      continue;
    }
    items.push({
      id: String(row.id),
      title: String(row.title ?? "Needs attention"),
      description: row.description == null ? null : String(row.description),
      dueAt: row.due_at == null ? null : String(row.due_at),
      eventDate: row.event_date == null ? null : String(row.event_date),
      priority: String(row.priority ?? "normal"),
      spaceId: String(row.space_id),
      entityIds,
      actionLabel: row.action_label == null ? null : String(row.action_label),
    });
    if (items.length >= limit) break;
  }
  return items;
}

export async function getWorldInbox(
  supabase: SupabaseClient,
  userId: string,
  options: { limit?: number } = {}
): Promise<WorldInboxItem[]> {
  return listPendingInboxItems(supabase, userId, options.limit ?? 50);
}

export async function getWorldOverview(
  supabase: SupabaseClient,
  userId: string
): Promise<WorldOverview> {
  const spaceIds = await authorizedSpaceIds(supabase, userId);
  const entities = await listWorldEntitiesVisible(supabase, {
    userId,
    authorizedSpaceIds: spaceIds,
    limit: 200,
  });

  const summaries = entities.map(toSummary);
  const counts: WorldCounts = {
    people: summaries.filter((e) => e.group === "people").length,
    organizations: summaries.filter((e) => e.group === "organizations").length,
    events: summaries.filter((e) => e.group === "events").length,
    things: summaries.filter((e) => e.group === "things").length,
    needingAttention: 0,
    inboxPending: 0,
  };

  const [attention, timeline, inbox] = await Promise.all([
    getWorldAttention(supabase, userId, { limit: 8 }),
    getWorldTimeline(supabase, userId, { limit: 8 }),
    getWorldInbox(supabase, userId, { limit: 20 }),
  ]);

  counts.needingAttention = attention.length;
  counts.inboxPending = inbox.length;

  const important = [...summaries]
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 8);

  const upcomingEvents = summaries
    .filter((e) => e.group === "events")
    .slice(0, 6);

  return {
    counts,
    important,
    recentChanges: timeline,
    upcomingEvents,
    needingAttention: attention,
    inboxPendingCount: inbox.length,
  };
}

export async function getWorldRelationships(
  supabase: SupabaseClient,
  userId: string,
  entityId: string
): Promise<WorldEntityDetail["relationships"]> {
  const detail = await getWorldEntity(supabase, userId, entityId);
  return detail?.relationships ?? [];
}

export async function getWorldEntity(
  supabase: SupabaseClient,
  userId: string,
  entityId: string
): Promise<WorldEntityDetail | null> {
  const spaceIds = await authorizedSpaceIds(supabase, userId);
  const authorized = new Set(spaceIds);

  const detail = await getSemanticEntityDetail(supabase, userId, entityId);
  if (!detail) return null;

  const visibleEvidence = filterEvidenceBySpaces(detail.evidence, authorized);
  // Hide when no evidence the caller may see (cross-Space safety)
  if (visibleEvidence.length === 0) {
    return null;
  }
  // Also hide merged/rejected
  const status = detail.entity.status ?? "active";
  if (status === "merged" || status === "rejected") return null;

  const relatedIds = new Set<string>();
  for (const rel of detail.relationships) {
    relatedIds.add(rel.source_entity_id);
    relatedIds.add(rel.target_entity_id);
  }
  relatedIds.delete(entityId);

  const relatedMap = new Map<string, WorldEntitySummary>();
  if (relatedIds.size > 0) {
    const relatedVisible = await listWorldEntitiesVisible(supabase, {
      userId,
      authorizedSpaceIds: spaceIds,
      limit: 100,
    });
    for (const e of relatedVisible) {
      if (relatedIds.has(e.id)) relatedMap.set(e.id, toSummary(e));
    }
  }

  const relationships: WorldEntityDetail["relationships"] = [];
  for (const rel of detail.relationships as SemanticRelationship[]) {
    const otherId =
      rel.source_entity_id === entityId
        ? rel.target_entity_id
        : rel.source_entity_id;
    const other = relatedMap.get(otherId);
    if (!other) continue;
    relationships.push({
      id: rel.id,
      type: rel.relationship_type,
      typeLabel: worldRelationshipLabel(rel.relationship_type),
      direction: rel.source_entity_id === entityId ? "from" : "to",
      other,
    });
  }

  const relatedPeople = relationships
    .filter((r) => r.other.group === "people")
    .map((r) => r.other);
  const relatedOrganizations = relationships
    .filter((r) => r.other.group === "organizations")
    .map((r) => r.other);

  const uniqueById = (list: WorldEntitySummary[]) => {
    const seen = new Set<string>();
    return list.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  };

  let relationshipToUser: string | null = null;
  for (const rel of relationships) {
    if (
      /works_at|client_of|partner_of|reports|manages|contact_for/i.test(rel.type)
    ) {
      relationshipToUser =
        rel.direction === "from"
          ? `${rel.typeLabel} ${rel.other.name}`
          : `${rel.other.name} — ${rel.typeLabel}`;
      break;
    }
  }

  const [timeline, attention] = await Promise.all([
    getWorldTimeline(supabase, userId, { entityId, limit: 15 }),
    getWorldAttention(supabase, userId, { entityId, limit: 10 }),
  ]);

  const primarySpaceId =
    visibleEvidence.find((e) => e.space_id)?.space_id ??
    detail.evidence.find((e) => e.space_id)?.space_id ??
    null;

  return {
    entity: toSummary(detail.entity),
    description: detail.entity.description,
    aliases: detail.aliases,
    attributes: detail.attributes,
    relationshipToUser,
    relatedPeople: uniqueById(relatedPeople),
    relatedOrganizations: uniqueById(relatedOrganizations),
    relationships,
    facts: (detail.facts as SemanticFact[]).map((f) => ({
      id: f.id,
      predicate: f.predicate,
      valueText: f.value_text,
      valueNumber: f.value_number,
      valueDate: f.value_date,
      confidence: f.confidence,
    })),
    evidence: visibleEvidence.map((e) => ({
      id: e.id,
      sourceType: e.source_type,
      sourceTitle: e.source_title,
      sourceExcerpt: e.source_excerpt,
      spaceId: e.space_id,
      createdAt: e.created_at,
    })),
    timeline,
    attention,
    primarySpaceId,
  };
}
