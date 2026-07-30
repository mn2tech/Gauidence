import type { GuardianProfile } from "@/lib/profiles/types";

/** Parent business name for a client vault, or a generic fallback. */
export function clientBusinessLabel(
  profiles: GuardianProfile[],
  clientProfile: GuardianProfile | null | undefined,
  fallback = "your company"
): string {
  const parentId = clientProfile?.parent_profile_id;
  if (!parentId) return fallback;
  const parent = profiles.find((p) => p.id === parentId);
  const name = parent?.display_name?.trim();
  return name || fallback;
}
