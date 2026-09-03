import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Second Supabase project that stores company timesheets
 * (`timesheet_users`, `timesheet_time_entries`). Server-only.
 */
export function createTimesheetClient() {
  const url = process.env.TIMESHEET_SUPABASE_URL;
  const key =
    process.env.TIMESHEET_SUPABASE_SERVICE_ROLE_KEY ??
    process.env.TIMESHEET_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isTimesheetRemoteConfigured(): boolean {
  return Boolean(
    process.env.TIMESHEET_SUPABASE_URL &&
      (process.env.TIMESHEET_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.TIMESHEET_SUPABASE_ANON_KEY)
  );
}
