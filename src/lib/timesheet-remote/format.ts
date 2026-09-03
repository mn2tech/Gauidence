import type { TimesheetHoursResult, TimesheetPeriodResult } from "./query";

function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function formatSignedHours(n: number): string {
  if (n > 0) return `+${formatHours(n)}`;
  return formatHours(n);
}

/** English answer mirroring the SQL date / day / total_hours report. */
export function formatTimesheetHoursAnswer(result: TimesheetHoursResult): string {
  const { employeeName, label, days, totalHours } = result;

  if (days.length === 0) {
    return `${employeeName} has no timesheet hours recorded for ${label}.`;
  }

  const lines = days.map(
    (d) => `${d.date} (${d.day}): ${formatHours(d.hours)} hours`
  );

  return [
    `${employeeName} worked ${formatHours(totalHours)} hours in ${label}.`,
    "",
    "By day:",
    ...lines,
    "",
    `TOTAL: ${formatHours(totalHours)} hours`,
  ].join("\n");
}

/** Pay-period rollup vs expected hours (weekends included). */
export function formatTimesheetPeriodAnswer(
  result: TimesheetPeriodResult
): string {
  const { label, expectedHours, employees } = result;

  if (employees.length === 0) {
    return `No timesheet entries found for ${label}.`;
  }

  const lines = employees.map((e) => {
    const role = e.role ? ` · ${e.role}` : "";
    return `${e.employeeName}${role}: ${formatHours(e.totalHours)} hrs (expected ${formatHours(expectedHours)}, ${formatSignedHours(e.varianceHours)}) — ${e.status}`;
  });

  const exceeded = employees.filter((e) => e.status === "Exceeded").length;
  const matched = employees.filter((e) => e.status === "Matched").length;
  const below = employees.filter((e) => e.status === "Below").length;

  return [
    `Timesheet summary for ${label} (expected ${formatHours(expectedHours)} hrs, weekends included).`,
    "",
    ...lines,
    "",
    `Employees: ${employees.length} · Exceeded ${exceeded} · Matched ${matched} · Below ${below}`,
  ].join("\n");
}
