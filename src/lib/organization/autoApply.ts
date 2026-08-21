import type { GuardianProfile } from "@/lib/profiles/types";
import type { AutoOrganizeMode, RecommendedAction } from "./types";

const UNORGANIZED_MARKER = "guardian:unorganized";

function isUnorganizedStaging(
  profile: Pick<GuardianProfile, "profile_type" | "display_name" | "description">
): boolean {
  return (
    profile.profile_type === "other" &&
    profile.display_name === "Unorganized" &&
    (profile.description?.includes(UNORGANIZED_MARKER) ?? false)
  );
}

/** Whether auto-organize may move a document away from its current Space. */
export function canAutoApplyOrganizationMove(args: {
  mode: AutoOrganizeMode;
  recommendedAction: RecommendedAction | string;
  confidence: number;
  threshold: number;
  suggestedVaultId: string | null;
  currentProfileId: string;
  currentProfile:
    | Pick<GuardianProfile, "profile_type" | "display_name" | "description">
    | null
    | undefined;
}): boolean {
  if (args.mode !== "auto") return false;
  if (args.recommendedAction !== "save_to_existing") return false;
  if (args.confidence < args.threshold) return false;
  if (!args.suggestedVaultId) return false;

  const movesAway = args.suggestedVaultId !== args.currentProfileId;
  if (!movesAway) return true;

  // Only auto-file out of Unorganized staging — never yank intentional placements.
  return Boolean(args.currentProfile && isUnorganizedStaging(args.currentProfile));
}
