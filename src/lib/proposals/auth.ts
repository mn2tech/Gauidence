import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveGuardianProfile,
  requireAccessibleGuardianProfile,
  requireEditableGuardianProfile,
} from "@/lib/profiles/server";
import { isOrgStyleProfile } from "@/lib/profiles/types";

export type ProposalAuthed = { supabase: SupabaseClient; user: User };

export async function requireProposalUser(): Promise<
  ProposalAuthed | NextResponse
> {
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

export function isProposalAuthed(
  value: ProposalAuthed | NextResponse
): value is ProposalAuthed {
  return !(value instanceof NextResponse);
}

export async function resolveBusinessProfile(
  supabase: SupabaseClient,
  user: User,
  profileId?: string | null
) {
  if (profileId) {
    const profile = await requireAccessibleGuardianProfile(
      supabase,
      user.id,
      profileId
    );
    if (!profile) return null;
    if (
      isOrgStyleProfile(profile.profile_type) &&
      profile.profile_type !== "client"
    ) {
      return profile;
    }
    if (profile.profile_type === "employee" && profile.parent_profile_id) {
      return requireAccessibleGuardianProfile(
        supabase,
        user.id,
        profile.parent_profile_id
      );
    }
    return null;
  }
  const active = await getActiveGuardianProfile(supabase, user);
  if (
    active &&
    isOrgStyleProfile(active.profile_type) &&
    active.profile_type !== "client"
  ) {
    return active;
  }
  return null;
}

export async function requireEditableBusinessProfile(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
) {
  const profile = await requireEditableGuardianProfile(
    supabase,
    userId,
    profileId
  );
  if (!profile) return null;
  if (
    !isOrgStyleProfile(profile.profile_type) ||
    profile.profile_type === "client"
  ) {
    return null;
  }
  return profile;
}
