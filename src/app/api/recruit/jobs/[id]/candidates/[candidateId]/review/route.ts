import { NextResponse } from "next/server";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import {
  getCandidateWithDetails,
  getRecruitmentJob,
  logRecruitAudit,
} from "@/lib/recruit/server";
import type { ReviewStatus } from "@/lib/recruit/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; candidateId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id: jobId, candidateId } = await context.params;

  const candidate = await getCandidateWithDetails(auth.supabase, candidateId);
  if (!candidate || candidate.job_id !== jobId) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const originalScore = candidate.score?.match_score ?? null;

  if (typeof body.overridden_score === "number") {
    const overridden = Math.min(100, Math.max(0, body.overridden_score));
    await auth.supabase
      .from("recruitment_candidate_scores")
      .update({
        overridden_score: overridden,
        updated_at: new Date().toISOString(),
      })
      .eq("candidate_id", candidateId);

    await logRecruitAudit(auth.supabase, {
      jobId,
      candidateId,
      actorUserId: auth.user.id,
      action: "score_overridden",
      details: { original_score: originalScore, overridden_score: overridden },
    });
  }

  const reviewStatus =
    typeof body.review_status === "string"
      ? (body.review_status as ReviewStatus)
      : undefined;

  const reviewUpdates: Record<string, unknown> = {
    reviewer_user_id: auth.user.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.recruiter_notes === "string") {
    reviewUpdates.recruiter_notes = body.recruiter_notes;
  }
  if (typeof body.edited_summary === "string") {
    reviewUpdates.edited_summary = body.edited_summary;
  }
  if (reviewStatus) {
    reviewUpdates.review_status = reviewStatus;
  }

  await auth.supabase.from("recruitment_reviews").upsert(
    {
      candidate_id: candidateId,
      ...reviewUpdates,
    },
    { onConflict: "candidate_id,reviewer_user_id" }
  );

  if (reviewStatus) {
    await auth.supabase
      .from("recruitment_candidates")
      .update({
        review_status: reviewStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidateId);

    if (reviewStatus === "shortlisted") {
      const { data: existing } = await auth.supabase
        .from("recruitment_shortlists")
        .select("rank")
        .eq("job_id", jobId)
        .order("rank", { ascending: false })
        .limit(1);

      const nextRank = (existing?.[0]?.rank ?? 0) + 1;
      await auth.supabase.from("recruitment_shortlists").upsert(
        {
          job_id: jobId,
          candidate_id: candidateId,
          rank: nextRank,
          added_by: auth.user.id,
        },
        { onConflict: "job_id,candidate_id" }
      );
    }
  }

  const updated = await getCandidateWithDetails(auth.supabase, candidateId);
  return NextResponse.json({ candidate: updated });
}
