import { NextResponse } from "next/server";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import { getRecruitmentJob } from "@/lib/recruit/server";
import { processCandidateResume } from "@/lib/recruit/process";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string; candidateId: string }> };

/** Analyze a single candidate resume (extraction + scoring). */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id: jobId, candidateId } = await context.params;

  const job = await getRecruitmentJob(auth.supabase, jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  await auth.supabase
    .from("recruitment_jobs")
    .update({
      status: "analyzing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  const result = await processCandidateResume(auth.supabase, {
    candidateId,
    jobId,
    actorUserId: auth.user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Analysis failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
