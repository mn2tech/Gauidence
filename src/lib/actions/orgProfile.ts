import { isOrgStyleProfile, type GuardianProfileType } from "@/lib/profiles/types";

/** Business/nonprofit workspace id for Leads, Recruit, and Payroll-style tools. */
export function resolveOrgWorkspaceId(active: {
  id: string;
  profile_type: GuardianProfileType;
  parent_profile_id?: string | null;
}): string | null {
  if (isOrgStyleProfile(active.profile_type)) return active.id;
  if (active.profile_type === "employee" && active.parent_profile_id) {
    return active.parent_profile_id;
  }
  return null;
}
