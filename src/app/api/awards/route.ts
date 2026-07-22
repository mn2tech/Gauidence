import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AWARDS } from "@/lib/awards/definitions";
import { listUserAwards, refreshUserAwards } from "@/lib/awards/grant";

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

/** List earned awards and sync any missing milestones from vault activity. */
export async function GET() {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const newlyGranted = await refreshUserAwards(user.id, supabase);
  const earned = await listUserAwards(user.id);
  const earnedKeys = new Set(earned.map((row) => row.award_key));

  return NextResponse.json({
    earned,
    definitions: AWARDS,
    earnedCount: earned.length,
    totalCount: AWARDS.length,
    awards: AWARDS.map((definition) => ({
      ...definition,
      earned: earnedKeys.has(definition.key),
      earnedAt:
        earned.find((row) => row.award_key === definition.key)?.earned_at ??
        null,
    })),
    newlyGranted,
  });
}
