import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuardianProfile } from "@/lib/profiles/types";
import { listGuardianProfiles } from "@/lib/profiles/server";

const UNORGANIZED_MARKER = "guardian:unorganized";

export async function getUnorganizedProfileId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: account } = await supabase
    .from("profiles")
    .select("unorganized_profile_id")
    .eq("id", userId)
    .maybeSingle();
  const cached = account?.unorganized_profile_id as string | null;
  if (cached) {
    const { data: profile } = await supabase
      .from("guardian_profiles")
      .select("id")
      .eq("id", cached)
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (profile?.id) return String(profile.id);
  }

  const { data: existing } = await supabase
    .from("guardian_profiles")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("display_name", "Unorganized")
    .eq("profile_type", "other")
    .maybeSingle();
  if (existing?.id) {
    await supabase
      .from("profiles")
      .update({ unorganized_profile_id: existing.id })
      .eq("id", userId);
    return String(existing.id);
  }

  const { data: created, error } = await supabase
    .from("guardian_profiles")
    .insert({
      owner_user_id: userId,
      profile_type: "other",
      display_name: "Unorganized",
      relationship: "Unorganized",
      description: UNORGANIZED_MARKER,
      is_default: false,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    console.error("Failed to create Unorganized profile:", error?.message);
    return null;
  }

  await supabase
    .from("profiles")
    .update({ unorganized_profile_id: created.id })
    .eq("id", userId);

  return String(created.id);
}

export function isUnorganizedProfile(profile: GuardianProfile): boolean {
  return (
    profile.profile_type === "other" &&
    profile.display_name === "Unorganized" &&
    (profile.description?.includes(UNORGANIZED_MARKER) ?? false)
  );
}

export async function listEditableProfiles(
  supabase: SupabaseClient,
  userId: string
): Promise<GuardianProfile[]> {
  const profiles = await listGuardianProfiles(supabase, userId);
  return profiles.filter(
    (p) => p.access_role === "owner" || p.access_role === "editor"
  );
}
