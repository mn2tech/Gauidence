import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAccessibleGuardianProfile } from "@/lib/profiles/server";
import { notifyClientRequestActivity } from "@/lib/client-requests/notify";
import { isClientRequestStatus } from "@/lib/client-requests/types";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

const REQUEST_SELECT =
  "id, profile_id, created_by, title, description, status, document_id, created_at, updated_at, resolved_at";

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

  let body: { status?: string };
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

  const profile = await requireAccessibleGuardianProfile(
    supabase,
    user.id,
    String(existing.profile_id)
  );
  if (!profile) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const status = body.status?.trim();
  if (!status || !isClientRequestStatus(status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_requests")
    .update({ status })
    .eq("id", id)
    .select(REQUEST_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't update request." },
      { status: 502 }
    );
  }

  if (existing.status !== status) {
    void notifyClientRequestActivity(supabase, {
      profileId: String(existing.profile_id),
      actorUserId: user.id,
      requestId: id,
      requestTitle: String(existing.title),
      preview: `Status changed to ${status.replace("_", " ")}.`,
      kind: "status",
    });
  }

  return NextResponse.json({ request: data });
}
