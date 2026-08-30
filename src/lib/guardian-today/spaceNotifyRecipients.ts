import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Map space_id → member user_ids for notify fan-out.
 */
export async function memberUserIdsBySpace(
  admin: SupabaseClient,
  spaceIds: string[]
): Promise<Map<string, string[]>> {
  const unique = [...new Set(spaceIds.filter(Boolean))];
  const map = new Map<string, string[]>();
  if (unique.length === 0) return map;

  const { data } = await admin
    .from("guardian_profile_members")
    .select("profile_id, user_id")
    .in("profile_id", unique);

  for (const row of data ?? []) {
    const spaceId = row.profile_id as string;
    const userId = row.user_id as string;
    const list = map.get(spaceId) ?? [];
    if (!list.includes(userId)) list.push(userId);
    map.set(spaceId, list);
  }
  return map;
}

/** Recipients for an item: space members, else the item owner. */
export function recipientsForSpaceItem(
  spaceId: string | null | undefined,
  ownerUserId: string,
  membersBySpace: Map<string, string[]>
): string[] {
  if (spaceId) {
    const members = membersBySpace.get(spaceId);
    if (members?.length) return members;
  }
  return [ownerUserId];
}
