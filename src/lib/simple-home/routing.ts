import type { GuardianProfile } from "@/lib/profiles/types";
import { canAccessSimpleHome } from "@/lib/features/simple-home";
import {
  EMPLOYEE_HUB_PATH,
  isEmployeeHubProfile,
} from "@/lib/employee-hub/routing";

export const SIMPLE_HOME_PATH = "/home";
export const ASK_GIDEON_PATH = "/ask";
export const VAULTS_PATH = "/vaults";

/** Default signed-in landing page when simple home is enabled. */
export function signedInLandingPath(
  profile:
    | Pick<GuardianProfile, "profile_type" | "parent_profile_id">
    | null
    | undefined,
  options?: { email?: string | null; isBetaUser?: boolean }
): string {
  if (isEmployeeHubProfile(profile)) return EMPLOYEE_HUB_PATH;
  if (canAccessSimpleHome(options)) return SIMPLE_HOME_PATH;
  return ASK_GIDEON_PATH;
}
