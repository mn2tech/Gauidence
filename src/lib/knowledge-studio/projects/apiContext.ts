import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireKnowledgeStudioAdmin,
  type KnowledgeStudioAdminContext,
} from "@/lib/knowledge-studio/auth";
import {
  allowedDomainsForProject,
  MCPS_CATEGORY_SLUGS,
  MCPS_PROJECT_SLUG,
} from "@/lib/knowledge-studio/projects/constants";
import { loadKnowledgeProject } from "@/lib/knowledge-studio/projects/loadProject";
import type { LoadedKnowledgeProject } from "@/lib/knowledge-studio/projects/loadProject";

export async function requireProjectAdmin(
  slug: string
): Promise<
  | (KnowledgeStudioAdminContext & {
      loaded: LoadedKnowledgeProject;
      allowedDomains: readonly string[];
      categorySlugs: string[];
    })
  | NextResponse
> {
  const ctx = await requireKnowledgeStudioAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const loaded = await loadKnowledgeProject(ctx.admin, slug);
  if (!loaded) {
    return NextResponse.json({ error: "Knowledge project not found." }, { status: 404 });
  }

  const domains = allowedDomainsForProject(slug);
  if (!domains) {
    return NextResponse.json(
      { error: "Knowledge project domain allowlist is not configured." },
      { status: 400 }
    );
  }

  const categorySlugs =
    slug === MCPS_PROJECT_SLUG
      ? [...MCPS_CATEGORY_SLUGS]
      : loaded.categories.map((c) => c.slug);

  return {
    ...ctx,
    loaded,
    allowedDomains: domains,
    categorySlugs,
  };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export type AdminDb = SupabaseClient;
