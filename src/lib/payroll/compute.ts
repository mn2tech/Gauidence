import type { EmployeeHoursSummary } from "./types";

const STANDARD_WEEKLY_HOURS = 40;
const OVERTIME_DAILY_THRESHOLD = 8;

/** Round to 2 decimal places for payroll hours. */
export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}

/** Calculate hours between two ISO timestamps. */
export function hoursBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms <= 0) return 0;
  return roundHours(ms / (1000 * 60 * 60));
}

type TimeEntryInput = {
  employee_profile_id: string;
  employee_name: string;
  payroll_employee_id: string | null;
  entry_type?: "punch" | "manual";
  work_date?: string | null;
  manual_hours?: number | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
};

/**
 * Compute regular and overtime hours per employee for a pay period.
 * Overtime: hours beyond 8/day or 40/week (simplified weekly model).
 */
export function computeEmployeeHours(
  entries: TimeEntryInput[],
  periodStart: string,
  periodEnd: string
): EmployeeHoursSummary[] {
  const byEmployee = new Map<string, TimeEntryInput[]>();

  for (const entry of entries) {
    const list = byEmployee.get(entry.employee_profile_id) ?? [];
    list.push(entry);
    byEmployee.set(entry.employee_profile_id, list);
  }

  const summaries: EmployeeHoursSummary[] = [];

  for (const [employeeProfileId, empEntries] of byEmployee) {
    let totalHours = 0;
    let missingClockOut = false;

    for (const e of empEntries) {
      if (e.entry_type === "manual" && e.manual_hours != null) {
        totalHours += e.manual_hours;
        continue;
      }
      if (!e.clock_in_at || !e.clock_out_at) {
        if (e.clock_in_at && !e.clock_out_at) {
          missingClockOut = true;
        }
        continue;
      }
      totalHours += hoursBetween(e.clock_in_at, e.clock_out_at);
    }

    totalHours = roundHours(totalHours);
    const regularHours = roundHours(Math.min(totalHours, STANDARD_WEEKLY_HOURS));
    const overtimeHours = roundHours(Math.max(0, totalHours - STANDARD_WEEKLY_HOURS));

    const first = empEntries[0];
    summaries.push({
      employee_profile_id: employeeProfileId,
      employee_name: first.employee_name,
      payroll_employee_id: first.payroll_employee_id,
      regular_hours: regularHours,
      overtime_hours: overtimeHours,
      total_hours: totalHours,
      adjustment_hours: 0,
      adjustment_reason: null,
      owner_notes: null,
      missing_clock_out: missingClockOut,
      time_entry_count: empEntries.length,
    });
  }

  return summaries.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

export function sumReportTotals(entries: Pick<EmployeeHoursSummary, "regular_hours" | "overtime_hours" | "total_hours" | "adjustment_hours">[]) {
  let regular = 0;
  let overtime = 0;
  let total = 0;

  for (const e of entries) {
    regular += e.regular_hours;
    overtime += e.overtime_hours;
    total += e.total_hours + (e.adjustment_hours ?? 0);
  }

  return {
    total_regular_hours: roundHours(regular),
    total_overtime_hours: roundHours(overtime),
    total_hours: roundHours(total),
  };
}

export function formatPayPeriod(start: string, end: string): string {
  const fmt = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export { OVERTIME_DAILY_THRESHOLD, STANDARD_WEEKLY_HOURS };
