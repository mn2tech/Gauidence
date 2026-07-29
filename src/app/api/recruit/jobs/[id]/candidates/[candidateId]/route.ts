import { NextResponse } from "next/server";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import {
  getCandidateWithDetails,
  getRecruitmentJob,
  logRecruitAudit,
} from "@/lib/recruit/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; candidateId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { candidateId } = await context.params;

  const candidate = await getCandidateWithDetails(auth.supabase, candidateId);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  return NextResponse.json({ candidate });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id: jobId, candidateId } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.manual_rank === "number") {
    updates.manual_rank = body.manual_rank;
  }
  if (typeof body.review_status === "string") {
    updates.review_status = body.review_status;
  }
  if (typeof body.display_name === "string") {
    updates.display_name = body.display_name.trim() || null;
  }

  const { data, error } = await auth.supabase
    .from("recruitment_candidates")
    .update(updates)
    .eq("id", candidateId)
    .eq("job_id", jobId)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't update candidate." },
      { status: 502 }
    );
  }

  return NextResponse.json({ candidate: data });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id: jobId, candidateId } = await context.params;

  const candidate = await getCandidateWithDetails(auth.supabase, candidateId);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  for (const file of candidate.files) {
    await auth.supabase.storage
      .from(file.storage_bucket)
      .remove([file.file_path]);
  }

  const { error } = await auth.supabase
    .from("recruitment_candidates")
    .delete()
    .eq("id", candidateId)
    .eq("job_id", jobId);

  if (error) {
    return NextResponse.json(
      { error: "Couldn't delete candidate." },
      { status: 502 }
    );
  }

  await logRecruitAudit(auth.supabase, {
    jobId,
    actorUserId: auth.user.id,
    action: "candidate_deleted",
    details: { candidate_id: candidateId },
  });

  return NextResponse.json({ ok: true });
}
