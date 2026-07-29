import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ClockResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function findEmployeeProfileId(
  supabase: SupabaseClient,
  businessProfileId: string,
  name?: string
): Promise<{ id: string; display_name: string } | null> {
  const { data, error } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .eq("parent_profile_id", businessProfileId)
    .eq("profile_type", "employee");

  if (error || !data?.length) return null;

  const employees = data as { id: string; display_name: string }[];
  if (!name?.trim()) return null;

  const needle = name.trim().toLowerCase();
  const exact = employees.find((e) => e.display_name.toLowerCase() === needle);
  if (exact) return exact;

  const partial = employees.find((e) =>
    e.display_name.toLowerCase().includes(needle)
  );
  return partial ?? null;
}

export async function executeClockIn(
  supabase: SupabaseClient,
  profileId: string,
  employeeProfileId: string,
  userId: string
): Promise<ClockResult> {
  const { data: existing } = await supabase
    .from("payroll_time_entries")
    .select("id")
    .eq("profile_id", profileId)
    .eq("employee_profile_id", employeeProfileId)
    .is("clock_out_at", null)
    .maybeSingle();

  if (existing) {
    return { ok: false, message: "Already clocked in. Clock out first." };
  }

  const { error } = await supabase.from("payroll_time_entries").insert({
    profile_id: profileId,
    employee_profile_id: employeeProfileId,
    entry_type: "punch",
    clock_in_at: new Date().toISOString(),
    created_by: userId,
  });

  if (error) {
    return { ok: false, message: "Couldn't clock in." };
  }

  return { ok: true, message: "Clocked in successfully." };
}

export async function executeClockOut(
  supabase: SupabaseClient,
  profileId: string,
  employeeProfileId: string
): Promise<ClockResult> {
  const { data: open } = await supabase
    .from("payroll_time_entries")
    .select("id, clock_in_at")
    .eq("profile_id", profileId)
    .eq("employee_profile_id", employeeProfileId)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) {
    return { ok: false, message: "Not clocked in." };
  }

  const row = open as { id: string; clock_in_at: string };
  const { error } = await supabase
    .from("payroll_time_entries")
    .update({
      clock_out_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) {
    return { ok: false, message: "Couldn't clock out." };
  }

  const inTime = new Date(row.clock_in_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return { ok: true, message: `Clocked out. Shift started at ${inTime}.` };
}
