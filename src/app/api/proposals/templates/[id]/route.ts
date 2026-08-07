import { NextResponse } from "next/server";
import {
  isProposalAuthed,
  requireProposalUser,
} from "@/lib/proposals/auth";
import { PROPOSAL_TEMPLATE_SELECT } from "@/lib/proposals/types";
import {
  parseDeliverables,
  parseLineItems,
  parseOptionalText,
  parseTimeline,
  parseTitle,
} from "@/lib/proposals/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (body.name != null) {
    const name = parseTitle(body.name, 120);
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    patch.name = name;
  }
  if (body.description !== undefined) patch.description = parseOptionalText(body.description, 2000);
  if (body.defaultTitle !== undefined || body.default_title !== undefined) {
    patch.default_title = parseOptionalText(body.defaultTitle ?? body.default_title, 200);
  }
  if (body.defaultSummary !== undefined || body.default_summary !== undefined) {
    patch.default_summary = parseOptionalText(body.defaultSummary ?? body.default_summary);
  }
  if (body.defaultIntroduction !== undefined || body.default_introduction !== undefined) {
    patch.default_introduction = parseOptionalText(
      body.defaultIntroduction ?? body.default_introduction
    );
  }
  if (body.defaultTerms !== undefined || body.default_terms !== undefined) {
    patch.default_terms = parseOptionalText(body.defaultTerms ?? body.default_terms);
  }
  if (body.defaultLineItems != null || body.default_line_items != null) {
    patch.default_line_items = parseLineItems(body.defaultLineItems ?? body.default_line_items);
  }
  if (body.defaultTimeline != null || body.default_timeline != null) {
    patch.default_timeline = parseTimeline(body.defaultTimeline ?? body.default_timeline);
  }
  if (body.defaultDeliverables != null || body.default_deliverables != null) {
    patch.default_deliverables = parseDeliverables(
      body.defaultDeliverables ?? body.default_deliverables
    );
  }
  if (body.defaultAddons != null || body.default_addons != null) {
    patch.default_addons = parseLineItems(body.defaultAddons ?? body.default_addons);
  }
  if (body.isActive != null || body.is_active != null) {
    patch.is_active = Boolean(body.isActive ?? body.is_active);
  }
  const { data, error } = await auth.supabase
    .from("proposal_templates")
    .update(patch)
    .eq("id", id)
    .select(PROPOSAL_TEMPLATE_SELECT)
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Couldn't update template." }, { status: 500 });
  }
  return NextResponse.json({ template: data });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireProposalUser();
  if (!isProposalAuthed(auth)) return auth;
  const { id } = await context.params;
  const { error } = await auth.supabase
    .from("proposal_templates")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Couldn't delete template." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
