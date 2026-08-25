import { NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/knowledge-studio/projects/apiContext";
import {
  approveAllItemsForSource,
  publishApprovedForSource,
} from "@/lib/knowledge-studio/projects/lifecycle";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; sourceId: string }>;
};

/** Bulk source actions: approve_all | publish_approved */
export async function POST(request: Request, context: RouteContext) {
  const { slug, sourceId } = await context.params;
  const ctx = await requireProjectAdmin(slug);
  if (ctx instanceof NextResponse) return ctx;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    version_id?: string;
  };

  if (body.action === "approve_all") {
    const result = await approveAllItemsForSource({
      admin: ctx.admin,
      projectId: ctx.loaded.project.id,
      sourceId,
      userId: ctx.user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, count: result.count });
  }

  if (body.action === "publish_approved") {
    const result = await publishApprovedForSource({
      admin: ctx.admin,
      projectId: ctx.loaded.project.id,
      sourceId,
      userId: ctx.user.id,
      versionId: body.version_id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, published: result.published });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
