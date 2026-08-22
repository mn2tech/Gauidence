import { NextResponse } from "next/server";
import { requireKnowledgeStudioAdmin } from "@/lib/knowledge-studio/auth";
import { CROSSROADS_ORG_SLUG } from "@/lib/knowledge-studio/constants";
import {
  editSuccessMessage,
  LIFECYCLE_SUCCESS_MESSAGES,
} from "@/lib/knowledge-studio/lifecycle";
import {
  archiveKnowledgeFact,
  deleteDraftKnowledgeFact,
  editKnowledgeFact,
  publishKnowledgeFact,
  restoreKnowledgeFact,
  unpublishKnowledgeFact,
} from "@/lib/knowledge-studio/publish";
import type { KnowledgeFactRow } from "@/lib/knowledge-studio/types";

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

function pickFactEditFields(body: Record<string, unknown>) {
  const fields: Record<string, string | null | undefined> = {};
  for (const key of [
    "category",
    "title",
    "content",
    "source_label",
    "source_url",
  ] as const) {
    if (key in body) {
      fields[key] =
        typeof body[key] === "string" || body[key] === null
          ? (body[key] as string | null)
          : undefined;
    }
  }
  return fields;
}

/** Lifecycle actions and edits for a fact. */
export async function PATCH(request: Request) {
  const ctx = await requireKnowledgeStudioAdmin();
  if (ctx instanceof NextResponse) return ctx;

  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const id = typeof body.id === "string" ? body.id : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  if (action === "publish") {
    const result = await publishKnowledgeFact({
      admin: ctx.admin,
      id,
      organizationSlug: CROSSROADS_ORG_SLUG,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: LIFECYCLE_SUCCESS_MESSAGES.published,
    });
  }

  if (action === "unpublish") {
    const result = await unpublishKnowledgeFact({
      admin: ctx.admin,
      id,
      organizationSlug: CROSSROADS_ORG_SLUG,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: LIFECYCLE_SUCCESS_MESSAGES.unpublished,
    });
  }

  if (action === "archive") {
    const result = await archiveKnowledgeFact({
      admin: ctx.admin,
      id,
      organizationSlug: CROSSROADS_ORG_SLUG,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: LIFECYCLE_SUCCESS_MESSAGES.archived,
    });
  }

  if (action === "restore") {
    const result = await restoreKnowledgeFact({
      admin: ctx.admin,
      id,
      organizationSlug: CROSSROADS_ORG_SLUG,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: LIFECYCLE_SUCCESS_MESSAGES.restored,
    });
  }

  if (action === "edit") {
    const existing = await ctx.admin
      .from("knowledge_facts")
      .select("lifecycle_status")
      .eq("id", id)
      .eq("organization_slug", CROSSROADS_ORG_SLUG)
      .maybeSingle();
    const previousStatus = (existing.data as Pick<
      KnowledgeFactRow,
      "lifecycle_status"
    > | null)?.lifecycle_status;

    const result = await editKnowledgeFact({
      admin: ctx.admin,
      id,
      organizationSlug: CROSSROADS_ORG_SLUG,
      fields: pickFactEditFields(body),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      fact: result.row,
      message: previousStatus
        ? editSuccessMessage(previousStatus)
        : LIFECYCLE_SUCCESS_MESSAGES.editDraft,
    });
  }

  if (action === "delete") {
    const result = await deleteDraftKnowledgeFact({
      admin: ctx.admin,
      id,
      organizationSlug: CROSSROADS_ORG_SLUG,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      message: LIFECYCLE_SUCCESS_MESSAGES.deleted,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
