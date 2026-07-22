import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { refreshUserAwards } from "@/lib/awards/grant";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

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

/** Sync awards after a client-side document upload. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: { documentId?: unknown } = {};
  try {
    body = (await request.json()) as { documentId?: unknown };
  } catch {
    body = {};
  }

  if (typeof body.documentId === "string" && body.documentId.trim()) {
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", body.documentId.trim())
      .eq("user_id", user.id)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 }
      );
    }
  }

  const newlyGranted = await refreshUserAwards(user.id, supabase);
  return NextResponse.json({ ok: true, newlyGranted });
}
