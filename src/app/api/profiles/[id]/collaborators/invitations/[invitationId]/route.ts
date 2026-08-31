import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedGuardianProfile } from "@/lib/profiles/server";
import { canShareGuardianProfile } from "@/lib/profiles/types";
import {
  createInviteToken,
  hashInviteToken,
  inviteAcceptUrl,
  inviteExpiresAt,
} from "@/lib/profiles/invitations";
import { sendVaultInviteEmail } from "@/lib/email";

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

/** Resend a pending invitation with a fresh link. */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: profileId, invitationId } = await ctx.params;

  const owned = await requireOwnedGuardianProfile(supabase, user.id, profileId);
  if (!owned) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }
  if (!canShareGuardianProfile(owned)) {
    return NextResponse.json(
      { error: "This vault can't be shared with collaborators." },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("guardian_profile_invitations")
    .select("id, invited_email_normalized, role")
    .eq("id", invitationId)
    .eq("profile_id", profileId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json(
      { error: "That invitation is no longer pending." },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();
  await supabase
    .from("guardian_profile_invitations")
    .update({ revoked_at: now })
    .eq("id", existing.id);

  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = inviteExpiresAt();

  const { data: invitation, error } = await supabase
    .from("guardian_profile_invitations")
    .insert({
      profile_id: profileId,
      invited_email_normalized: existing.invited_email_normalized,
      role: existing.role,
      token_hash: tokenHash,
      invited_by_user_id: user.id,
      expires_at: expiresAt,
    })
    .select("id, invited_email_normalized, role, expires_at, created_at")
    .single();

  if (error || !invitation) {
    console.error("Invite resend insert failed:", error?.message);
    return NextResponse.json(
      { error: "Couldn't create a new invitation link." },
      { status: 502 }
    );
  }

  const acceptUrl = inviteAcceptUrl(token);
  const inviterName =
    (typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name.trim()) ||
    user.email?.split("@")[0] ||
    "A Guardian user";

  const emailed = await sendVaultInviteEmail({
    to: invitation.invited_email_normalized,
    vaultName: owned.display_name,
    inviterName,
    acceptUrl,
    accessRole: invitation.role === "viewer" ? "viewer" : "editor",
  });

  return NextResponse.json({
    ok: true,
    emailed,
    acceptUrl,
    invitation: {
      id: invitation.id,
      email: invitation.invited_email_normalized,
      role: invitation.role,
      expiresAt: invitation.expires_at,
      createdAt: invitation.created_at,
    },
  });
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
