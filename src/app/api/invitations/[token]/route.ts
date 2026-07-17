import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hashInviteToken,
  normalizeInviteEmail,
} from "@/lib/profiles/invitations";
import { setActiveGuardianProfile } from "@/lib/profiles/server";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };
type Ctx = { params: Promise<{ token: string }> };

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

/** Peek invitation (auth optional) — returns vault name without consuming. */
export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (!token) {
    return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Invitations aren't available on this deployment." },
      { status: 503 }
    );
  }

  const tokenHash = hashInviteToken(token);
  const { data: invite } = await admin
    .from("guardian_profile_invitations")
    .select(
      "id, profile_id, invited_email_normalized, role, expires_at, accepted_at, revoked_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invite || invite.revoked_at || invite.accepted_at) {
    return NextResponse.json(
      { error: "This invitation is invalid or has already been used." },
      { status: 404 }
    );
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This invitation has expired." },
      { status: 410 }
    );
  }

  const { data: profile } = await admin
    .from("guardian_profiles")
    .select("id, display_name, profile_type")
    .eq("id", invite.profile_id)
    .maybeSingle();

  return NextResponse.json({
    email: invite.invited_email_normalized,
    role: invite.role,
    expiresAt: invite.expires_at,
    vaultName: profile?.display_name ?? "Shared vault",
    profileType: profile?.profile_type ?? "business",
    profileId: invite.profile_id,
  });
}

/** Accept invitation — requires signed-in user whose email matches. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { token } = await ctx.params;

  if (!user.email) {
    return NextResponse.json(
      { error: "Your account needs a verified email to accept invitations." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Invitations aren't available on this deployment." },
      { status: 503 }
    );
  }

  const tokenHash = hashInviteToken(token);
  const { data: invite } = await admin
    .from("guardian_profile_invitations")
    .select(
      "id, profile_id, invited_email_normalized, role, expires_at, accepted_at, revoked_at, invited_by_user_id"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!invite || invite.revoked_at || invite.accepted_at) {
    return NextResponse.json(
      { error: "This invitation is invalid or has already been used." },
      { status: 404 }
    );
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This invitation has expired. Ask the owner to send a new one." },
      { status: 410 }
    );
  }

  const userEmail = normalizeInviteEmail(user.email);
  if (userEmail !== invite.invited_email_normalized) {
    return NextResponse.json(
      {
        error: `Sign in with ${invite.invited_email_normalized} to accept this invitation.`,
        code: "email_mismatch",
      },
      { status: 403 }
    );
  }

  const { error: memberError } = await admin
    .from("guardian_profile_members")
    .upsert(
      {
        profile_id: invite.profile_id,
        user_id: user.id,
        role: "editor",
        invited_by: invite.invited_by_user_id,
      },
      { onConflict: "profile_id,user_id" }
    );

  if (memberError) {
    console.error("Accept invite membership failed:", memberError.message);
    return NextResponse.json(
      { error: "Couldn't join this vault. Please try again." },
      { status: 502 }
    );
  }

  await admin
    .from("guardian_profile_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  await setActiveGuardianProfile(supabase, user.id, invite.profile_id);

  return NextResponse.json({
    ok: true,
    profileId: invite.profile_id,
  });
}
