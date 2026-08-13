import type { GuardianProfile } from "@/lib/profiles/types";
import { profileTypeLabel } from "@/lib/profiles/types";
import type { WorkspaceContextMeta } from "./types";

export const SEARCH_SCOPE_MODES = ["workspace", "global"] as const;
export type SearchScopeMode = (typeof SEARCH_SCOPE_MODES)[number];

export function parseSearchScope(raw: unknown): SearchScopeMode {
  return raw === "global" ? "global" : "workspace";
}

export function isSearchScopeMode(value: unknown): value is SearchScopeMode {
  return value === "workspace" || value === "global";
}

export type WorkingInDisplay = {
  mode: "working" | "searching";
  primaryName: string;
  secondaryLabel: string | null;
  homeName: string | null;
  scopeNote: string | null;
  workspaceProfileId: string;
  temporaryProfileId: string | null;
};

export function buildWorkingInDisplay(args: {
  workspaceProfile: Pick<
    GuardianProfile,
    "id" | "display_name" | "profile_type"
  >;
  chatScopedProfile?: { profileId: string; profileName: string } | null;
  scopedProfile?: Pick<GuardianProfile, "id" | "display_name" | "profile_type"> | null;
  vaultScopeNote?: string | null;
}): WorkingInDisplay {
  const home = args.scopedProfile ?? args.workspaceProfile;
  const temporary = args.chatScopedProfile;
  const isSearching =
    Boolean(temporary) && temporary!.profileId !== home.id;

  if (isSearching && temporary) {
    const tempProfile =
      temporary.profileId === args.workspaceProfile.id
        ? args.workspaceProfile
        : null;
    return {
      mode: "searching",
      primaryName: temporary.profileName,
      secondaryLabel: tempProfile
        ? profileTypeLabel(tempProfile.profile_type)
        : null,
      homeName: home.display_name,
      scopeNote: `Searching ${temporary.profileName} — return to ${home.display_name} when done.`,
      workspaceProfileId: home.id,
      temporaryProfileId: temporary.profileId,
    };
  }

  const active = home;
  return {
    mode: "working",
    primaryName: active.display_name,
    secondaryLabel: profileTypeLabel(active.profile_type),
    homeName: null,
    scopeNote: args.vaultScopeNote ?? null,
    workspaceProfileId: active.id,
    temporaryProfileId: null,
  };
}

/** Profile IDs included in a workspace-scoped search. */
export function profileIdsForSearchScope(
  mode: SearchScopeMode,
  meta: Pick<WorkspaceContextMeta, "searchProfileIds" | "accessibleProfiles">,
  accessibleIds: string[]
): string[] {
  if (mode === "global") return accessibleIds;
  return meta.searchProfileIds.length > 0 ? meta.searchProfileIds : accessibleIds;
}

export function searchScopeLabel(mode: SearchScopeMode): string {
  return mode === "global" ? "All spaces" : "This space";
}

/** Large heading next to Searching — space name, or “all your spaces”. */
export function searchScopeHeading(
  mode: SearchScopeMode,
  spaceName: string
): string {
  return mode === "global" ? "All your spaces" : spaceName;
}

/** One-line explanation under the This space / All spaces pills. */
export function searchScopeHint(
  mode: SearchScopeMode,
  spaceName: string
): string {
  if (mode === "global") {
    return `Answers can come from any space you can access. New files still save in ${spaceName}.`;
  }
  return "Answers come only from this space.";
}

export const SEARCH_SCOPE_FIRST_HINT =
  "You have more than one space. Stay in this one, or search all of them? New files always save here.";

export function formatSearchConfidence(score: number): string {
  const pct = Math.round(Math.max(0, Math.min(100, score)));
  return `${pct}%`;
}
