import { NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/knowledge-studio/projects/apiContext";
import { loadSourceReview } from "@/lib/knowledge-studio/projects/lifecycle";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; sourceId: string }>;
};

/** Source review payload: metadata, extracted text, items, versions. */
export async function GET(_request: Request, context: RouteContext) {
  const { slug, sourceId } = await context.params;
  const ctx = await requireProjectAdmin(slug);
  if (ctx instanceof NextResponse) return ctx;

  const review = await loadSourceReview({
    admin: ctx.admin,
    projectId: ctx.loaded.project.id,
    sourceId,
  });
  if (!review) {
    return NextResponse.json({ error: "Source not found." }, { status: 404 });
  }

  return NextResponse.json(review);
}
