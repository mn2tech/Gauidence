import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  isGuardianProfileType,
  type GuardianProfile,
  type GuardianProfileType,
} from "./types";

const PROFILE_SELECT =
  "id, owner_user_id, profile_type, display_name, relationship, avatar_url, date_of_birth, school_name, grade_level, business_legal_name, industry, website, description, job_title, department, organization_name, is_default, created_at, updated_at";

function asProfile(row: Record<string, unknown>): GuardianProfile {
  const type = isGuardianProfileType(row.profile_type)
    ? row.profile_type
    : "other";
  return {
    id: String(row.id),
    owner_user_id: String(row.owner_user_id),
    profile_type: type,
    display_name: String(row.display_name ?? ""),
    relationship: (row.relationship as string | null) ?? null,
    avatar_url: (row.avatar_url as string | null) ?? null,
    date_of_birth: (row.date_of_birth as string | null) ?? null,
    school_name: (row.school_name as string | null) ?? null,
    grade_level: (row.grade_level as string | null) ?? null,
    business_legal_name: (row.business_legal_name as string | null) ?? null,
    industry: (row.industry as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    job_title: (row.job_title as string | null) ?? null,
    department: (row.department as string | null) ?? null,
    organization_name: (row.organization_name as string | null) ?? null,
    is_default: Boolean(row.is_default),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** Ensure the account has a default personal guardian profile; set active if missing. */
export async function ensureDefaultGuardianProfile(
  supabase: SupabaseClient,
  user: User
): Promise<GuardianProfile> {
  const { data: existing } = await supabase
    .from("guardian_profiles")
    .select(PROFILE_SELECT)
    .eq("owner_user_id", user.id)
    .eq("is_default", true)
    .maybeSingle();

  if (existing) {
    await ensureActivePointsSomewhere(supabase, user.id, asProfile(existing));
    return asProfile(existing);
  }

  const { data: account } = await supabase
    .from("profiles")
    .select("full_name, email, company_name")
    .eq("id", user.id)
    .maybeSingle();

  const display =
    account?.full_name?.trim() ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    (account?.email ? String(account.email).split("@")[0] : null) ||
    "Me";

  const { data: created, error } = await supabase
    .from("guardian_profiles")
    .insert({
      owner_user_id: user.id,
      profile_type: "personal" satisfies GuardianProfileType,
      display_name: display,
      relationship: "Myself",
      organization_name: account?.company_name?.trim() || null,
      is_default: true,
    })
    .select(PROFILE_SELECT)
    .single();

  if (error || !created) {
    // Race: another request created default
    const { data: again } = await supabase
      .from("guardian_profiles")
      .select(PROFILE_SELECT)
      .eq("owner_user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();
    if (again) return asProfile(again);
    throw new Error("Couldn't create default profile.");
  }

  const profile = asProfile(created);
  await supabase
    .from("profiles")
    .update({ active_guardian_profile_id: profile.id })
    .eq("id", user.id);

  return profile;
}

async function ensureActivePointsSomewhere(
  supabase: SupabaseClient,
  userId: string,
  fallback: GuardianProfile
) {
  const { data: account } = await supabase
    .from("profiles")
    .select("active_guardian_profile_id")
    .eq("id", userId)
    .maybeSingle();

  const activeId = account?.active_guardian_profile_id as string | null;
  if (activeId) {
    const { data: active } = await supabase
      .from("guardian_profiles")
      .select("id")
      .eq("id", activeId)
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (active) return;
  }

  await supabase
    .from("profiles")
    .update({ active_guardian_profile_id: fallback.id })
    .eq("id", userId);
}

export async function listGuardianProfiles(
  supabase: SupabaseClient,
  userId: string
): Promise<GuardianProfile[]> {
  const { data } = await supabase
    .from("guardian_profiles")
    .select(PROFILE_SELECT)
    .eq("owner_user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => asProfile(row));
}

/** Resolve active profile (ensures default exists; falls back to default). */
export async function getActiveGuardianProfile(
  supabase: SupabaseClient,
  user: User
): Promise<GuardianProfile> {
  const defaultProfile = await ensureDefaultGuardianProfile(supabase, user);

  const { data: account } = await supabase
    .from("profiles")
    .select("active_guardian_profile_id")
    .eq("id", user.id)
    .maybeSingle();

  const activeId = account?.active_guardian_profile_id as string | null;
  if (activeId) {
    const { data: active } = await supabase
      .from("guardian_profiles")
      .select(PROFILE_SELECT)
      .eq("id", activeId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (active) return asProfile(active);
  }

  await supabase
    .from("profiles")
    .update({ active_guardian_profile_id: defaultProfile.id })
    .eq("id", user.id);

  return defaultProfile;
}

export async function requireOwnedGuardianProfile(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<GuardianProfile | null> {
  const { data } = await supabase
    .from("guardian_profiles")
    .select(PROFILE_SELECT)
    .eq("id", profileId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  return data ? asProfile(data) : null;
}

export async function setActiveGuardianProfile(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<GuardianProfile | null> {
  const owned = await requireOwnedGuardianProfile(supabase, userId, profileId);
  if (!owned) return null;
  await supabase
    .from("profiles")
    .update({ active_guardian_profile_id: owned.id })
    .eq("id", userId);
  return owned;
}
