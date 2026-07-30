import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAccessibleGuardianProfile } from "@/lib/profiles/server";
import { notifyClientRequestActivity } from "@/lib/client-requests/notify";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

const COMMENT_SELECT =
  "id, request_id, author_user_id, content, created_at";

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

async function loadRequest(
  supabase: SupabaseClient,
  userId: string,
  requestId: string
) {
  const { data: request, error } = await supabase
    .from("client_requests")
    .select("id, profile_id, title")
    .eq("id", requestId)
    .maybeSingle();

  if (error || !request) return null;

  const profile = await requireAccessibleGuardianProfile(
    supabase,
    userId,
    String(request.profile_id)
  );
  if (!profile) return null;

  return request;
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  const request = await loadRequest(supabase, user.id, id);
  if (!request) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("client_request_comments")
    .select(COMMENT_SELECT)
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Couldn't load comments." },
      { status: 502 }
    );
  }

  const authorIds = [
    ...new Set((data ?? []).map((row) => String(row.author_user_id))),
  ];
  const authorNames = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", authorIds);
    for (const row of profiles ?? []) {
      const name =
        (row.full_name as string | null)?.trim() ||
        (row.email as string | null)?.split("@")[0] ||
        "Someone";
      authorNames.set(String(row.id), name);
    }
  }

  const comments = (data ?? []).map((row) => ({
    ...row,
    author_name: authorNames.get(String(row.author_user_id)) ?? "Someone",
  }));

  return NextResponse.json({ comments });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await context.params;

  let body: { content?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json(
      { error: "Message is required." },
      { status: 400 }
    );
  }

  const requestRow = await loadRequest(supabase, user.id, id);
  if (!requestRow) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("client_request_comments")
    .insert({
      request_id: id,
      author_user_id: user.id,
      content,
    })
    .select(COMMENT_SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't send message." },
      { status: 502 }
    );
  }

  void notifyClientRequestActivity(supabase, {
    profileId: String(requestRow.profile_id),
    actorUserId: user.id,
    requestId: id,
    requestTitle: String(requestRow.title),
    preview: content,
    kind: "comment",
  });

  return NextResponse.json({ comment: data });
}
