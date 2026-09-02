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

  // Only one profile may claim a summit public slug.
  const { error: clearSlugError } = await admin
    .from("guardian_profiles")
    .update({ public_slug: null, updated_at: new Date().toISOString() })
    .eq("public_slug", summitSlug)
    .neq("id", profileId);

  if (clearSlugError) {
    return { ok: false, error: clearSlugError.message };
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

/**
 * Repair a partial link where the profile already has the summit slug but
 * summit_spaces.profile_id was never set.
 */
export async function repairSummitProfileLink(
  summitSlug: string,
  ownerUserId: string
): Promise<{ ok: boolean; profileId?: string; error?: string }> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "Guardian is not configured" };
  }

  const { data: profile } = await admin
    .from("guardian_profiles")
    .select("id")
    .eq("public_slug", summitSlug)
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (!profile) {
    return { ok: false };
  }

  const { error: spaceError } = await admin
    .from("summit_spaces")
    .update({
      profile_id: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", summitSlug);

  if (spaceError) {
    return { ok: false, error: spaceError.message };
  }

  return { ok: true, profileId: profile.id };
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
