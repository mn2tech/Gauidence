import type { SupabaseClient } from "@supabase/supabase-js";

type MemberRole = "owner" | "editor" | "viewer";

/**
 * Direct child Space ids under a parent (one level — Family kids/homes/pets).
 */
export async function listChildProfileIds(
  admin: SupabaseClient,
  parentProfileId: string
): Promise<string[]> {
  const { data } = await admin
    .from("guardian_profiles")
    .select("id")
    .eq("parent_profile_id", parentProfileId);
  return (data ?? []).map((r) => r.id as string);
}

/**
 * After joining a Family Space, grant the same non-owner role on child Spaces
 * so partners see household Today (school/kids/home items).
 */
export async function cascadeMembershipToFamilyChildren(
  admin: SupabaseClient,
  args: {
    familyProfileId: string;
    userId: string;
    role: string;
    invitedBy: string | null;
  }
): Promise<number> {
  if (args.role === "owner") return 0;
  const childIds = await listChildProfileIds(admin, args.familyProfileId);
  if (childIds.length === 0) return 0;

  const role: MemberRole =
    args.role === "viewer" ? "viewer" : "editor";

  const rows = childIds.map((profile_id) => ({
    profile_id,
    user_id: args.userId,
    role,
    invited_by: args.invitedBy,
  }));

  const { error } = await admin
    .from("guardian_profile_members")
    .upsert(rows, { onConflict: "profile_id,user_id" });

  if (error) {
    console.error(
      "Cascade family membership failed:",
      error.message
    );
    return 0;
  }
  return rows.length;
}

/**
 * When a child Space is created under Family, copy existing Family collaborators
 * onto the child so partners keep shared Today without re-invite.
 */
export async function mirrorFamilyCollaboratorsOntoChild(
  admin: SupabaseClient,
  args: {
    familyProfileId: string;
    childProfileId: string;
  }
): Promise<number> {
  const { data: members } = await admin
    .from("guardian_profile_members")
    .select("user_id, role, invited_by")
    .eq("profile_id", args.familyProfileId)
    .neq("role", "owner");

  if (!members?.length) return 0;

  const rows = members.map((m) => ({
    profile_id: args.childProfileId,
    user_id: m.user_id as string,
    role: (m.role === "viewer" ? "viewer" : "editor") as MemberRole,
    invited_by: (m.invited_by as string | null) ?? null,
  }));

  const { error } = await admin
    .from("guardian_profile_members")
    .upsert(rows, { onConflict: "profile_id,user_id" });

  if (error) {
    console.error(
      "Mirror family collaborators onto child failed:",
      error.message
    );
    return 0;
  }
  return rows.length;
}

/**
 * Repair path for partners who joined Family before child cascade existed.
 * Idempotent upserts onto all child Spaces under their Family memberships.
 */
export async function repairFamilyCascadeForUser(
  admin: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: memberships } = await admin
    .from("guardian_profile_members")
    .select("profile_id, role, invited_by")
    .eq("user_id", userId)
    .neq("role", "owner");

  if (!memberships?.length) return 0;

  const profileIds = memberships.map((m) => m.profile_id as string);
  const { data: families } = await admin
    .from("guardian_profiles")
    .select("id")
    .in("id", profileIds)
    .eq("profile_type", "family");

  if (!families?.length) return 0;

  let total = 0;
  for (const fam of families) {
    const membership = memberships.find(
      (m) => (m.profile_id as string) === (fam.id as string)
    );
    if (!membership) continue;
    total += await cascadeMembershipToFamilyChildren(admin, {
      familyProfileId: fam.id as string,
      userId,
      role: membership.role as string,
      invitedBy: (membership.invited_by as string | null) ?? null,
    });
  }
  return total;
}
