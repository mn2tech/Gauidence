import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmploymentKind } from "@/lib/profiles/types";
import {
  DEFAULT_EMPLOYEE_HUB_ENTITLEMENTS,
  type EmployeeHubEntitlements,
} from "@/lib/employee-hub/types";

export const EMPLOYMENT_KINDS: EmploymentKind[] = ["employee", "contractor"];

export function employmentKindLabel(kind: EmploymentKind): string {
  return kind === "contractor" ? "Contractor" : "Employee";
}

/** Apply hub entitlements based on employment kind after intake. */
export async function applyEmploymentKindEntitlements(
  supabase: SupabaseClient,
  businessProfileId: string,
  employeeProfileId: string,
  kind: EmploymentKind
): Promise<void> {
  const patch: Partial<
    Omit<
      EmployeeHubEntitlements,
      "id" | "business_profile_id" | "employee_profile_id" | "created_at" | "updated_at"
    >
  > =
    kind === "contractor"
      ? {
          time_tracking: false,
          manual_time_entry: false,
          leave_requests: false,
          invoice_upload: true,
          documents: true,
          gideon_chat: true,
          status_reports: false,
        }
      : { ...DEFAULT_EMPLOYEE_HUB_ENTITLEMENTS };

  const { error } = await supabase.from("employee_hub_entitlements").upsert(
    {
      business_profile_id: businessProfileId,
      employee_profile_id: employeeProfileId,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_profile_id" }
  );

  if (error) {
    console.error("applyEmploymentKindEntitlements:", error.message);
  }
}

export async function syncEmployeeProfileFromIntake(
  supabase: SupabaseClient,
  employeeProfileId: string,
  args: {
    legalName: string;
    contactEmail: string;
    contactPhone?: string | null;
    locationAddress?: string | null;
    employmentKind: EmploymentKind;
  }
): Promise<void> {
  const updates: Record<string, string | null> = {
    legal_name: args.legalName,
    display_name: args.legalName,
    contact_email: args.contactEmail,
    contact_phone: args.contactPhone?.trim() || null,
    location_address: args.locationAddress?.trim() || null,
    employment_kind: args.employmentKind,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("guardian_profiles")
    .update(updates)
    .eq("id", employeeProfileId)
    .eq("profile_type", "employee");

  if (error) {
    console.error("syncEmployeeProfileFromIntake:", error.message);
  }
}
