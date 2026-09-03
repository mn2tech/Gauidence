import type { TimesheetHoursResult } from "./query";

function formatHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
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
