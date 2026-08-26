import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MCPS_PROJECT_SLUG } from "@/lib/knowledge-studio/projects/constants";
import { loadKnowledgeProject } from "@/lib/knowledge-studio/projects/loadProject";
import {
  MAX_PARENT_SCHOOL_CONTEXTS,
  PARENT_COMING_UP_MAX_ITEMS,
  PARENT_DASHBOARD_MAX_ITEMS,
} from "./constants";
import {
  getPrimarySchoolContext,
  listParentSchoolContexts,
} from "./contexts";
import { greetingForNow } from "./dates";
import {
  buildFamilySuggestedQuestions,
  displayContextLabel,
  mergeFamilyItems,
} from "./family";
import {
  groupComingUp,
  rankWhatMatters,
  type ScoreableKnowledge,
} from "./scoring";
import type {
  ParentActiveView,
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

export {
  getPrimarySchoolContext,
  listParentSchoolContexts,
  upsertPrimarySchoolContext,
  createParentSchoolContext,
  updateParentSchoolContext,
  deleteParentSchoolContext,
  setPrimaryParentSchoolContext,
  getParentSchoolContextById,
} from "./contexts";

function resolveActiveView(
  view: string | null | undefined,
  contexts: ParentSchoolContext[]
): ParentActiveView {
  if (!view || view === "all") return "all";
  if (contexts.some((c) => c.id === view)) return view;
  return "all";
}

function annotateSingleContext(
  items: ScoredParentItem[],
  context: ParentSchoolContext
): ScoredParentItem[] {
  const label = displayContextLabel(context);
  return items.map((item) => {
    const districtWide = !item.school?.trim();
    return {
      ...item,
      applies_to_context_ids: [context.id],
      district_wide: districtWide,
      applies_to_labels: districtWide ? ["All MCPS schools"] : [label],
    };
  });
}

export async function buildParentDashboard(args: {
  admin: SupabaseClient;
  supabase: SupabaseClient;
  userId: string;
  asOf?: Date;
  /** Temporary UI view: "all" or a context id. */
  activeView?: string | null;
}): Promise<ParentDashboardPayload> {
  const asOf = args.asOf ?? new Date();
  const contexts = await listParentSchoolContexts(args.supabase, args.userId);
  const primary =
    contexts.find((c) => c.is_primary) ??
    (await getPrimarySchoolContext(args.supabase, args.userId));
  const greeting = greetingForNow(asOf);
  const active_view = resolveActiveView(args.activeView, contexts);

  if (!contexts.length) {
    return {
      context: null,
      primary_context: null,
      contexts: [],
      active_view: "all",
      greeting,
      state: "needs_setup",
      what_you_need: [],
      coming_up: [],
      suggested_questions: buildFamilySuggestedQuestions({
        view: "all",
        topItems: [],
      }),
      max_contexts: MAX_PARENT_SCHOOL_CONTEXTS,
    };
  }

  const loaded = await loadKnowledgeProject(args.admin, MCPS_PROJECT_SLUG);
  if (!loaded) {
    return {
      context: primary,
      primary_context: primary,
      contexts,
      active_view,
      greeting,
      state: "caught_up",
      what_you_need: [],
      coming_up: [],
      suggested_questions: buildFamilySuggestedQuestions({
        view: active_view === "all" ? "all" : "single",
        topItems: [],
      }),
      max_contexts: MAX_PARENT_SCHOOL_CONTEXTS,
    };
  }

  const published = await loadPublishedScoreableItems(
    args.admin,
    loaded.project.id
  );

  let what_you_need: ScoredParentItem[] = [];
  let comingPool: ScoredParentItem[] = [];

  if (active_view === "all") {
    const perContext = contexts.map((context) => ({
      context,
      items: rankWhatMatters(
        published,
        {
          schoolName: context.school_name,
          gradeLevel: context.grade_level,
          asOf,
        },
        PARENT_COMING_UP_MAX_ITEMS
      ),
    }));
    const merged = mergeFamilyItems({
      perContext,
      limit: Math.max(PARENT_COMING_UP_MAX_ITEMS, PARENT_DASHBOARD_MAX_ITEMS),
    });
    what_you_need = merged.slice(0, PARENT_DASHBOARD_MAX_ITEMS);
    comingPool = merged;
  } else {
    const context =
      contexts.find((c) => c.id === active_view) ?? primary ?? contexts[0]!;
    const ranked = rankWhatMatters(
      published,
      {
        schoolName: context.school_name,
        gradeLevel: context.grade_level,
        asOf,
      },
      PARENT_COMING_UP_MAX_ITEMS
    );
    const annotated = annotateSingleContext(ranked, context);
    what_you_need = annotated.slice(0, PARENT_DASHBOARD_MAX_ITEMS);
    comingPool = annotated;
  }

  const coming_up = groupComingUp(comingPool, asOf);

  return {
    context: primary,
    primary_context: primary,
    contexts,
    active_view,
    greeting,
    state: what_you_need.length ? "has_items" : "caught_up",
    what_you_need,
    coming_up,
    suggested_questions: buildFamilySuggestedQuestions({
      view: active_view === "all" ? "all" : "single",
      topItems: what_you_need,
    }),
    max_contexts: MAX_PARENT_SCHOOL_CONTEXTS,
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

export async function runFamilyIntelligenceTest(args: {
  admin: SupabaseClient;
  children: Array<{
    label?: string | null;
    school_name: string;
    grade_level: string;
  }>;
  asOf?: Date;
}): Promise<{
  as_of: string;
  children: Array<{
    id: string;
    label: string | null;
    school_name: string;
    grade_level: string;
  }>;
  items: Array<
    ParentIntelligenceDebugItem & {
      applies_to: string[];
      district_wide: boolean;
      merged_score: number;
      original_scores: number[];
    }
  >;
}> {
  const asOf = args.asOf ?? new Date();
  const children = args.children
    .filter((c) => c.school_name.trim() && c.grade_level.trim())
    .slice(0, MAX_PARENT_SCHOOL_CONTEXTS)
    .map((c, i) => ({
      id: `child-${i + 1}`,
      label: c.label?.trim() || null,
      school_name: c.school_name.trim(),
      grade_level: c.grade_level.trim(),
      is_primary: i === 0,
      user_id: "admin-test",
      school_id: null,
      created_at: asOf.toISOString(),
      updated_at: asOf.toISOString(),
    }));

  const loaded = await loadKnowledgeProject(args.admin, MCPS_PROJECT_SLUG);
  if (!loaded || !children.length) {
    return {
      as_of: asOf.toISOString(),
      children: children.map((c) => ({
        id: c.id,
        label: c.label,
        school_name: c.school_name,
        grade_level: c.grade_level,
      })),
      items: [],
    };
  }

  const published = await loadPublishedScoreableItems(
    args.admin,
    loaded.project.id
  );

  const originalScores = new Map<string, number[]>();
  const perContext = children.map((context) => {
    const items = rankWhatMatters(
      published,
      {
        schoolName: context.school_name,
        gradeLevel: context.grade_level,
        asOf,
      },
      12
    );
    for (const item of items) {
      const prev = originalScores.get(item.id) ?? [];
      prev.push(item.score);
      originalScores.set(item.id, prev);
    }
    return { context, items };
  });

  const merged = mergeFamilyItems({ perContext, limit: 12 });

  return {
    as_of: asOf.toISOString(),
    children: children.map((c) => ({
      id: c.id,
      label: c.label,
      school_name: c.school_name,
      grade_level: c.grade_level,
    })),
    items: merged.map((item) => ({
      ...item,
      publication_status: "published",
      applies_to: item.applies_to_labels ?? [],
      district_wide: Boolean(item.district_wide),
      merged_score: item.score,
      original_scores: originalScores.get(item.id) ?? [item.score],
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
