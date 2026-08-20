"use client";

import { useState } from "react";
import Link from "next/link";
import {
  packageForGradeLevel,
  STUDENT_GRADE_OPTIONS,
} from "@/lib/experts/student-packages";

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
};

export default function GradeLevelSelect({ value, onChange, id }: Props) {
  const known = STUDENT_GRADE_OPTIONS.some((option) => option.value === value);
  const [customMode, setCustomMode] = useState(() => Boolean(value) && !known);
  const selectValue = known ? value : (value || customMode) ? "other" : "";
  const pkg = packageForGradeLevel(value);

  return (
    <div className="space-y-2">
      <select
        id={id}
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "other") {
            setCustomMode(true);
            if (known) onChange("");
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
        className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
      >
        <option value="">Select grade</option>
        {STUDENT_GRADE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value="other">Other / custom</option>
      </select>
      {selectValue === "other" ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
          placeholder="e.g. freshman, year 9"
        />
      ) : null}
      {pkg?.status === "available" && pkg.expertId ? (
        <p className="text-xs text-ink-muted">
          {pkg.title} is ready — install it under{" "}
          <Link href="/experts" className="font-semibold text-brand hover:text-brand-dark">
            Experts
          </Link>{" "}
          for help with typical {pkg.label} material.
        </p>
      ) : pkg?.status === "coming-soon" ? (
        <p className="text-xs text-ink-muted">
          A {pkg.title} is coming soon. You can still save syllabi and ask Gideon from this vault.
        </p>
      ) : null}
    </div>
  );
}
