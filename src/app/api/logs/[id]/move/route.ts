import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedGuardianProfile } from "@/lib/profiles/server";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };
type Ctx = { params: Promise<{ id: string }> };

const SELECT =
  "id, owner_user_id, profile_id, log_date, title, content, category, tags, source_type, created_at, updated_at";

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

/** Move a Daily Log to another vault (guardian profile) you own. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: logId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const targetProfileId =
    typeof body.targetProfileId === "string" ? body.targetProfileId.trim() : "";
  if (!targetProfileId) {
    return NextResponse.json(
      { error: "Choose which vault to move this into." },
      { status: 400 }
    );
  }

  const { data: log } = await supabase
    .from("daily_logs")
    .select("id, profile_id")
    .eq("id", logId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!log) {
    return NextResponse.json({ error: "Log not found." }, { status: 404 });
  }

  if (log.profile_id === targetProfileId) {
    return NextResponse.json(
      { error: "That log is already in this vault." },
      { status: 400 }
    );
  }

  const source = await requireOwnedGuardianProfile(
    supabase,
    user.id,
    log.profile_id
  );
  const target = await requireOwnedGuardianProfile(
    supabase,
    user.id,
    targetProfileId
  );
  if (!source || !target) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("daily_logs")
    .update({
      profile_id: targetProfileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", logId)
    .eq("owner_user_id", user.id)
    .select(SELECT)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Couldn't move Daily Log." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    log: data,
    profileId: targetProfileId,
    profileName: target.display_name,
  });
}
