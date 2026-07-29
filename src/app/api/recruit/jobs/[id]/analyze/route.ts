import { NextResponse } from "next/server";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import {
  getRecruitmentJob,
  listCandidates,
  logRecruitAudit,
} from "@/lib/recruit/server";
import { processCandidateResume } from "@/lib/recruit/process";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id: jobId } = await context.params;

  const job = await getRecruitmentJob(auth.supabase, jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let candidateIds: string[] | undefined;
  try {
    const body = await request.json();
    if (Array.isArray(body.candidateIds)) {
      candidateIds = body.candidateIds.filter(
        (cid: unknown): cid is string => typeof cid === "string"
      );
    }
  } catch {
    // analyze all pending
  }

  const candidates = await listCandidates(auth.supabase, jobId);
  const toProcess = candidates.filter((c) => {
    if (candidateIds && !candidateIds.includes(c.id)) return false;
    return (
      c.processing_status === "pending" ||
      c.processing_status === "extracted" ||
      c.processing_status === "failed"
    );
  });

  if (toProcess.length === 0) {
    return NextResponse.json(
      { error: "No candidates ready for analysis." },
      { status: 400 }
    );
  }

  await auth.supabase
    .from("recruitment_jobs")
    .update({
      current_step: "analyze",
      status: "analyzing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  const results: { candidateId: string; ok: boolean; error?: string }[] = [];

  for (const candidate of toProcess) {
    const result = await processCandidateResume(auth.supabase, {
      candidateId: candidate.id,
      jobId,
      actorUserId: auth.user.id,
    });
    results.push({
      candidateId: candidate.id,
      ok: result.ok,
      error: result.error,
    });
  }

  const successCount = results.filter((r) => r.ok).length;

  await auth.supabase
    .from("recruitment_jobs")
    .update({
      current_step: "review",
      status: "reviewing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  await logRecruitAudit(auth.supabase, {
    jobId,
    actorUserId: auth.user.id,
    action: "batch_analyzed",
    details: { total: toProcess.length, success: successCount },
  });

  return NextResponse.json({ results, successCount, total: toProcess.length });
}
