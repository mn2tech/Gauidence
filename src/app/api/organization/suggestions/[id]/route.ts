import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveOrganizationSuggestion,
  toOrganizationSuggestionPayload,
  validateOrganizationAiOutput,
} from "@/lib/organization";
import type { ResolveOrganizationAction } from "@/lib/organization";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const ACTIONS: ResolveOrganizationAction[] = [
  "accept",
  "reject",
  "keep_current",
  "keep_unorganized",
  "create_suggested",
  "undo",
];

export async function GET(_request: Request, ctx: Ctx) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const { data } = await supabase
    .from("organization_suggestions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
  }

  const entities = (data.detected_entities ?? {}) as Record<string, unknown>;
  const ai = validateOrganizationAiOutput({
    title: typeof entities.title === "string" ? entities.title : "",
    document_type: data.document_type ?? "general",
    summary: typeof entities.summary === "string" ? entities.summary : "",
    people: entities.people,
    organizations: entities.organizations,
    topics: entities.topics,
    dates: entities.dates,
    tags: data.suggested_tags,
    suggested_profile_name: data.suggested_profile_name ?? "",
    suggested_vault_name: data.suggested_vault_name ?? "",
    confidence: data.confidence,
    reason: data.reason ?? "",
    suggested_questions: [],
  });

  return NextResponse.json({
    suggestion: toOrganizationSuggestionPayload(data, ai),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const action = body.action;
  if (
    typeof action !== "string" ||
    !ACTIONS.includes(action as ResolveOrganizationAction)
  ) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const result = await resolveOrganizationSuggestion(supabase, {
    userId: user.id,
    suggestionId: id,
    action: action as ResolveOrganizationAction,
    targetProfileId:
      typeof body.targetProfileId === "string" ? body.targetProfileId : undefined,
    profileName:
      typeof body.profileName === "string" ? body.profileName : undefined,
    vaultName: typeof body.vaultName === "string" ? body.vaultName : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Failed." }, { status: 400 });
  }

  return NextResponse.json({
    suggestion: result.suggestion ?? null,
    movedToProfileId: result.movedToProfileId ?? null,
    undoAvailable: result.undoAvailable ?? false,
  });
}
