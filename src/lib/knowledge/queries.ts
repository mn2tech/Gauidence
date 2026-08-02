import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceTimelineEntry = {
  id: string;
  title: string;
  eventDate: string | null;
  category: string | null;
  sourceType: string;
  sourceId: string;
  createdAt: string;
};

export type ProactiveSuggestionEntry = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  priority: number;
  dueDate: string | null;
  profileId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export async function listWorkspaceTimeline(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    profileId?: string | null;
    limit?: number;
  }
): Promise<WorkspaceTimelineEntry[]> {
  const limit = Math.min(Math.max(options?.limit ?? 8, 1), 50);
  let query = supabase
    .from("guardian_workspace_timeline")
    .select(
      "id, title, event_date, category, source_type, source_id, created_at"
    )
    .eq("owner_user_id", userId)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.profileId) {
    query = query.eq("profile_id", options.profileId);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return [];
    console.error(
      "guardian_workspace_timeline list failed:",
      error.code,
      error.message
    );
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    eventDate: row.event_date,
    category: row.category,
    sourceType: row.source_type,
    sourceId: row.source_id,
    createdAt: row.created_at,
  }));
}

export async function listProactiveSuggestions(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    profileId?: string | null;
    limit?: number;
  }
): Promise<ProactiveSuggestionEntry[]> {
  const limit = Math.min(Math.max(options?.limit ?? 5, 1), 20);
  let query = supabase
    .from("guardian_proactive_suggestions")
    .select(
      "id, kind, title, body, priority, due_date, profile_id, metadata, created_at"
    )
    .eq("owner_user_id", userId)
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.profileId) {
    query = query.or(
      `profile_id.eq.${options.profileId},profile_id.is.null`
    );
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return [];
    console.error(
      "guardian_proactive_suggestions list failed:",
      error.code,
      error.message
    );
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    priority: row.priority,
    dueDate: row.due_date,
    profileId: row.profile_id,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.created_at,
  }));
}

export async function dismissProactiveSuggestion(
  supabase: SupabaseClient,
  userId: string,
  suggestionId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("guardian_proactive_suggestions")
    .update({ status: "dismissed", updated_at: new Date().toISOString() })
    .eq("id", suggestionId)
    .eq("owner_user_id", userId);

  if (error) {
    console.error(
      "guardian_proactive_suggestions dismiss failed:",
      error.code,
      error.message
    );
    return false;
  }
  return true;
}
