import { NextResponse } from "next/server";
import { requireEditableGuardianProfile } from "@/lib/profiles/server";
import {
  getWorkProject,
  listWorkSessions,
} from "@/lib/work-memory/server";
import {
  isAuthed,
  requireWorkMemoryUser,
} from "@/lib/work-memory/auth";
import {
  WORK_PROJECT_SELECT,
  type WorkProject,
} from "@/lib/work-memory/types";
import { parseProjectFields } from "@/lib/work-memory/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** Get project detail and recent sessions. */
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireWorkMemoryUser();
  if (!isAuthed(auth)) return auth;
  const { id } = await context.params;

  const project = await getWorkProject(auth.supabase, auth.user.id, id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const sessions = await listWorkSessions(auth.supabase, auth.user.id, id, 10);
  return NextResponse.json({ project, sessions });
}

/** Update project fields or archive. */
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireWorkMemoryUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  const existing = await getWorkProject(supabase, user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fields = parseProjectFields(body);
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim().slice(0, 120);
  }
  if (fields.status) updates.status = fields.status;
  if (body.mission !== undefined) updates.mission = fields.mission;
  if (body.currentStep !== undefined || body.current_step !== undefined) {
    updates.current_step = fields.current_step;
  }
  if (body.nextAction !== undefined || body.next_action !== undefined) {
    updates.next_action = fields.next_action;
  }
  if (body.blockers !== undefined) updates.blockers = fields.blockers;
  if (fields.estimated_resume_minutes != null) {
    updates.estimated_resume_minutes = fields.estimated_resume_minutes;
  }
  if (body.profileId !== undefined || body.profile_id !== undefined) {
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
    updates.profile_id = fields.profile_id ?? null;
  }
  if (body.touchOpened === true) {
    const now = new Date().toISOString();
    updates.last_opened_at = now;
    updates.last_activity_at = now;
  }

  const { data, error } = await supabase
    .from("work_projects")
    .update(updates)
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .select(WORK_PROJECT_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't update project." },
      { status: 502 }
    );
  }

  return NextResponse.json({ project: data as WorkProject });
}

/** Archive project (soft delete). */
export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireWorkMemoryUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  const existing = await getWorkProject(supabase, user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("work_projects")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .select(WORK_PROJECT_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't archive project." },
      { status: 502 }
    );
  }

  return NextResponse.json({ project: data as WorkProject });
}
