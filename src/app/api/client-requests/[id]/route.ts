import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  requireAccessibleGuardianProfile,
  requireEditableGuardianProfile,
} from "@/lib/profiles/server";
import {
  isValidClientRequestAssignee,
} from "@/lib/client-requests/assignees";
import { notifyClientRequestActivity } from "@/lib/client-requests/notify";
import { isClientRequestStatus } from "@/lib/client-requests/types";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

const REQUEST_SELECT =
  "id, profile_id, created_by, title, description, status, document_id, assigned_to_user_id, created_at, updated_at, resolved_at";

async function requireUser(): Promise<Authed | NextResponse> {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to be signed in." },
      { status: 401 }
    );
  }
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase } = auth;
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("client_requests")
    .select(REQUEST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Couldn't load request." },
      { status: 502 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (data.assigned_to_user_id === auth.user.id) {
    return NextResponse.json({ request: data });
  }

  const profile = await requireAccessibleGuardianProfile(
    supabase,
    auth.user.id,
    String(data.profile_id)
  );
  if (!profile) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  return NextResponse.json({ request: data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  let body: { status?: string; assignedToUserId?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { data: existing, error: loadError } = await supabase
    .from("client_requests")
    .select(REQUEST_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (loadError || !existing) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const profile = await requireEditableGuardianProfile(
    supabase,
    user.id,
    String(existing.profile_id)
  );
  if (!profile) {
    return NextResponse.json(
      { error: "You can't update this request." },
      { status: 403 }
    );
  }

  const updates: Record<string, unknown> = {};
  const status = body.status?.trim();
  if (status) {
    if (!isClientRequestStatus(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    updates.status = status;
  }

  if (body.assignedToUserId !== undefined) {
    const assignee = body.assignedToUserId?.trim() || null;
    if (assignee) {
      const valid = await isValidClientRequestAssignee(
        supabase,
        String(existing.profile_id),
        assignee
      );
      if (!valid) {
        return NextResponse.json(
          { error: "Assignee must be an employee of this business." },
          { status: 400 }
        );
      }
    }
    updates.assigned_to_user_id = assignee;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_requests")
    .update(updates)
    .eq("id", id)
    .select(REQUEST_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't update request." },
      { status: 502 }
    );
  }

  const profileId = String(existing.profile_id);
  const requestTitle = String(existing.title);

  if (existing.status !== data.status) {
    void notifyClientRequestActivity(supabase, {
      profileId,
      actorUserId: user.id,
      requestId: id,
      requestTitle,
      preview: `Status changed to ${String(data.status).replace("_", " ")}.`,
      kind: "status",
    });
  }

  const prevAssignee = existing.assigned_to_user_id as string | null | undefined;
  const nextAssignee = data.assigned_to_user_id as string | null | undefined;
  if (prevAssignee !== nextAssignee && nextAssignee) {
    void notifyClientRequestActivity(supabase, {
      profileId,
      actorUserId: user.id,
      requestId: id,
      requestTitle,
      preview: "You were assigned this request.",
      kind: "assigned",
      notifyUserIds: [nextAssignee],
    });
  }

  return NextResponse.json({ request: data });
}
