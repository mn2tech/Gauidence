import { NextResponse } from "next/server";
import { getWorkProject } from "@/lib/work-memory/server";
import {
  isAuthed,
  requireWorkMemoryUser,
} from "@/lib/work-memory/auth";
import {
  WORK_PROJECT_SELECT,
  WORK_SESSION_SELECT,
  type WorkProject,
  type WorkSession,
} from "@/lib/work-memory/types";
import { parseSessionFields } from "@/lib/work-memory/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** End a work session and update project state. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireWorkMemoryUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  const project = await getWorkProject(supabase, user.id, id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fields = parseSessionFields(body);
  const now = new Date().toISOString();

  const { data: session, error: sessionError } = await supabase
    .from("work_sessions")
    .insert({
      project_id: id,
      owner_user_id: user.id,
      ended_at: now,
      accomplished: fields.accomplished,
      next_step: fields.next_step,
      blockers: fields.blockers,
      notes: fields.notes,
    })
    .select(WORK_SESSION_SELECT)
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { error: "Couldn't save session." },
      { status: 502 }
    );
  }

  const projectUpdates: Record<string, unknown> = {
    last_activity_at: now,
    updated_at: now,
    resume_context: {
      path: `/ask?projectId=${id}${project.profile_id ? `&profileId=${project.profile_id}` : ""}`,
    },
  };

  if (fields.mission !== undefined) projectUpdates.mission = fields.mission;
  if (fields.current_step !== undefined) {
    projectUpdates.current_step = fields.current_step;
  }
  if (fields.next_step) projectUpdates.next_action = fields.next_step;
  else if (fields.next_action !== undefined) {
    projectUpdates.next_action = fields.next_action;
  }
  if (fields.blockers !== undefined) projectUpdates.blockers = fields.blockers;
  if (fields.status) projectUpdates.status = fields.status;

  const { data: updatedProject, error: projectError } = await supabase
    .from("work_projects")
    .update(projectUpdates)
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .select(WORK_PROJECT_SELECT)
    .single();

  if (projectError || !updatedProject) {
    return NextResponse.json(
      { error: "Session saved but project update failed." },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      session: session as WorkSession,
      project: updatedProject as WorkProject,
    },
    { status: 201 }
  );
}
