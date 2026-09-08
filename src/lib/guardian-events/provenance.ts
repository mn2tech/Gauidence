/**
 * Provenance helpers — original evidence must always be traceable.
 */

import type { GuardianEvent, GuardianEventMetadata } from "./types";

export type GuardianEventSourceRef = {
  sourceType: string;
  sourceId: string | null;
  label: string;
};

function formatLogDateLabel(logDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(logDate.trim());
  if (!m) return logDate;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = months[Number(m[2]) - 1];
  const day = Number(m[3]);
  const year = m[1];
  if (!month) return logDate;
  return `${month} ${day}, ${year}`;
}

/**
 * Human-readable source line for History / event detail.
 * Never invents a source when provenance fields are missing.
 */
export function formatGuardianEventSourceLabel(
  event: Pick<GuardianEvent, "source_type" | "source_id" | "metadata">
): string {
  const meta = (event.metadata ?? {}) as GuardianEventMetadata;
  if (typeof meta.source_label === "string" && meta.source_label.trim()) {
    return meta.source_label.trim();
  }

  switch (event.source_type) {
    case "daily_log": {
      const logDate =
        typeof meta.log_date === "string" ? meta.log_date : null;
      if (logDate) {
        return `Daily Log — ${formatLogDateLabel(logDate)}`;
      }
      return "Daily Log";
    }
    case "document":
      return "Uploaded document";
    case "email":
      return "Email";
    case "manual":
    case "tell_guardian":
      return "Manual note";
    case "guardian_item":
      return "Guardian Item";
    case "reminder":
      return "Reminder";
    default:
      return event.source_type.replace(/_/g, " ");
  }
}

export function getGuardianEventSourceRef(
  event: Pick<GuardianEvent, "source_type" | "source_id" | "metadata">
): GuardianEventSourceRef {
  return {
    sourceType: event.source_type,
    sourceId: event.source_id,
    label: formatGuardianEventSourceLabel(event),
  };
}
