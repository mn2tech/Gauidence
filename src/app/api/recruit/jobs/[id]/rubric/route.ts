import { NextResponse } from "next/server";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import { getJobRequirements, getRecruitmentJob } from "@/lib/recruit/server";
import { parseRubricWeights } from "@/lib/recruit/rubric";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id } = await context.params;

  const rubric = await getJobRequirements(auth.supabase, id);
  if (!rubric) {
    return NextResponse.json({ error: "Rubric not found." }, { status: 404 });
  }

  return NextResponse.json({ rubric });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id } = await context.params;

  const job = await getRecruitmentJob(auth.supabase, id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const weights = parseRubricWeights(body);
  if (!weights) {
    return NextResponse.json(
      { error: "Rubric weights must total exactly 100." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("recruitment_job_requirements")
    .upsert(
      {
        job_id: id,
        ...weights,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_id" }
    )
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't update rubric." },
      { status: 502 }
    );
  }

  await auth.supabase
    .from("recruitment_jobs")
    .update({
      current_step: "configure_criteria",
      status: "configuring",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ rubric: data });
}
