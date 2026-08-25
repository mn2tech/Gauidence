import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CategoryDashboardStats,
  KnowledgeItemRow,
  KnowledgeProjectCategoryRow,
  KnowledgeSourceRow,
  ProjectDashboardStats,
} from "./types";

export async function buildProjectDashboard(args: {
  admin: SupabaseClient;
  projectId: string;
  categories: KnowledgeProjectCategoryRow[];
}): Promise<ProjectDashboardStats> {
  const [{ data: sources }, { data: items }] = await Promise.all([
    args.admin
      .from("knowledge_sources")
      .select(
        "id, category, status, last_checked_at, last_successful_fetch_at"
      )
      .eq("project_id", args.projectId)
      .neq("status", "archived"),
    args.admin
      .from("knowledge_items")
      .select("id, category, status, source_id")
      .eq("project_id", args.projectId)
      .neq("status", "archived"),
  ]);

  const sourceRows = (sources ?? []) as Pick<
    KnowledgeSourceRow,
    "id" | "category" | "status" | "last_checked_at" | "last_successful_fetch_at"
  >[];
  const itemRows = (items ?? []) as Pick<
    KnowledgeItemRow,
    "id" | "category" | "status" | "source_id"
  >[];

  let needs_review = 0;
  let failed = 0;
  for (const s of sourceRows) {
    if (s.status === "needs_review" || s.status === "draft") needs_review += 1;
    if (s.status === "failed") failed += 1;
  }

  // Also count item-level review backlog for the headline Needs Review metric.
  const itemNeedsReview = itemRows.filter(
    (i) => i.status === "needs_review" || i.status === "draft"
  ).length;
  needs_review = Math.max(needs_review, itemNeedsReview);

  let last_refresh: string | null = null;
  for (const s of sourceRows) {
    const t = s.last_checked_at || s.last_successful_fetch_at;
    if (!t) continue;
    if (!last_refresh || t > last_refresh) last_refresh = t;
  }

  const categories: CategoryDashboardStats[] = args.categories.map((cat) => {
    const catSources = sourceRows.filter((s) => s.category === cat.slug);
    const catItems = itemRows.filter((i) => i.category === cat.slug);
    return {
      slug: cat.slug,
      name: cat.name,
      sources: catSources.length,
      published: catItems.filter((i) => i.status === "published").length,
      needs_review: catItems.filter(
        (i) => i.status === "needs_review" || i.status === "draft"
      ).length,
    };
  });

  return {
    sources: sourceRows.length,
    published: itemRows.filter((i) => i.status === "published").length,
    needs_review,
    failed,
    last_refresh,
    categories,
  };
}
