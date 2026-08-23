import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectedSourceAccess, ConnectedSourceType } from "../types";

/** Remote connectors that can be shared when bound to a space. */
export const PROFILE_SHARED_SOURCE_TYPES: ConnectedSourceType[] = [
  "trello",
  "google_drive",
];

export function isProfileSharedSourceType(
  sourceType: ConnectedSourceType | string
): boolean {
  return PROFILE_SHARED_SOURCE_TYPES.includes(sourceType as ConnectedSourceType);
}

export function connectedSourceAccessForUser(
  ownerUserId: string,
  viewerUserId: string
): ConnectedSourceAccess {
  return ownerUserId === viewerUserId ? "owner" : "shared";
}

export function canManageConnectedSource(
  ownerUserId: string,
  viewerUserId: string
): boolean {
  return ownerUserId === viewerUserId;
}

export async function canUseConnectedSourceSecrets(
  supabase: SupabaseClient,
  viewerUserId: string,
  args: {
    ownerUserId: string;
    profileId: string | null | undefined;
    sourceType: ConnectedSourceType | string;
  }
): Promise<boolean> {
  if (args.ownerUserId === viewerUserId) return true;
  if (!args.profileId || !isProfileSharedSourceType(args.sourceType)) {
    return false;
  }
  const { data, error } = await supabase
    .from("guardian_profile_members")
    .select("role")
    .eq("profile_id", args.profileId)
    .eq("user_id", viewerUserId)
    .maybeSingle();
  if (error) throw error;
  return data?.role === "owner" || data?.role === "editor";
}
