import { NextResponse } from "next/server";
import { requireKnowledgeStudioAdmin } from "@/lib/knowledge-studio/auth";
import { CROSSROADS_ORG_SLUG } from "@/lib/knowledge-studio/constants";
import {
  archiveKnowledgeEvent,
  publishKnowledgeEvent,
} from "@/lib/knowledge-studio/publish";

export const runtime = "nodejs";

/** List all CrossRoads knowledge events for admin review. */
export async function GET() {
  const ctx = await requireKnowledgeStudioAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const { data, error } = await ctx.admin
    .from("knowledge_events")
    .select("*")
    .eq("organization_slug", CROSSROADS_ORG_SLUG)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ events: data ?? [] });
}

/** Create a manual draft event. */
export async function POST(request: Request) {
  const ctx = await requireKnowledgeStudioAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const { data, error } = await ctx.admin
    .from("knowledge_events")
    .insert({
      organization_slug: CROSSROADS_ORG_SLUG,
      title,
      description:
        typeof body.description === "string" ? body.description.trim() : null,
      start_at:
        typeof body.start_at === "string" && body.start_at.trim()
          ? body.start_at
          : null,
      end_at:
        typeof body.end_at === "string" && body.end_at.trim()
          ? body.end_at
          : null,
      location:
        typeof body.location === "string" ? body.location.trim() : null,
      organizer:
        typeof body.organizer === "string" ? body.organizer.trim() : null,
      contact: typeof body.contact === "string" ? body.contact.trim() : null,
      rsvp_url:
        typeof body.rsvp_url === "string" ? body.rsvp_url.trim() : null,
      cost: typeof body.cost === "string" ? body.cost.trim() : null,
      audience:
        typeof body.audience === "string" ? body.audience.trim() : null,
      source_label:
        typeof body.source_label === "string" && body.source_label.trim()
          ? body.source_label.trim()
          : "Manual entry",
      source_url:
        typeof body.source_url === "string" ? body.source_url.trim() : null,
      lifecycle_status: "draft",
      visibility: "private",
      created_by: ctx.user.id,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ event: data });
}

/** Publish or archive an event. */
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
    const result = await publishKnowledgeEvent({
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
    const result = await archiveKnowledgeEvent({
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
