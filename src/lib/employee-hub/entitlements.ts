import type { EmployeeHubEntitlements } from "./types";
import { DEFAULT_EMPLOYEE_HUB_ENTITLEMENTS } from "./types";

/** Client-safe defaults when entitlements haven't loaded yet. */
export function defaultEmployeeEntitlements(
  businessProfileId: string,
  employeeProfileId: string
): EmployeeHubEntitlements {
  const now = new Date().toISOString();
  return {
    id: "",
    business_profile_id: businessProfileId,
    employee_profile_id: employeeProfileId,
    ...DEFAULT_EMPLOYEE_HUB_ENTITLEMENTS,
    created_at: now,
    updated_at: now,
  };
}

export function isEmployeeProfile(
  profileType: string | undefined
): profileType is "employee" {
  return profileType === "employee";
}

/** Power features hidden from employees unless explicitly enabled. */
export function employeeShowsPowerNav(
  entitlements: Pick<
    EmployeeHubEntitlements,
    "research" | "work_memory" | "experts" | "recruit" | "payroll_admin"
  >
): boolean {
  return (
    entitlements.research ||
    entitlements.work_memory ||
    entitlements.experts ||
    entitlements.recruit ||
    entitlements.payroll_admin
  );
}
