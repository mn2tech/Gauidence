import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTimesheetClient } from "./client";
import type { TimesheetHoursQuery } from "./parse";

export type TimesheetDayRow = {
  date: string;
  day: string;
  hours: number;
};

export type TimesheetHoursResult = {
  employeeName: string;
  startDate: string;
  endDate: string;
  label: string;
  days: TimesheetDayRow[];
  totalHours: number;
};

function roundHours(n: number): number {
  return Math.round(n * 100) / 100;
}

function weekdayName(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** Resolve user by exact name first, then case-insensitive contains. */
export async function findTimesheetUser(
  supabase: SupabaseClient,
  name: string
): Promise<{ id: string; name: string } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const exact = await supabase
    .from("timesheet_users")
    .select("id, name")
    .eq("name", trimmed)
    .limit(5);

  if (!exact.error && exact.data?.length === 1) {
    return exact.data[0] as { id: string; name: string };
  }
  if (!exact.error && exact.data && exact.data.length > 1) {
    return exact.data[0] as { id: string; name: string };
  }

  const fuzzy = await supabase
    .from("timesheet_users")
    .select("id, name")
    .ilike("name", `%${trimmed}%`)
    .limit(10);

  if (fuzzy.error || !fuzzy.data?.length) return null;

  const lower = trimmed.toLowerCase();
  const exactCi = fuzzy.data.find(
    (u) => String(u.name).toLowerCase() === lower
  );
  if (exactCi) return exactCi as { id: string; name: string };

  if (fuzzy.data.length === 1) {
    return fuzzy.data[0] as { id: string; name: string };
  }

  // Prefer the shortest name that still contains the query (least ambiguous).
  const sorted = [...fuzzy.data].sort(
    (a, b) => String(a.name).length - String(b.name).length
  );
  return sorted[0] as { id: string; name: string };
}

/**
 * Equivalent of the GROUPING SETS SQL: daily totals + grand total,
 * aggregated in app code so we don't need a remote RPC.
 */
export async function fetchEmployeeHours(
  query: TimesheetHoursQuery,
  client?: SupabaseClient | null
): Promise<
  | { ok: true; result: TimesheetHoursResult }
  | { ok: false; error: string }
> {
  const supabase = client ?? createTimesheetClient();
  if (!supabase) {
    return {
      ok: false,
      error:
        "Timesheet database is not configured. Set TIMESHEET_SUPABASE_URL and a key.",
    };
  }

  const user = await findTimesheetUser(supabase, query.employeeName);
  if (!user) {
    return {
      ok: false,
      error: `I couldn't find an employee named "${query.employeeName}" in the timesheet database.`,
    };
  }

  const { data, error } = await supabase
    .from("timesheet_time_entries")
    .select("date, hours")
    .eq("user_id", user.id)
    .gte("date", query.startDate)
    .lte("date", query.endDate)
    .order("date", { ascending: true });

  if (error) {
    return {
      ok: false,
      error: `Couldn't load timesheet entries: ${error.message}`,
    };
  }

  const byDate = new Map<string, number>();
  for (const row of data ?? []) {
    const date = String(row.date ?? "").slice(0, 10);
    const hours = Number(row.hours);
    if (!date || !Number.isFinite(hours)) continue;
    byDate.set(date, roundHours((byDate.get(date) ?? 0) + hours));
  }

  const days: TimesheetDayRow[] = [...byDate.entries()].map(([date, hours]) => ({
    date,
    day: weekdayName(date),
    hours,
  }));

  const totalHours = roundHours(days.reduce((sum, d) => sum + d.hours, 0));

  return {
    ok: true,
    result: {
      employeeName: user.name,
      startDate: query.startDate,
      endDate: query.endDate,
      label: query.label,
      days,
      totalHours,
    },
  };
}
