import { NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/knowledge-studio/projects/apiContext";
import { refreshAllSources } from "@/lib/knowledge-studio/projects/ingest";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ slug: string }> };

/** Refresh all non-archived sources in the project. */
export async function POST(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const ctx = await requireProjectAdmin(slug);
  if (ctx instanceof NextResponse) return ctx;

  const result = await refreshAllSources({
    admin: ctx.admin,
    userId: ctx.user.id,
    projectId: ctx.loaded.project.id,
    allowedDomains: ctx.allowedDomains,
  });

  return NextResponse.json({ ok: true, ...result });
}
