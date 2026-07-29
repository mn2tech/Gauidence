import type { RecruitStep, WorkMode } from "./types";
import { WORK_MODES, RECRUIT_STEPS } from "./types";

export function parseJobTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 200 ? trimmed : null;
}

export function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function parseWorkMode(value: unknown): WorkMode | null {
  if (typeof value !== "string") return null;
  return WORK_MODES.includes(value as WorkMode) ? (value as WorkMode) : null;
}

export function parseRecruitStep(value: unknown): RecruitStep | null {
  if (typeof value !== "string") return null;
  return RECRUIT_STEPS.includes(value as RecruitStep)
    ? (value as RecruitStep)
    : null;
}

export function parseJobFields(body: Record<string, unknown>) {
  return {
    title: parseJobTitle(body.title),
    department:
      typeof body.department === "string" ? body.department.trim() || null : null,
    hiring_manager:
      typeof body.hiring_manager === "string"
        ? body.hiring_manager.trim() || null
        : null,
    job_description:
      typeof body.job_description === "string" ? body.job_description : "",
    required_skills: parseStringArray(body.required_skills),
    preferred_skills: parseStringArray(body.preferred_skills),
    min_years_experience:
      typeof body.min_years_experience === "number"
        ? body.min_years_experience
        : null,
    required_education:
      typeof body.required_education === "string"
        ? body.required_education.trim() || null
        : null,
    required_certifications: parseStringArray(body.required_certifications),
    location:
      typeof body.location === "string" ? body.location.trim() || null : null,
    work_mode: parseWorkMode(body.work_mode),
    employment_type:
      typeof body.employment_type === "string"
        ? body.employment_type.trim() || null
        : null,
    work_authorization_requirement:
      typeof body.work_authorization_requirement === "string"
        ? body.work_authorization_requirement.trim() || null
        : null,
    salary_range:
      typeof body.salary_range === "string"
        ? body.salary_range.trim() || null
        : null,
    shortlist_count:
      typeof body.shortlist_count === "number"
        ? Math.min(50, Math.max(1, Math.round(body.shortlist_count)))
        : 5,
    current_step: parseRecruitStep(body.current_step),
  };
}
