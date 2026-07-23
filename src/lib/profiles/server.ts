import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isGuardianProfileType,
  type GuardianProfile,
  type GuardianProfileAccessRole,
} from "./types";

const PROFILE_SELECT =
  "id, owner_user_id, profile_type, display_name, relationship, avatar_url, date_of_birth, school_name, grade_level, business_legal_name, industry, website, description, job_title, department, organization_name, parent_profile_id, is_default, created_at, updated_at";

function asProfile(
  row: Record<string, unknown>,
  accessRole?: GuardianProfileAccessRole
): GuardianProfile {
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
    access_role: accessRole,
  };
}

async function membershipRoleMap(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, GuardianProfileAccessRole>> {
  const { data } = await supabase
    .from("guardian_profile_members")
    .select("profile_id, role")
    .eq("user_id", userId);
  const map = new Map<string, GuardianProfileAccessRole>();
  for (const row of data ?? []) {
    const role = row.role === "owner" || row.role === "editor" ? row.role : null;
    if (role && row.profile_id) map.set(String(row.profile_id), role);
  }
  return map;
}

function personalDisplayName(user: User): string {
  const meta = user.user_metadata ?? {};
  const fromMeta =
    typeof meta.full_name === "string" && meta.full_name.trim()
      ? meta.full_name.trim()
      : typeof meta.name === "string" && meta.name.trim()
        ? meta.name.trim()
        : "";
  if (fromMeta) return fromMeta;
  return user.email?.split("@")[0]?.trim() || "Me";
}

/**
 * Creates the default personal ("Myself") vault for a user who has none.
 * New signups get one from the handle_new_user trigger (migration 0038);
 * this covers accounts created before that migration.
 */
async function createPersonalGuardianProfile(
  supabase: SupabaseClient,
  user: User
): Promise<GuardianProfile | null> {
  const admin = createAdminClient();
  const client = admin ?? supabase;

  // Guard against concurrent requests racing to create the first profile.
  const { data: existing } = await client
    .from("guardian_profiles")
    .select(PROFILE_SELECT)
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) return asProfile(existing, "owner");

  const { data, error } = await client
    .from("guardian_profiles")
    .insert({
      owner_user_id: user.id,
      profile_type: "personal",
      display_name: personalDisplayName(user),
      relationship: "Myself",
      is_default: true,
    })
    .select(PROFILE_SELECT)
    .single();

  if (error || !data) {
    console.error(
      "Auto-create personal profile failed:",
      error?.code,
      error?.message
    );
    return null;
  }

  if (admin) {
    await admin.from("guardian_profile_members").upsert(
      {
        profile_id: data.id,
        user_id: user.id,
        role: "owner",
        invited_by: user.id,
      },
      { onConflict: "profile_id,user_id" }
    );
  }

  await supabase
    .from("profiles")
    .update({ active_guardian_profile_id: data.id })
    .eq("id", user.id);

  return asProfile(data, "owner");
}

/**
 * Returns the owner's default profile, auto-creating a personal
 * "Myself" vault when the user has none yet.
 */
export async function ensureDefaultGuardianProfile(
  supabase: SupabaseClient,
  user: User
): Promise<GuardianProfile | null> {
  const roles = await membershipRoleMap(supabase, user.id);
  const ownedIds = [...roles.entries()]
    .filter(([, role]) => role === "owner")
    .map(([id]) => id);

  if (ownedIds.length === 0) {
    // Fallback for pre-migration DBs: owner_user_id only
    const { data: existing } = await supabase
      .from("guardian_profiles")
      .select(PROFILE_SELECT)
      .eq("owner_user_id", user.id)
      .eq("is_default", true)
      .maybeSingle();
    if (existing) {
      await ensureActivePointsSomewhere(
        supabase,
        user.id,
        asProfile(existing, "owner")
      );
      return asProfile(existing, "owner");
    }
    const { data: anyOwned } = await supabase
      .from("guardian_profiles")
      .select(PROFILE_SELECT)
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (anyOwned) {
      await ensureActivePointsSomewhere(
        supabase,
        user.id,
        asProfile(anyOwned, "owner")
      );
      return asProfile(anyOwned, "owner");
    }
    return createPersonalGuardianProfile(supabase, user);
  }

  const { data: existing } = await supabase
    .from("guardian_profiles")
    .select(PROFILE_SELECT)
    .in("id", ownedIds)
    .eq("is_default", true)
    .maybeSingle();

  if (existing) {
    await ensureActivePointsSomewhere(
      supabase,
      user.id,
      asProfile(existing, "owner")
    );
    return asProfile(existing, "owner");
  }

  const { data: anyProfile } = await supabase
    .from("guardian_profiles")
    .select(PROFILE_SELECT)
    .in("id", ownedIds)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (anyProfile) {
    await ensureActivePointsSomewhere(
      supabase,
      user.id,
      asProfile(anyProfile, "owner")
    );
    return asProfile(anyProfile, "owner");
  }

  return createPersonalGuardianProfile(supabase, user);
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
    const accessible = await requireAccessibleGuardianProfile(
      supabase,
      userId,
      activeId
    );
    if (accessible) return;
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
  const roles = await membershipRoleMap(supabase, userId);
  const profileIds = [...roles.keys()];

  if (profileIds.length === 0) {
    // Pre-migration fallback
    const { data } = await supabase
      .from("guardian_profiles")
      .select(PROFILE_SELECT)
      .eq("owner_user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    return (data ?? []).map((row) => asProfile(row, "owner"));
  }

  const { data } = await supabase
    .from("guardian_profiles")
    .select(PROFILE_SELECT)
    .in("id", profileIds)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => {
    const id = String(row.id);
    const role =
      roles.get(id) ??
      (String(row.owner_user_id) === userId ? "owner" : "editor");
    return asProfile(row, role);
  });
}

/**
 * Resolve the active profile. Users with no profiles get a personal
 * "Myself" vault created automatically.
 */
export async function getActiveGuardianProfile(
  supabase: SupabaseClient,
  user: User
): Promise<GuardianProfile | null> {
  const profiles = await listGuardianProfiles(supabase, user.id);
  if (profiles.length === 0) {
    return createPersonalGuardianProfile(supabase, user);
  }

  const fallback =
    profiles.find((p) => p.access_role === "owner" && p.is_default) ??
    profiles.find((p) => p.access_role === "owner") ??
    profiles[0];

  const { data: account } = await supabase
    .from("profiles")
    .select("active_guardian_profile_id")
    .eq("id", user.id)
    .maybeSingle();

  const activeId = account?.active_guardian_profile_id as string | null;
  if (activeId) {
    const active = profiles.find((p) => p.id === activeId);
    if (active) return active;
  }

  await supabase
    .from("profiles")
    .update({ active_guardian_profile_id: fallback.id })
    .eq("id", user.id);

  return fallback;
}

export async function requireAccessibleGuardianProfile(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<GuardianProfile | null> {
  const { data: member } = await supabase
    .from("guardian_profile_members")
    .select("role")
    .eq("profile_id", profileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (member?.role === "owner" || member?.role === "editor") {
    const { data } = await supabase
      .from("guardian_profiles")
      .select(PROFILE_SELECT)
      .eq("id", profileId)
      .maybeSingle();
    return data ? asProfile(data, member.role) : null;
  }

  // Pre-migration fallback
  const { data } = await supabase
    .from("guardian_profiles")
    .select(PROFILE_SELECT)
    .eq("id", profileId)
    .eq("owner_user_id", userId)
    .maybeSingle();
  return data ? asProfile(data, "owner") : null;
}

export async function requireEditableGuardianProfile(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<GuardianProfile | null> {
  const profile = await requireAccessibleGuardianProfile(
    supabase,
    userId,
    profileId
  );
  if (!profile) return null;
  if (profile.access_role === "owner" || profile.access_role === "editor") {
    return profile;
  }
  return null;
}

/** Owner-only profile access (settings, invites, shares, delete). */
export async function requireOwnedGuardianProfile(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<GuardianProfile | null> {
  const profile = await requireAccessibleGuardianProfile(
    supabase,
    userId,
    profileId
  );
  if (!profile || profile.access_role !== "owner") return null;
  return profile;
}

export async function setActiveGuardianProfile(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<GuardianProfile | null> {
  const accessible = await requireAccessibleGuardianProfile(
    supabase,
    userId,
    profileId
  );
  if (!accessible) return null;
  await supabase
    .from("profiles")
    .update({ active_guardian_profile_id: accessible.id })
    .eq("id", userId);
  return accessible;
}
