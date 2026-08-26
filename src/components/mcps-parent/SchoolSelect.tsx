"use client";

import { MCPS_SCHOOL_GROUPS } from "@/lib/mcps-parent/schools";

const GROUP_ORDER = [
  "high",
  "middle",
  "elementary",
  "special",
  "technical",
  "alternative",
  "early",
  "charter",
] as const;

export default function SchoolSelect({
  id = "school",
  value,
  onChange,
  required,
  className,
  placeholder = "Select your school",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const known = new Set(
    GROUP_ORDER.flatMap((key) => MCPS_SCHOOL_GROUPS[key]?.schools ?? [])
  );
  const showLegacy =
    value.trim().length > 0 &&
    ![...known].some((s) => s.toLowerCase() === value.trim().toLowerCase());

  return (
    <select
      id={id}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
      }
    >
      <option value="" disabled={required !== false}>
        {placeholder}
      </option>
      {showLegacy ? (
        <option value={value}>{value} (saved)</option>
      ) : null}
      {GROUP_ORDER.map((key) => {
        const group = MCPS_SCHOOL_GROUPS[key];
        if (!group?.schools.length) return null;
        return (
          <optgroup key={key} label={group.label}>
            {group.schools.map((school) => (
              <option key={school} value={school}>
                {school}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}
