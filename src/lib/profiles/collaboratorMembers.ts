import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { CollaboratorAccount } from "@/lib/profiles/collaboratorDisplay";

export type { CollaboratorAccount };

/**
 * Load name/email for vault members. Uses the service role after the caller
 * has verified vault ownership — profiles RLS blocks cross-user reads.
 */
export async function loadCollaboratorMemberAccounts(
  userIds: string[]
): Promise<Map<string, CollaboratorAccount>> {
  const map = new Map<string, CollaboratorAccount>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return map;

  const admin = createAdminClient();
  if (!admin) return map;

  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ids);

  if (error) {
    console.error("Collaborator profile lookup failed:", error.message);
  } else {
    for (const row of data ?? []) {
      map.set(String(row.id), {
        email: row.email?.trim() || null,
        fullName: row.full_name?.trim() || null,
      });
    }
  }

  for (const id of ids) {
    if (map.has(id)) continue;
    try {
      const { data: userData, error: userError } =
        await admin.auth.admin.getUserById(id);
      if (userError || !userData?.user) continue;
      const u = userData.user;
      const meta = u.user_metadata ?? {};
      map.set(id, {
        email: u.email?.trim() || null,
        fullName:
          (typeof meta.full_name === "string" && meta.full_name.trim()) ||
          (typeof meta.name === "string" && meta.name.trim()) ||
          null,
      });
    } catch {
      /* non-blocking fallback */
    }
  }

  return map;
}
