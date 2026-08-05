import type { GuardianProfile } from "@/lib/profiles/types";

export const EMPLOYEE_HUB_PATH = "/employee";
export const EMPLOYEE_GIDEON_PATH = "/employee/ask";

export type PostLoginPath = typeof EMPLOYEE_HUB_PATH | "/ask";

/** Ask Gideon for an employee vault (never redirects back to the hub). */
export function employeeGideonHref(employeeProfileId?: string): string {
  if (!employeeProfileId) return EMPLOYEE_GIDEON_PATH;
  const q = new URLSearchParams({ profileId: employeeProfileId });
  return `${EMPLOYEE_GIDEON_PATH}?${q.toString()}`;
}

/** Deep link into the employee vault files section (no auto camera). */
export function employeeInvoiceDocumentsHref(employeeProfileId: string): string {
  const q = new URLSearchParams({
    docs: "1",
    profileId: employeeProfileId,
  });
  return `/dashboard?${q.toString()}#documents-${employeeProfileId}`;
}

/** @deprecated Use employeeInvoiceDocumentsHref; kept for existing links. */
export function employeeInvoiceUploadHref(employeeProfileId: string): string {
  return employeeInvoiceDocumentsHref(employeeProfileId);
}

export function isEmployeeHubProfile<
  T extends Pick<GuardianProfile, "profile_type" | "parent_profile_id">,
>(
  profile: T | null | undefined
): profile is T & { profile_type: "employee"; parent_profile_id: string } {
  return (
    profile?.profile_type === "employee" && Boolean(profile.parent_profile_id)
  );
}

/** Default signed-in landing page for the active vault. */
export function postLoginPathForProfile(
  profile:
    | Pick<GuardianProfile, "profile_type" | "parent_profile_id">
    | null
    | undefined
): PostLoginPath {
  return isEmployeeHubProfile(profile) ? EMPLOYEE_HUB_PATH : "/ask";
}
