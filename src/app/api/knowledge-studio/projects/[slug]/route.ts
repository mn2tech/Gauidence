import { NextResponse } from "next/server";
import { buildProjectDashboard } from "@/lib/knowledge-studio/projects/dashboard";
import { requireProjectAdmin } from "@/lib/knowledge-studio/projects/apiContext";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

/** Project overview + dashboard stats + source list. */
export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const ctx = await requireProjectAdmin(slug);
  if (ctx instanceof NextResponse) return ctx;

  const dashboard = await buildProjectDashboard({
    admin: ctx.admin,
    projectId: ctx.loaded.project.id,
    categories: ctx.loaded.categories,
  });

  const { data: sources, error } = await ctx.admin
    .from("knowledge_sources")
    .select(
      "id, source_name, source_url, category, authority, scope, status, refresh_frequency, last_checked_at, last_successful_fetch_at, content_hash, created_at, updated_at"
    )
    .eq("project_id", ctx.loaded.project.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    project: ctx.loaded.project,
    categories: ctx.loaded.categories,
    dashboard,
    sources: sources ?? [],
  });
}
