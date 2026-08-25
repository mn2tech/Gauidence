import { NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/knowledge-studio/projects/apiContext";
import { refreshSource } from "@/lib/knowledge-studio/projects/ingest";
import type { KnowledgeSourceRow } from "@/lib/knowledge-studio/projects/types";

export const runtime = "nodejs";
export const maxDuration = 90;

type RouteContext = {
  params: Promise<{ slug: string; sourceId: string }>;
};

/** Refresh one source — detect unchanged vs changed (review required). */
export async function POST(_request: Request, context: RouteContext) {
  const { slug, sourceId } = await context.params;
  const ctx = await requireProjectAdmin(slug);
  if (ctx instanceof NextResponse) return ctx;

  const { data: source } = await ctx.admin
    .from("knowledge_sources")
    .select("*")
    .eq("id", sourceId)
    .eq("project_id", ctx.loaded.project.id)
    .maybeSingle();

  if (!source) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  }

  try {
    const result = await refreshSource({
      admin: ctx.admin,
      userId: ctx.user.id,
      source: source as KnowledgeSourceRow,
      allowedDomains: ctx.allowedDomains,
    });

    return NextResponse.json({
      ok: true,
      unchanged: Boolean(result.unchanged),
      changed: result.changed,
      items_created: result.items_created,
      message: result.unchanged
        ? "No change detected. last_checked_at updated."
        : "Source changed — review required",
      source: result.source,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Refresh failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
