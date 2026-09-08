/**
 * Load My World cards for the signed-in user (server).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { listGuardianProfiles } from "@/lib/profiles/server";
import {
  nestedUnder,
  profileTypeLabel,
  topLevelProfiles,
  type GuardianProfile,
} from "@/lib/profiles/types";
import {
  aggregateStatsForSpaces,
  buildWorldCard,
  countsToMap,
  sortWorldCards,
} from "./cards";
import type {
  SpaceActivityRow,
  SpaceCountRow,
  SpaceItemRow,
  WorldCard,
} from "./types";

function spaceIdsForCard(
  profiles: GuardianProfile[],
  root: GuardianProfile
): string[] {
  const nested = nestedUnder(profiles, root);
  return [root.id, ...nested.map((p) => p.id)];
}

async function loadDocumentCounts(
  supabase: SupabaseClient,
  spaceIds: string[]
): Promise<SpaceCountRow[]> {
  if (spaceIds.length === 0) return [];
  const { data, error } = await supabase
    .from("documents")
    .select("profile_id")
    .in("profile_id", spaceIds);
  if (error || !data) return [];
  const map = new Map<string, number>();
  for (const row of data) {
    const id = String(row.profile_id);
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return [...map.entries()].map(([spaceId, count]) => ({ spaceId, count }));
}

async function loadLogCounts(
  supabase: SupabaseClient,
  spaceIds: string[]
): Promise<SpaceCountRow[]> {
  if (spaceIds.length === 0) return [];
  const { data, error } = await supabase
    .from("daily_logs")
    .select("profile_id")
    .in("profile_id", spaceIds);
  if (error || !data) return [];
  const map = new Map<string, number>();
  for (const row of data) {
    const id = String(row.profile_id);
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return [...map.entries()].map(([spaceId, count]) => ({ spaceId, count }));
}

async function loadItems(
  supabase: SupabaseClient,
  spaceIds: string[]
): Promise<SpaceItemRow[]> {
  if (spaceIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("guardian_items")
      .select(
        "space_id, title, status, requires_action, due_at, event_date, type, updated_at"
      )
      .in("space_id", spaceIds)
      .in("status", ["active", "completed", "dismissed"])
      .limit(2000);
    if (error || !data) return [];
    return data.map((row) => ({
      spaceId: String(row.space_id),
      title: String(row.title ?? "Item"),
      status: String(row.status ?? "active"),
      requiresAction: Boolean(row.requires_action),
      dueAt: row.due_at == null ? null : String(row.due_at),
      eventDate: row.event_date == null ? null : String(row.event_date),
      type: String(row.type ?? "informational"),
      updatedAt: String(row.updated_at ?? row.due_at ?? new Date(0).toISOString()),
    }));
  } catch {
    return [];
  }
}

async function loadRecentActivities(
  supabase: SupabaseClient,
  userId: string,
  spaceIds: string[]
): Promise<SpaceActivityRow[]> {
  if (spaceIds.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("guardian_events")
      .select("space_id, title, occurred_at, metadata")
      .eq("user_id", userId)
      .in("space_id", spaceIds)
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data
      .filter((row) => {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        // Prefer primary History cards over extracted twins for "recent".
        return (
          meta.extracted_from_daily_log !== true &&
          meta.derived_from_tell_guardian !== true
        );
      })
      .map((row) => ({
        spaceId: String(row.space_id),
        title: String(row.title ?? "Update"),
        at: String(row.occurred_at),
      }));
  } catch {
    return [];
  }
}

export type LoadMyWorldResult =
  | { ok: true; cards: WorldCard[] }
  | { ok: false; error: string; status: number };

export async function loadMyWorldCards(
  supabase: SupabaseClient,
  userId: string,
  options?: { now?: Date }
): Promise<LoadMyWorldResult> {
  const profiles = await listGuardianProfiles(supabase, userId);
  const roots = topLevelProfiles(profiles);
  const allSpaceIds = [...new Set(profiles.map((p) => p.id))];

  const [docRows, logRows, items, activities] = await Promise.all([
    loadDocumentCounts(supabase, allSpaceIds),
    loadLogCounts(supabase, allSpaceIds),
    loadItems(supabase, allSpaceIds),
    loadRecentActivities(supabase, userId, allSpaceIds),
  ]);

  const documentCounts = countsToMap(docRows);
  const logCounts = countsToMap(logRows);
  const now = options?.now ?? new Date();

  const cards = roots.map((root) => {
    const nested = nestedUnder(profiles, root);
    const spaceIds = spaceIdsForCard(profiles, root);
    const peoplePreview = nested
      .slice(0, 4)
      .map((p) => p.display_name.trim())
      .filter(Boolean);
    const stats = aggregateStatsForSpaces({
      spaceIds,
      items,
      activities,
      documentCounts,
      logCounts,
      linkedPeopleCount: nested.length,
      profileUpdatedAt: root.updated_at ?? null,
      now,
    });
    return buildWorldCard({
      spaceId: root.id,
      name: root.display_name.trim() || "Untitled",
      description: root.description?.trim() || null,
      profileType: root.profile_type,
      typeLabel: profileTypeLabel(root.profile_type),
      peoplePreview,
      updatedAt: root.updated_at ?? null,
      stats,
    });
  });

  return { ok: true, cards: sortWorldCards(cards) };
}
