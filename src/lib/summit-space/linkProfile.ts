import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUMMIT_SLUG } from "./constants";

/**
 * Link a Guardian profile to a summit space for owner admin features.
 */
export async function linkSummitToProfile(
  supabase: SupabaseClient,
  summitSlug: string,
  profileId: string,
  ownerUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: profile } = await supabase
    .from("guardian_profiles")
    .select("owner_user_id, profile_type")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile || profile.owner_user_id !== ownerUserId) {
    return { ok: false, error: "Not authorized for this profile" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Guardian is not configured" };
  }

  const { error: profileError } = await admin
    .from("guardian_profiles")
    .update({
      public_slug: summitSlug,
      is_public: true,
      public_subtitle: "Small Business Contracting Intelligence Hub",
      public_owner_label: "NM2TECH LLC",
      display_name: "2026 Small Business Government Contracting Summit",
      profile_type: "event",
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  const { error: spaceError } = await admin
    .from("summit_spaces")
    .update({ profile_id: profileId, updated_at: new Date().toISOString() })
    .eq("slug", summitSlug);

  if (spaceError) {
    return { ok: false, error: spaceError.message };
  }

  return { ok: true };
}

export async function isSummitOwner(
  supabase: SupabaseClient,
  summitSlug: string,
  userId: string
): Promise<boolean> {
  const { data: space } = await supabase
    .from("summit_spaces")
    .select("profile_id")
    .eq("slug", summitSlug)
    .maybeSingle();

  if (!space?.profile_id) return false;

  const { data: profile } = await supabase
    .from("guardian_profiles")
    .select("owner_user_id")
    .eq("id", space.profile_id)
    .maybeSingle();

  return profile?.owner_user_id === userId;
}

export { SUMMIT_SLUG };
