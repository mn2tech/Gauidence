import type { GuardianProfile } from "@/lib/profiles/types";
import {
  EMPLOYEE_HUB_PATH,
  isEmployeeHubProfile,
} from "@/lib/employee-hub/routing";

export const SIMPLE_HOME_PATH = "/home";
export const ASK_GIDEON_PATH = "/ask";
export const VAULTS_PATH = "/vaults";
/** @deprecated Use vaultsHref("map") — map is now a view on /vaults */
export const VAULT_MAP_PATH = "/vaults/map";

export type SpacesView = "list" | "map";

export function vaultsHref(view: SpacesView = "list"): string {
  return view === "map" ? `${VAULTS_PATH}?view=map` : VAULTS_PATH;
}

export function spacesViewFromParam(
  value: string | null | undefined
): SpacesView {
  return value === "map" ? "map" : "list";
}
export const COMMAND_CENTER_PATH = "/command-center";
export const ADD_ANYTHING_PATH = "/add";
export const REMEMBER_TODAY_PATH = "/remember";

/**
 * Default signed-in landing — Ask Gideon (add + chat).
 * /home (Guardian Today) stays available under Account & tools.
 */
export function signedInLandingPath(
  profile:
    | Pick<GuardianProfile, "profile_type" | "parent_profile_id">
    | null
    | undefined,
  _options?: { email?: string | null; isBetaUser?: boolean }
): string {
  if (isEmployeeHubProfile(profile)) return EMPLOYEE_HUB_PATH;
  return ASK_GIDEON_PATH;
}
