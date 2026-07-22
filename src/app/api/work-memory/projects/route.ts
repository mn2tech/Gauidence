import { NextResponse } from "next/server";
import { requireEditableGuardianProfile } from "@/lib/profiles/server";
import { listWorkProjects } from "@/lib/work-memory/server";
import {
  isAuthed,
  requireWorkMemoryUser,
} from "@/lib/work-memory/auth";
import {
  WORK_PROJECT_SELECT,
  type WorkProject,
} from "@/lib/work-memory/types";
import {
  parseProjectFields,
  parseProjectName,
} from "@/lib/work-memory/validators";

export const runtime = "nodejs";

/** List active work projects for the signed-in user. */
export async function GET() {
  const auth = await requireWorkMemoryUser();
  if (!isAuthed(auth)) return auth;
  const projects = await listWorkProjects(auth.supabase, auth.user.id);
  return NextResponse.json({ projects });
}

/** Create a work project. */
export async function POST(request: Request) {
  const auth = await requireWorkMemoryUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = parseProjectName(body.name);
  if (!name) {
    return NextResponse.json(
      { error: "Enter a name for this project." },
      { status: 400 }
    );
  }

  const fields = parseProjectFields(body);
  if (fields.profile_id) {
    const profile = await requireEditableGuardianProfile(
      supabase,
      user.id,
      fields.profile_id
    );
    if (!profile) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("work_projects")
    .insert({
      owner_user_id: user.id,
      name,
      status: fields.status ?? "in_progress",
      mission: fields.mission,
      current_step: fields.current_step,
      next_action: fields.next_action,
      blockers: fields.blockers,
      profile_id: fields.profile_id ?? null,
      estimated_resume_minutes: fields.estimated_resume_minutes,
      last_activity_at: now,
      updated_at: now,
    })
    .select(WORK_PROJECT_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't create project." },
      { status: 502 }
    );
  }

  return NextResponse.json({ project: data as WorkProject }, { status: 201 });
}
