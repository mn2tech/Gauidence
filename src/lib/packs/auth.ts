import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isGuardianPackEngineEnabled,
  packEngineBlockedResponse,
} from "@/lib/features/packs";
import {
  requireAccessibleGuardianProfile,
  requireOwnedGuardianProfile,
} from "@/lib/profiles/server";
import { isOrgStyleProfile, type GuardianProfile } from "@/lib/profiles/types";

export type PackAuthed = {
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  user: { id: string; email?: string | null };
};

export async function requirePackUser(): Promise<PackAuthed | NextResponse> {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
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

  if (!isGuardianPackEngineEnabled({ email: user.email })) {
    return packEngineBlockedResponse();
  }

  return { supabase, user };
}

export function isPackAuthed(
  value: PackAuthed | NextResponse
): value is PackAuthed {
  return "supabase" in value;
}

export async function requirePackSpaceAccess(
  supabase: PackAuthed["supabase"],
  userId: string,
  profileId: string
) {
  return requireAccessibleGuardianProfile(supabase, userId, profileId);
}

export async function requirePackSpaceManage(
  supabase: PackAuthed["supabase"],
  userId: string,
  profileId: string
) {
  return requireOwnedGuardianProfile(supabase, userId, profileId);
}

/** Packs install onto business/nonprofit Spaces only. */
export function assertPackInstallableProfile(
  profile: GuardianProfile
): string | null {
  if (!isOrgStyleProfile(profile.profile_type)) {
    return "Packs can only be installed on a business or nonprofit Space.";
  }
  return null;
}
