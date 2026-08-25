import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MCPS_AUTHORITY,
  MCPS_CATEGORY_DEFS,
  MCPS_DISCLAIMER,
  MCPS_PROJECT_NAME,
  MCPS_PROJECT_SLUG,
} from "./constants";
import type {
  KnowledgeProjectCategoryRow,
  KnowledgeProjectRow,
} from "./types";

export type LoadedKnowledgeProject = {
  project: KnowledgeProjectRow;
  categories: KnowledgeProjectCategoryRow[];
};

/**
 * Load a knowledge project by slug. Ensures MCPS seed rows exist if missing
 * (useful before migration is applied in some local setups).
 */
export async function loadKnowledgeProject(
  admin: SupabaseClient,
  slug: string
): Promise<LoadedKnowledgeProject | null> {
  if (slug === MCPS_PROJECT_SLUG) {
    await ensureMcpsProject(admin);
  }

  const { data: project, error } = await admin
    .from("knowledge_projects")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !project) return null;

  const { data: categories } = await admin
    .from("knowledge_project_categories")
    .select("*")
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true });

  return {
    project: project as KnowledgeProjectRow,
    categories: (categories ?? []) as KnowledgeProjectCategoryRow[],
  };
}

export async function ensureMcpsProject(admin: SupabaseClient): Promise<void> {
  const { data: existing } = await admin
    .from("knowledge_projects")
    .select("id")
    .eq("slug", MCPS_PROJECT_SLUG)
    .maybeSingle();

  let projectId = existing?.id as string | undefined;

  if (!projectId) {
    const { data: inserted, error } = await admin
      .from("knowledge_projects")
      .insert({
        slug: MCPS_PROJECT_SLUG,
        name: MCPS_PROJECT_NAME,
        description:
          "Curated public information for Montgomery County Public Schools parents.",
        authority_default: MCPS_AUTHORITY,
        disclaimer: MCPS_DISCLAIMER,
        project_type: "school_district",
      })
      .select("id")
      .single();
    if (error || !inserted) {
      console.error("ensureMcpsProject insert failed:", error?.message);
      return;
    }
    projectId = inserted.id as string;
  }

  for (let i = 0; i < MCPS_CATEGORY_DEFS.length; i++) {
    const cat = MCPS_CATEGORY_DEFS[i]!;
    await admin.from("knowledge_project_categories").upsert(
      {
        project_id: projectId,
        slug: cat.slug,
        name: cat.name,
        description: cat.description,
        sort_order: (i + 1) * 10,
      },
      { onConflict: "project_id,slug" }
    );
  }
}
