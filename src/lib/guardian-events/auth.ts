/**
 * Authorization helpers for guardian_events.
 * Mirrors guardian_items / daily_logs membership patterns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuardianEvent } from "./types";

/**
 * Space ids the user may access (owner | editor | viewer).
 * Never trust client-supplied ids without intersecting this set.
 */
export async function resolveAuthorizedSpaceIds(
  supabase: SupabaseClient,
  userId: string,
  filter?: { spaceId?: string; spaceIds?: string[] }
): Promise<string[]> {
  const { data } = await supabase
    .from("guardian_profile_members")
    .select("profile_id")
    .eq("user_id", userId);
  const authorized = [
    ...new Set((data ?? []).map((r) => r.profile_id as string).filter(Boolean)),
  ];

  if (filter?.spaceIds?.length) {
    const allowed = new Set(authorized);
    return filter.spaceIds.filter((id) => allowed.has(id));
  }
  if (filter?.spaceId) {
    return authorized.includes(filter.spaceId) ? [filter.spaceId] : [];
  }
  return authorized;
}

/** Whether the user can read this event (pure; no DB). */
export function canReadGuardianEvent(
  event: Pick<GuardianEvent, "user_id" | "space_id">,
  args: { userId: string; authorizedSpaceIds: ReadonlySet<string> | readonly string[] }
): boolean {
  const spaces =
    args.authorizedSpaceIds instanceof Set
      ? args.authorizedSpaceIds
      : new Set(args.authorizedSpaceIds);

  if (event.space_id == null) {
    return event.user_id === args.userId;
  }
  return spaces.has(event.space_id);
}

/**
 * Whether the user can create/update an event in this space context.
 * Unscoped (null) writes: owner only (caller must set userId = self).
 * Spaced writes: must be editable member.
 */
export function canWriteGuardianEventSpace(
  spaceId: string | null | undefined,
  args: {
    userId: string;
    editableSpaceIds: ReadonlySet<string> | readonly string[];
  }
): boolean {
  if (spaceId == null || spaceId === "") return true;
  const editable =
    args.editableSpaceIds instanceof Set
      ? args.editableSpaceIds
      : new Set(args.editableSpaceIds);
  return editable.has(spaceId);
}

/** Filter a list to events the user is allowed to see. */
export function filterReadableGuardianEvents<
  T extends Pick<GuardianEvent, "user_id" | "space_id">,
>(
  events: T[],
  args: { userId: string; authorizedSpaceIds: ReadonlySet<string> | readonly string[] }
): T[] {
  return events.filter((e) => canReadGuardianEvent(e, args));
}

/**
 * Load space ids where the user can edit (owner | editor).
 * Used before insert/update/associate.
 */
export async function resolveEditableSpaceIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("guardian_profile_members")
    .select("profile_id, role")
    .eq("user_id", userId)
    .in("role", ["owner", "editor"]);
  return [
    ...new Set((data ?? []).map((r) => r.profile_id as string).filter(Boolean)),
  ];
}
