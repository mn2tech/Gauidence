import { NextResponse } from "next/server";
import { requireKnowledgeStudioAdmin } from "@/lib/knowledge-studio/auth";
import { CROSSROADS_ORG_SLUG } from "@/lib/knowledge-studio/constants";
import {
  archiveKnowledgeFact,
  publishKnowledgeFact,
} from "@/lib/knowledge-studio/publish";

export const runtime = "nodejs";

/** List all CrossRoads knowledge facts for admin review. */
export async function GET() {
  const ctx = await requireKnowledgeStudioAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const { data, error } = await ctx.admin
    .from("knowledge_facts")
    .select("*")
    .eq("organization_slug", CROSSROADS_ORG_SLUG)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ facts: data ?? [] });
}

/** Publish or archive a fact. */
export async function PATCH(request: Request) {
  const ctx = await requireKnowledgeStudioAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    action?: string;
  };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  if (body.action === "publish") {
    const result = await publishKnowledgeFact({
      admin: ctx.admin,
      id,
      organizationSlug: CROSSROADS_ORG_SLUG,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "archive") {
    const result = await archiveKnowledgeFact({
      admin: ctx.admin,
      id,
      organizationSlug: CROSSROADS_ORG_SLUG,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
