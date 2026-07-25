/** Curated IANA zones for the settings picker (value = IANA id). */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Pacific/Honolulu", label: "US Hawaii" },
  { value: "America/Anchorage", label: "US Alaska" },
  { value: "America/Los_Angeles", label: "US Pacific" },
  { value: "America/Denver", label: "US Mountain" },
  { value: "America/Chicago", label: "US Central" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "America/Toronto", label: "Canada Eastern" },
  { value: "America/Vancouver", label: "Canada Pacific" },
  { value: "America/Sao_Paulo", label: "Brazil" },
  { value: "Europe/London", label: "United Kingdom" },
  { value: "Europe/Paris", label: "Central Europe" },
  { value: "Europe/Berlin", label: "Germany" },
  { value: "Africa/Lagos", label: "West Africa" },
  { value: "Africa/Johannesburg", label: "South Africa" },
  { value: "Asia/Dubai", label: "Gulf (UAE)" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "Asia/Bangkok", label: "Southeast Asia" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Tokyo", label: "Japan" },
  { value: "Asia/Seoul", label: "Korea" },
  { value: "Australia/Sydney", label: "Australia Eastern" },
  { value: "Australia/Perth", label: "Australia Western" },
  { value: "Pacific/Auckland", label: "New Zealand" },
  { value: "UTC", label: "UTC" },
];

export function timezoneOptionLabel(value: string): string {
  const hit = TIMEZONE_OPTIONS.find((o) => o.value === value);
  if (hit) return hit.label;
  return value.replace(/_/g, " ");
}
