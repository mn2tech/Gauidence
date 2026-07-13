import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedGuardianProfile } from "@/lib/profiles/server";
import { isValidLogDate } from "@/lib/logs/types";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };
type Ctx = { params: Promise<{ id: string }> };

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

const SELECT =
  "id, owner_user_id, profile_id, log_date, title, content, category, tags, source_type, created_at, updated_at";

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  const { data: existing } = await supabase
    .from("daily_logs")
    .select("id, profile_id")
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Log not found." }, { status: 404 });
  }
  const owned = await requireOwnedGuardianProfile(
    supabase,
    user.id,
    existing.profile_id
  );
  if (!owned) {
    return NextResponse.json({ error: "Log not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.content === "string") {
    const content = body.content.trim();
    if (!content) {
      return NextResponse.json(
        { error: "Log content can't be empty." },
        { status: 400 }
      );
    }
    patch.content = content.slice(0, 8000);
  }
  if (body.title !== undefined) {
    patch.title =
      typeof body.title === "string" ? body.title.trim() || null : null;
  }
  if (body.category !== undefined) {
    patch.category =
      typeof body.category === "string" ? body.category.trim() || null : null;
  }
  if (isValidLogDate(body.logDate)) {
    patch.log_date = body.logDate;
  }
  if (Array.isArray(body.tags)) {
    patch.tags = body.tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .update(patch)
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .select(SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't update Daily Log." },
      { status: 502 }
    );
  }
  return NextResponse.json({ log: data });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  const { error } = await supabase
    .from("daily_logs")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Couldn't delete Daily Log." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
