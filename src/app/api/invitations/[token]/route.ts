import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hashInviteToken,
  normalizeInviteEmail,
} from "@/lib/profiles/invitations";
import { setActiveGuardianProfile } from "@/lib/profiles/server";
import { inviteAcceptLandingPath } from "@/lib/routes";
import { canAccessSimpleHome } from "@/lib/features/simple-home";

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

  if (!invite) {
    return NextResponse.json(
      {
        error: "This invitation link isn't valid.",
        code: "invite_not_found",
        hint: "Ask the vault owner to open Collaborators and tap Resend invite for a fresh link.",
      },
      { status: 404 }
    );
  }

  if (invite.revoked_at || invite.accepted_at) {
    // Already used/revoked: if the signed-in user is already a member, send them in.
    const supabase = await createClient();
    const {
      data: { user },
    } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

    if (user) {
      const { data: membership } = await admin
        .from("guardian_profile_members")
        .select("role")
        .eq("profile_id", invite.profile_id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membership) {
        const { data: profile } = await admin
          .from("guardian_profiles")
          .select("display_name, profile_type, parent_profile_id")
          .eq("id", invite.profile_id)
          .maybeSingle();
        const profileType = profile?.profile_type ?? "business";
        return NextResponse.json({
          alreadyMember: true,
          vaultName: profile?.display_name ?? "Shared vault",
          profileId: invite.profile_id,
          profileType,
          redirectTo: inviteAcceptLandingPath({
            profileId: invite.profile_id,
            profileType,
            parentProfileId: profile?.parent_profile_id,
            role: membership.role as string,
            simpleHome: canAccessSimpleHome({ email: user.email }),
          }),
        });
      }
    }

    return NextResponse.json(
      {
        error: invite.accepted_at
          ? "This invitation was already used."
          : "This invitation was revoked.",
        code: invite.accepted_at ? "invite_used" : "invite_revoked",
        hint: "Ask the vault owner to Resend invite from Collaborators for a new link.",
      },
      { status: 404 }
    );
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      {
        error: "This invitation has expired.",
        code: "invite_expired",
        hint: "Ask the vault owner to Resend invite from Collaborators.",
      },
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
    // Idempotent: already accepted and still a member → open the vault.
    if (invite && (invite.accepted_at || invite.revoked_at) && user) {
      const { data: membership } = await admin
        .from("guardian_profile_members")
        .select("role")
        .eq("profile_id", invite.profile_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membership) {
        const { data: profile } = await admin
          .from("guardian_profiles")
          .select("profile_type, parent_profile_id")
          .eq("id", invite.profile_id)
          .maybeSingle();
        const profileType = profile?.profile_type ?? "business";
        await setActiveGuardianProfile(supabase, user.id, invite.profile_id);
        if (profileType === "family") {
          const { cascadeMembershipToFamilyChildren } = await import(
            "@/lib/profiles/cascadeMembership"
          );
          await cascadeMembershipToFamilyChildren(admin, {
            familyProfileId: invite.profile_id,
            userId: user.id,
            role: membership.role as string,
            invitedBy: invite.invited_by_user_id,
          });
        }
        return NextResponse.json({
          ok: true,
          alreadyMember: true,
          profileId: invite.profile_id,
          profileType,
          redirectTo: inviteAcceptLandingPath({
            profileId: invite.profile_id,
            profileType,
            parentProfileId: profile?.parent_profile_id,
            role: membership.role as string,
            simpleHome: canAccessSimpleHome({ email: user.email }),
          }),
        });
      }
    }
    return NextResponse.json(
      {
        error: "This invitation is invalid or has already been used.",
        hint: "Ask the vault owner to Resend invite from Collaborators.",
      },
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
        role: invite.role,
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

  const { data: profile } = await admin
    .from("guardian_profiles")
    .select("profile_type, parent_profile_id")
    .eq("id", invite.profile_id)
    .maybeSingle();

  const profileType = profile?.profile_type ?? "business";

  if (profileType === "family") {
    const { cascadeMembershipToFamilyChildren } = await import(
      "@/lib/profiles/cascadeMembership"
    );
    await cascadeMembershipToFamilyChildren(admin, {
      familyProfileId: invite.profile_id,
      userId: user.id,
      role: invite.role,
      invitedBy: invite.invited_by_user_id,
    });
  }

  await admin
    .from("guardian_profile_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  await setActiveGuardianProfile(supabase, user.id, invite.profile_id);

  // Invited collaborators shouldn't hit first-run intent capture.
  const now = new Date().toISOString();
  await supabase
    .from("profiles")
    .update({
      onboarding_completed_at: now,
      onboarding_skipped: false,
      onboarding_step: "completed",
      updated_at: now,
    })
    .eq("id", user.id)
    .is("onboarding_completed_at", null);

  return NextResponse.json({
    ok: true,
    profileId: invite.profile_id,
    profileType,
    redirectTo: inviteAcceptLandingPath({
      profileId: invite.profile_id,
      profileType,
      parentProfileId: profile?.parent_profile_id,
      role: invite.role,
      simpleHome: canAccessSimpleHome({ email: user.email }),
    }),
  });
}
