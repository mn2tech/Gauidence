import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  WORK_PROJECT_SELECT,
  WORK_SESSION_SELECT,
  type WorkProject,
  type WorkSession,
} from "@/lib/work-memory/types";

export async function listWorkProjects(
  supabase: SupabaseClient,
  userId: string,
  options?: { includeArchived?: boolean }
): Promise<WorkProject[]> {
  let query = supabase
    .from("work_projects")
    .select(WORK_PROJECT_SELECT)
    .eq("owner_user_id", userId)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (!options?.includeArchived) {
    query = query.neq("status", "archived");
  }

  const { data, error } = await query;
  if (error) {
    console.error("listWorkProjects:", error.message);
    return [];
  }
  return (data ?? []) as WorkProject[];
}

export async function getWorkProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string
): Promise<WorkProject | null> {
  const { data, error } = await supabase
    .from("work_projects")
    .select(WORK_PROJECT_SELECT)
    .eq("owner_user_id", userId)
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.error("getWorkProject:", error.message);
    return null;
  }
  return (data as WorkProject | null) ?? null;
}

export async function listWorkSessions(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  limit = 10
): Promise<WorkSession[]> {
  const { data, error } = await supabase
    .from("work_sessions")
    .select(WORK_SESSION_SELECT)
    .eq("owner_user_id", userId)
    .eq("project_id", projectId)
    .order("ended_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listWorkSessions:", error.message);
    return [];
  }
  return (data ?? []) as WorkSession[];
}

export type WorkMemoryGideonBundle = {
  projects: WorkProject[];
  sessionsByProject: Map<string, WorkSession[]>;
};

export async function loadWorkMemoryForGideon(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkMemoryGideonBundle> {
  const projects = (await listWorkProjects(supabase, userId)).filter(
    (p) => p.status !== "done" && p.status !== "archived"
  );
  if (projects.length === 0) {
    return { projects: [], sessionsByProject: new Map() };
  }

  const projectIds = projects.map((p) => p.id);
  const { data: sessions, error } = await supabase
    .from("work_sessions")
    .select(WORK_SESSION_SELECT)
    .eq("owner_user_id", userId)
    .in("project_id", projectIds)
    .order("ended_at", { ascending: false });

  if (error) {
    console.error("loadWorkMemoryForGideon:", error.message);
    return { projects, sessionsByProject: new Map() };
  }

  const sessionsByProject = new Map<string, WorkSession[]>();
  for (const row of (sessions ?? []) as WorkSession[]) {
    const list = sessionsByProject.get(row.project_id) ?? [];
    if (list.length < 3) list.push(row);
    sessionsByProject.set(row.project_id, list);
  }

  return { projects, sessionsByProject };
}
