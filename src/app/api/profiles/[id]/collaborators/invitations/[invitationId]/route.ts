import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedGuardianProfile } from "@/lib/profiles/server";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };
type Ctx = { params: Promise<{ id: string; invitationId: string }> };

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

/** Revoke a pending invitation. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: profileId, invitationId } = await ctx.params;

  const owned = await requireOwnedGuardianProfile(supabase, user.id, profileId);
  if (!owned) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("guardian_profile_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("profile_id", profileId)
    .is("accepted_at", null);

  if (error) {
    return NextResponse.json(
      { error: "Couldn't revoke that invitation." },
      { status: 502 }
    );
  }
  return NextResponse.json({ ok: true });
}
