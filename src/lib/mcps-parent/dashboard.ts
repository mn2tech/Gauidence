import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MCPS_PROJECT_SLUG } from "@/lib/knowledge-studio/projects/constants";
import { loadKnowledgeProject } from "@/lib/knowledge-studio/projects/loadProject";
import {
  PARENT_COMING_UP_MAX_ITEMS,
  PARENT_DASHBOARD_MAX_ITEMS,
} from "./constants";
import { greetingForNow } from "./dates";
import {
  buildSuggestedQuestions,
  groupComingUp,
  rankWhatMatters,
  type ScoreableKnowledge,
} from "./scoring";
import type {
  ParentDashboardPayload,
  ParentIntelligenceDebugItem,
  ParentSchoolContext,
  ScoredParentItem,
} from "./types";

async function loadPublishedScoreableItems(
  admin: SupabaseClient,
  projectId: string
): Promise<ScoreableKnowledge[]> {
  const { data: items } = await admin
    .from("knowledge_items")
    .select(
      "id, title, content, category, school, grade_level, authority, source_url, effective_date, expires_at, status, source_id"
    )
    .eq("project_id", projectId)
    .eq("status", "published");

  const rows = items ?? [];
  const sourceIds = [
    ...new Set(
      rows
        .map((r) => r.source_id as string | null)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const sourceMeta = new Map<
    string,
    { source_name: string; last_checked_at: string | null }
  >();
  if (sourceIds.length) {
    const { data: sources } = await admin
      .from("knowledge_sources")
      .select("id, source_name, last_checked_at")
      .in("id", sourceIds);
    for (const s of sources ?? []) {
      sourceMeta.set(s.id as string, {
        source_name: s.source_name as string,
        last_checked_at: (s.last_checked_at as string | null) ?? null,
      });
    }
  }

  return rows.map((r) => {
    const meta = sourceMeta.get(r.source_id as string);
    return {
      id: r.id as string,
      title: r.title as string,
      content: r.content as string,
      category: r.category as string,
      school: (r.school as string | null) ?? null,
      grade_level: (r.grade_level as string | null) ?? null,
      authority: (r.authority as string | null) ?? null,
      source_url: (r.source_url as string | null) ?? null,
      effective_date: (r.effective_date as string | null) ?? null,
      expires_at: (r.expires_at as string | null) ?? null,
      status: r.status as string,
      source_name: meta?.source_name,
      last_checked_at: meta?.last_checked_at ?? null,
    };
  });
}

export async function getPrimarySchoolContext(
  supabase: SupabaseClient,
  userId: string
): Promise<ParentSchoolContext | null> {
  const { data } = await supabase
    .from("parent_school_contexts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  return (data as ParentSchoolContext | null) ?? null;
}

export async function upsertPrimarySchoolContext(args: {
  supabase: SupabaseClient;
  userId: string;
  schoolName: string;
  gradeLevel: string;
}): Promise<ParentSchoolContext> {
  const school_name = args.schoolName.trim().slice(0, 200);
  const grade_level = args.gradeLevel.trim().slice(0, 40);
  if (!school_name) throw new Error("School is required.");
  if (!grade_level) throw new Error("Grade is required.");

  const existing = await getPrimarySchoolContext(args.supabase, args.userId);
  if (existing) {
    const { data, error } = await args.supabase
      .from("parent_school_contexts")
      .update({ school_name, grade_level, is_primary: true })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not save.");
    return data as ParentSchoolContext;
  }

  const { data, error } = await args.supabase
    .from("parent_school_contexts")
    .insert({
      user_id: args.userId,
      school_name,
      grade_level,
      is_primary: true,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save.");
  return data as ParentSchoolContext;
}

export async function buildParentDashboard(args: {
  admin: SupabaseClient;
  supabase: SupabaseClient;
  userId: string;
  asOf?: Date;
}): Promise<ParentDashboardPayload> {
  const asOf = args.asOf ?? new Date();
  const context = await getPrimarySchoolContext(args.supabase, args.userId);
  const greeting = greetingForNow(asOf);

  if (!context) {
    return {
      context: null,
      greeting,
      state: "needs_setup",
      what_you_need: [],
      coming_up: [],
      suggested_questions: buildSuggestedQuestions({
        hasSchool: false,
        topItems: [],
      }),
    };
  }

  const loaded = await loadKnowledgeProject(args.admin, MCPS_PROJECT_SLUG);
  if (!loaded) {
    return {
      context,
      greeting,
      state: "caught_up",
      what_you_need: [],
      coming_up: [],
      suggested_questions: buildSuggestedQuestions({
        hasSchool: true,
        topItems: [],
      }),
    };
  }

  const published = await loadPublishedScoreableItems(
    args.admin,
    loaded.project.id
  );
  const ranked = rankWhatMatters(
    published,
    {
      schoolName: context.school_name,
      gradeLevel: context.grade_level,
      asOf,
    },
    PARENT_COMING_UP_MAX_ITEMS
  );

  const what_you_need = ranked.slice(0, PARENT_DASHBOARD_MAX_ITEMS);
  const coming_up = groupComingUp(ranked, asOf);

  return {
    context,
    greeting,
    state: what_you_need.length ? "has_items" : "caught_up",
    what_you_need,
    coming_up,
    suggested_questions: buildSuggestedQuestions({
      hasSchool: true,
      topItems: what_you_need,
    }),
  };
}

export async function runParentIntelligenceTest(args: {
  admin: SupabaseClient;
  schoolName: string;
  gradeLevel: string;
  asOf?: Date;
}): Promise<{
  as_of: string;
  school_name: string;
  grade_level: string;
  items: ParentIntelligenceDebugItem[];
}> {
  const asOf = args.asOf ?? new Date();
  const loaded = await loadKnowledgeProject(args.admin, MCPS_PROJECT_SLUG);
  if (!loaded) {
    return {
      as_of: asOf.toISOString(),
      school_name: args.schoolName,
      grade_level: args.gradeLevel,
      items: [],
    };
  }
  const published = await loadPublishedScoreableItems(
    args.admin,
    loaded.project.id
  );
  const ranked = rankWhatMatters(
    published,
    {
      schoolName: args.schoolName,
      gradeLevel: args.gradeLevel,
      asOf,
    },
    12
  );

  return {
    as_of: asOf.toISOString(),
    school_name: args.schoolName,
    grade_level: args.gradeLevel,
    items: ranked.map((item) => ({
      ...item,
      publication_status: "published",
    })),
  };
}

export function formatItemForParent(item: ScoredParentItem): string {
  const why =
    item.reasons.length > 0
      ? `Why you're seeing this: ${item.reasons[0]}`
      : null;
  return [item.title, item.summary, why].filter(Boolean).join("\n");
}
