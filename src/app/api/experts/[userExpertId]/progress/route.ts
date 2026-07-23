import { NextResponse } from "next/server";
import {
  isExpertAuthed,
  recordExpertActivity,
  requireExpertUser,
  requireOwnedUserExpert,
} from "@/lib/experts/server";
import type { ExpertModuleProgressStatus } from "@/lib/experts/expert-types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userExpertId: string }> };

const VALID_STATUSES = new Set<ExpertModuleProgressStatus>([
  "not_started",
  "in_progress",
  "completed",
  "skipped",
]);

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireExpertUser();
  if (!isExpertAuthed(auth)) return auth;

  const { userExpertId } = await context.params;
  const installation = await requireOwnedUserExpert(
    auth.supabase,
    auth.user.id,
    userExpertId
  );
  if (!installation) {
    return NextResponse.json({ error: "Expert installation not found." }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from("expert_module_progress")
    .select("*")
    .eq("user_expert_id", installation.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Couldn't load progress." }, { status: 502 });
  }

  return NextResponse.json({ progress: data ?? [] });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireExpertUser();
  if (!isExpertAuthed(auth)) return auth;

  const { userExpertId } = await context.params;
  const installation = await requireOwnedUserExpert(
    auth.supabase,
    auth.user.id,
    userExpertId
  );
  if (!installation) {
    return NextResponse.json({ error: "Expert installation not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const moduleId = typeof body.moduleId === "string" ? body.moduleId.trim() : "";
  const status =
    typeof body.status === "string" ? (body.status as ExpertModuleProgressStatus) : null;
  const progressPercent =
    typeof body.progressPercent === "number" ? body.progressPercent : undefined;

  if (!moduleId || !status || !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid module progress payload." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const row = {
    user_id: auth.user.id,
    user_expert_id: installation.id,
    module_id: moduleId,
    status,
    progress_percent:
      progressPercent ??
      (status === "completed" ? 100 : status === "in_progress" ? 50 : 0),
    started_at: status === "not_started" ? null : now,
    completed_at: status === "completed" ? now : null,
    updated_at: now,
  };

  const { data, error } = await auth.supabase
    .from("expert_module_progress")
    .upsert(row, { onConflict: "user_expert_id,module_id" })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Couldn't save progress." }, { status: 502 });
  }

  await recordExpertActivity(auth.supabase, {
    userId: auth.user.id,
    userExpertId: installation.id,
    activityType:
      status === "completed"
        ? "module_completed"
        : status === "in_progress"
          ? "module_started"
          : "lesson_viewed",
    contentId: moduleId,
  });

  return NextResponse.json({ progress: data });
}
