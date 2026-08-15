import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAttachChildToParent,
  isGuardianProfileType,
  type GuardianProfileType,
} from "@/lib/profiles/types";
import type { PackSpaceRow } from "./types";

export type EnsuredPackSpace = {
  key: string;
  spaceProfileId: string;
  displayName: string;
  createdNew: boolean;
  reused: boolean;
};

/**
 * Find an existing child Space under parent with the same display name
 * (case-insensitive), or create a new nested Space.
 */
export async function ensureRecommendedSpace(
  supabase: SupabaseClient,
  args: {
    parentProfileId: string;
    ownerUserId: string;
    packSpace: PackSpaceRow;
  }
): Promise<EnsuredPackSpace> {
  const { parentProfileId, ownerUserId, packSpace } = args;
  const displayName = packSpace.display_name.trim();
  const profileType: GuardianProfileType = isGuardianProfileType(
    packSpace.profile_type
  )
    ? packSpace.profile_type
    : "other";

  if (!canAttachChildToParent(profileType, "business")) {
    throw new Error(
      `Cannot nest ${profileType} under a business Space for pack Space "${packSpace.key}".`
    );
  }

  const { data: children } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .eq("parent_profile_id", parentProfileId)
    .eq("owner_user_id", ownerUserId);

  const existing = (children ?? []).find(
    (c) =>
      String(c.display_name ?? "")
        .trim()
        .toLowerCase() === displayName.toLowerCase()
  );

  if (existing?.id) {
    return {
      key: packSpace.key,
      spaceProfileId: String(existing.id),
      displayName,
      createdNew: false,
      reused: true,
    };
  }

  const { data: created, error } = await supabase
    .from("guardian_profiles")
    .insert({
      owner_user_id: ownerUserId,
      profile_type: profileType,
      display_name: displayName,
      relationship: displayName,
      description: packSpace.description || null,
      parent_profile_id: parentProfileId,
      is_default: false,
    })
    .select("id, display_name")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "Failed to create recommended Space.");
  }

  return {
    key: packSpace.key,
    spaceProfileId: String(created.id),
    displayName: String(created.display_name ?? displayName),
    createdNew: true,
    reused: false,
  };
}

/** Pure helper for tests: match existing space by display name. */
export function findReusableSpaceId(
  children: Array<{ id: string; display_name: string | null }>,
  displayName: string
): string | null {
  const target = displayName.trim().toLowerCase();
  const match = children.find(
    (c) => String(c.display_name ?? "").trim().toLowerCase() === target
  );
  return match?.id ?? null;
}
