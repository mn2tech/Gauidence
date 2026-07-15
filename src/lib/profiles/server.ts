import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  isGuardianProfileType,
  type GuardianProfile,
} from "./types";

const PROFILE_SELECT =
  "id, owner_user_id, profile_type, display_name, relationship, avatar_url, date_of_birth, school_name, grade_level, business_legal_name, industry, website, description, job_title, department, organization_name, parent_profile_id, is_default, created_at, updated_at";

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
    parent_profile_id: (row.parent_profile_id as string | null) ?? null,
    is_default: Boolean(row.is_default),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/**
 * Returns the owner's default profile if one exists, otherwise null.
 * Does NOT auto-create a "Myself" profile — new users use the setup hub.
 */
export async function ensureDefaultGuardianProfile(
  supabase: SupabaseClient,
  user: User
): Promise<GuardianProfile | null> {
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

  const { data: anyProfile } = await supabase
    .from("guardian_profiles")
    .select(PROFILE_SELECT)
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (anyProfile) {
    await ensureActivePointsSomewhere(supabase, user.id, asProfile(anyProfile));
    return asProfile(anyProfile);
  }

  return null;
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

/** Resolve active profile, or null when the user has not created any yet. */
export async function getActiveGuardianProfile(
  supabase: SupabaseClient,
  user: User
): Promise<GuardianProfile | null> {
  const fallback = await ensureDefaultGuardianProfile(supabase, user);
  if (!fallback) return null;

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
    .update({ active_guardian_profile_id: fallback.id })
    .eq("id", user.id);

  return fallback;
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
