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
  isValidInviteEmail,
  normalizeInviteEmail,
} from "@/lib/profiles/invitations";
import { sendVaultInviteEmail } from "@/lib/email";

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

/** List members + pending invitations for a vault (owner only). */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: profileId } = await ctx.params;

  const owned = await requireOwnedGuardianProfile(supabase, user.id, profileId);
  if (!owned) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }
  if (!canShareGuardianProfile(owned)) {
    return NextResponse.json(
      { error: "Only business and client vaults can have collaborators." },
      { status: 400 }
    );
  }

  const [{ data: members }, { data: invitations }] = await Promise.all([
    supabase
      .from("guardian_profile_members")
      .select("user_id, role, invited_by, created_at")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: true }),
    supabase
      .from("guardian_profile_invitations")
      .select(
        "id, invited_email_normalized, role, expires_at, accepted_at, revoked_at, created_at"
      )
      .eq("profile_id", profileId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const memberIds = (members ?? []).map((m) => m.user_id as string);
  const { data: profiles } =
    memberIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", memberIds)
      : { data: [] as { id: string; email: string | null; full_name: string | null }[] };

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p] as const)
  );

  return NextResponse.json({
    profile: owned,
    members: (members ?? []).map((m) => {
      const account = profileById.get(m.user_id as string);
      return {
        userId: m.user_id,
        role: m.role,
        invitedBy: m.invited_by,
        createdAt: m.created_at,
        email: account?.email ?? null,
        fullName: account?.full_name ?? null,
        isYou: m.user_id === user.id,
      };
    }),
    invitations: (invitations ?? []).map((inv) => ({
      id: inv.id,
      email: inv.invited_email_normalized,
      role: inv.role,
      expiresAt: inv.expires_at,
      createdAt: inv.created_at,
    })),
  });
}

/** Invite an Editor by email (owner only). */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: profileId } = await ctx.params;

  const owned = await requireOwnedGuardianProfile(supabase, user.id, profileId);
  if (!owned) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }
  if (!canShareGuardianProfile(owned)) {
    return NextResponse.json(
      { error: "Only business and client vaults can have collaborators." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const emailRaw = typeof body.email === "string" ? body.email : "";
  if (!isValidInviteEmail(emailRaw)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }
  const email = normalizeInviteEmail(emailRaw);
  if (user.email && normalizeInviteEmail(user.email) === email) {
    return NextResponse.json(
      { error: "You already own this vault." },
      { status: 400 }
    );
  }

  // If already a member, say so without revealing other accounts unnecessarily.
  const { data: existingAccount } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existingAccount?.id) {
    const { data: existingMember } = await supabase
      .from("guardian_profile_members")
      .select("user_id")
      .eq("profile_id", profileId)
      .eq("user_id", existingAccount.id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json(
        { error: "That person already has access to this vault." },
        { status: 409 }
      );
    }
  }

  // Revoke any previous pending invite for this email on this vault
  await supabase
    .from("guardian_profile_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .eq("invited_email_normalized", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = createInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = inviteExpiresAt();

  const { data: invitation, error } = await supabase
    .from("guardian_profile_invitations")
    .insert({
      profile_id: profileId,
      invited_email_normalized: email,
      role: "editor",
      token_hash: tokenHash,
      invited_by_user_id: user.id,
      expires_at: expiresAt,
    })
    .select("id, invited_email_normalized, expires_at, created_at")
    .single();

  if (error || !invitation) {
    console.error("Invite insert failed:", error?.message);
    return NextResponse.json(
      {
        error:
          "Couldn't create the invitation. Run migration 0024 in Supabase if you haven't yet.",
      },
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
    to: email,
    vaultName: owned.display_name,
    inviterName,
    acceptUrl,
  });

  return NextResponse.json({
    invitation: {
      id: invitation.id,
      email: invitation.invited_email_normalized,
      expiresAt: invitation.expires_at,
      createdAt: invitation.created_at,
    },
    emailed,
    // Always return the link so the owner can copy it if email delivery fails.
    acceptUrl,
  });
}
