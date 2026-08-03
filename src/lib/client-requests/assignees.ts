import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { collaboratorDisplayName } from "@/lib/profiles/collaboratorDisplay";
import { loadCollaboratorMemberAccounts } from "@/lib/profiles/collaboratorMembers";

export type ClientRequestAssignee = {
  userId: string;
  name: string;
  employeeProfileId: string;
};

/** Employees under a business vault that can be assigned client requests. */
export async function listClientRequestAssignees(
  supabase: SupabaseClient,
  businessProfileId: string
): Promise<ClientRequestAssignee[]> {
  const { data: employees } = await supabase
    .from("guardian_profiles")
    .select("id, owner_user_id, display_name")
    .eq("parent_profile_id", businessProfileId)
    .eq("profile_type", "employee")
    .order("display_name", { ascending: true });

  const rows = employees ?? [];
  const userIds = [...new Set(rows.map((r) => String(r.owner_user_id)))];
  const accounts = await loadCollaboratorMemberAccounts(userIds);

  return rows.map((row) => {
    const userId = String(row.owner_user_id);
    const account = accounts.get(userId);
    const name =
      row.display_name?.trim() ||
      collaboratorDisplayName(account) ||
      "Employee";
    return {
      userId,
      name,
      employeeProfileId: String(row.id),
    };
  });
}

/** Validate assignee is an employee of the client vault's parent business. */
export async function isValidClientRequestAssignee(
  supabase: SupabaseClient,
  clientProfileId: string,
  assigneeUserId: string
): Promise<boolean> {
  const { data: client } = await supabase
    .from("guardian_profiles")
    .select("parent_profile_id")
    .eq("id", clientProfileId)
    .maybeSingle();

  const parentId = client?.parent_profile_id as string | null | undefined;
  if (!parentId) return false;

  const { data: employee } = await supabase
    .from("guardian_profiles")
    .select("id")
    .eq("parent_profile_id", parentId)
    .eq("profile_type", "employee")
    .eq("owner_user_id", assigneeUserId)
    .maybeSingle();

  return Boolean(employee);
}
