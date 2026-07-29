import { NextResponse } from "next/server";
import { requireEditableGuardianProfile } from "@/lib/profiles/server";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import {
  ensureJobRequirements,
  listRecruitmentJobs,
} from "@/lib/recruit/server";
import { JOB_SELECT, type RecruitmentJob } from "@/lib/recruit/types";
import { parseJobFields } from "@/lib/recruit/validators";
import { recruitDbErrorMessage } from "@/lib/recruit/errors";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId") ?? undefined;
  const jobs = await listRecruitmentJobs(auth.supabase, profileId);
  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const profileId =
    typeof body.profile_id === "string" ? body.profile_id.trim() : "";
  if (!profileId) {
    return NextResponse.json(
      { error: "Select a business vault for this job." },
      { status: 400 }
    );
  }

  const profile = await requireEditableGuardianProfile(
    supabase,
    user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }
  if (!isOrgStyleProfile(profile.profile_type)) {
    return NextResponse.json(
      { error: "Recruit jobs must be created in a business or nonprofit vault." },
      { status: 400 }
    );
  }

  const fields = parseJobFields(body);
  if (!fields.title) {
    return NextResponse.json(
      { error: "Enter a job title (2–200 characters)." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("recruitment_jobs")
    .insert({
      profile_id: profileId,
      owner_user_id: user.id,
      title: fields.title,
      department: fields.department,
      hiring_manager: fields.hiring_manager,
      job_description: fields.job_description,
      required_skills: fields.required_skills,
      preferred_skills: fields.preferred_skills,
      min_years_experience: fields.min_years_experience,
      required_education: fields.required_education,
      required_certifications: fields.required_certifications,
      location: fields.location,
      work_mode: fields.work_mode,
      employment_type: fields.employment_type,
      work_authorization_requirement: fields.work_authorization_requirement,
      salary_range: fields.salary_range,
      shortlist_count: fields.shortlist_count,
      status: "draft",
      current_step: "create_job",
      updated_at: now,
    })
    .select(JOB_SELECT)
    .single();

  if (error || !data) {
    if (error) {
      console.error("createRecruitmentJob:", error.message, error.code, error.details);
    }
    return NextResponse.json(
      {
        error: error
          ? recruitDbErrorMessage(error, "Couldn't create job.")
          : "Couldn't create job.",
      },
      { status: 502 }
    );
  }

  await ensureJobRequirements(supabase, data.id);

  return NextResponse.json({ job: data as RecruitmentJob }, { status: 201 });
}
