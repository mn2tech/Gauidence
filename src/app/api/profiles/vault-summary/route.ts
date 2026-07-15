import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveGuardianProfile,
  requireOwnedGuardianProfile,
} from "@/lib/profiles/server";

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

/** Lightweight doc + log counts for the active (or requested) profile. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  let profileId = url.searchParams.get("profileId");
  if (!profileId) {
    const active = await getActiveGuardianProfile(supabase, user);
    if (!active) {
      return NextResponse.json({
        profileId: null,
        documentCount: 0,
        logCount: 0,
        empty: true,
      });
    }
    profileId = active.id;
  } else {
    const owned = await requireOwnedGuardianProfile(
      supabase,
      user.id,
      profileId
    );
    if (!owned) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }
  }

  const [{ count: documentCount }, { count: logCount }] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("profile_id", profileId),
    supabase
      .from("daily_logs")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id)
      .eq("profile_id", profileId),
  ]);

  const docs = documentCount ?? 0;
  const logs = logCount ?? 0;

  return NextResponse.json({
    profileId,
    documentCount: docs,
    logCount: logs,
    empty: docs === 0 && logs === 0,
  });
}
