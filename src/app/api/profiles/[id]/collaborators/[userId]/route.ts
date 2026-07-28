import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedGuardianProfile } from "@/lib/profiles/server";
import { parseCollaboratorInviteRole } from "@/lib/profiles/types";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };
type Ctx = { params: Promise<{ id: string; userId: string }> };

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

/** Update a collaborator's access level (owner only). */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: profileId, userId: memberUserId } = await ctx.params;

  const owned = await requireOwnedGuardianProfile(supabase, user.id, profileId);
  if (!owned) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const role = parseCollaboratorInviteRole(body.role);

  const { data: membership, error } = await supabase
    .from("guardian_profile_members")
    .update({ role })
    .eq("profile_id", profileId)
    .eq("user_id", memberUserId)
    .in("role", ["editor", "viewer"])
    .select("user_id, role")
    .maybeSingle();

  if (error || !membership) {
    return NextResponse.json(
      { error: "Couldn't update that collaborator." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, role: membership.role });
}

/** Remove a collaborator (owner), or leave the vault (self). */
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const { id: profileId, userId: memberUserIdParam } = await ctx.params;
  const memberUserId =
    memberUserIdParam === "me" ? user.id : memberUserIdParam;

  const { data: membership } = await supabase
    .from("guardian_profile_members")
    .select("user_id, role")
    .eq("profile_id", profileId)
    .eq("user_id", memberUserId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  if (membership.role === "owner") {
    return NextResponse.json(
      { error: "The vault owner can't be removed." },
      { status: 400 }
    );
  }

  const isSelf = memberUserId === user.id;
  if (!isSelf) {
    const owned = await requireOwnedGuardianProfile(
      supabase,
      user.id,
      profileId
    );
    if (!owned) {
      return NextResponse.json({ error: "Vault not found." }, { status: 404 });
    }
  }

  const { error } = await supabase
    .from("guardian_profile_members")
    .delete()
    .eq("profile_id", profileId)
    .eq("user_id", memberUserId)
    .in("role", ["editor", "viewer"]);

  if (error) {
    return NextResponse.json(
      { error: "Couldn't remove that collaborator." },
      { status: 502 }
    );
  }

  if (isSelf) {
    await supabase
      .from("profiles")
      .update({ active_guardian_profile_id: null })
      .eq("id", user.id)
      .eq("active_guardian_profile_id", profileId);
  }

  return NextResponse.json({ ok: true });
}
