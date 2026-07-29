import { NextResponse } from "next/server";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import {
  getRecruitmentJob,
  getJobRequirements,
  logRecruitAudit,
} from "@/lib/recruit/server";
import { JOB_SELECT, type RecruitmentJob } from "@/lib/recruit/types";
import { parseJobFields } from "@/lib/recruit/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id } = await context.params;

  const job = await getRecruitmentJob(auth.supabase, id);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const rubric = await getJobRequirements(auth.supabase, id);
  return NextResponse.json({ job, rubric });
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

  const fields = parseJobFields(body);
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (fields.title) updates.title = fields.title;
  if (body.department !== undefined) updates.department = fields.department;
  if (body.hiring_manager !== undefined)
    updates.hiring_manager = fields.hiring_manager;
  if (body.hiring_manager_email !== undefined)
    updates.hiring_manager_email = fields.hiring_manager_email;
  if (body.job_description !== undefined)
    updates.job_description = fields.job_description;
  if (body.required_skills !== undefined)
    updates.required_skills = fields.required_skills;
  if (body.preferred_skills !== undefined)
    updates.preferred_skills = fields.preferred_skills;
  if (body.min_years_experience !== undefined)
    updates.min_years_experience = fields.min_years_experience;
  if (body.required_education !== undefined)
    updates.required_education = fields.required_education;
  if (body.required_certifications !== undefined)
    updates.required_certifications = fields.required_certifications;
  if (body.location !== undefined) updates.location = fields.location;
  if (body.work_mode !== undefined) updates.work_mode = fields.work_mode;
  if (body.employment_type !== undefined)
    updates.employment_type = fields.employment_type;
  if (body.work_authorization_requirement !== undefined)
    updates.work_authorization_requirement =
      fields.work_authorization_requirement;
  if (body.salary_range !== undefined)
    updates.salary_range = fields.salary_range;
  if (body.shortlist_count !== undefined)
    updates.shortlist_count = fields.shortlist_count;
  if (fields.current_step) updates.current_step = fields.current_step;
  if (typeof body.status === "string") updates.status = body.status;

  const { data, error } = await auth.supabase
    .from("recruitment_jobs")
    .update(updates)
    .eq("id", id)
    .select(JOB_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Couldn't update job." }, { status: 502 });
  }

  return NextResponse.json({ job: data as RecruitmentJob });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id } = await context.params;

  const { error } = await auth.supabase
    .from("recruitment_jobs")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Couldn't delete job." }, { status: 502 });
  }

  await logRecruitAudit(auth.supabase, {
    jobId: id,
    actorUserId: auth.user.id,
    action: "job_deleted",
  });

  return NextResponse.json({ ok: true });
}
