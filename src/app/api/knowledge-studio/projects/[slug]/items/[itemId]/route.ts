import { NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/knowledge-studio/projects/apiContext";
import {
  deleteKnowledgeItem,
  setKnowledgeItemStatus,
  updateKnowledgeItem,
} from "@/lib/knowledge-studio/projects/lifecycle";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; itemId: string }>;
};

/** Edit / approve / reject / delete a knowledge item. */
export async function PATCH(request: Request, context: RouteContext) {
  const { slug, itemId } = await context.params;
  const ctx = await requireProjectAdmin(slug);
  if (ctx instanceof NextResponse) return ctx;

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    title?: string;
    content?: string;
    subcategory?: string | null;
    school?: string | null;
    grade_level?: string | null;
    evidence_text?: string;
  };

  if (body.action === "approve") {
    const result = await setKnowledgeItemStatus({
      admin: ctx.admin,
      projectId: ctx.loaded.project.id,
      itemId,
      status: "approved",
      userId: ctx.user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reject") {
    const result = await setKnowledgeItemStatus({
      admin: ctx.admin,
      projectId: ctx.loaded.project.id,
      itemId,
      status: "rejected",
      userId: ctx.user.id,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const result = await deleteKnowledgeItem({
      admin: ctx.admin,
      projectId: ctx.loaded.project.id,
      itemId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "edit" || body.title || body.content) {
    const patch: Record<string, string | null> = {};
    if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200);
    if (typeof body.content === "string")
      patch.content = body.content.trim().slice(0, 8000);
    if (typeof body.evidence_text === "string")
      patch.evidence_text = body.evidence_text.trim().slice(0, 8000);
    if (body.subcategory !== undefined)
      patch.subcategory =
        typeof body.subcategory === "string"
          ? body.subcategory.trim().slice(0, 120)
          : null;
    if (body.school !== undefined)
      patch.school =
        typeof body.school === "string" ? body.school.trim().slice(0, 200) : null;
    if (body.grade_level !== undefined)
      patch.grade_level =
        typeof body.grade_level === "string"
          ? body.grade_level.trim().slice(0, 80)
          : null;

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const result = await updateKnowledgeItem({
      admin: ctx.admin,
      projectId: ctx.loaded.project.id,
      itemId,
      patch,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, item: result.item });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
