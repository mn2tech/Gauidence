import {
  isWorkProjectStatus,
  type WorkProjectStatus,
} from "@/lib/work-memory/types";

const TEXT_MAX = 2000;
const NAME_MAX = 120;

function trimText(v: unknown, max = TEXT_MAX): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

export function parseProjectName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > NAME_MAX ? t.slice(0, NAME_MAX) : t;
}

export function parseProjectStatus(raw: unknown): WorkProjectStatus | null {
  return isWorkProjectStatus(raw) ? raw : null;
}

export function parseOptionalProfileId(raw: unknown): string | null | undefined {
  if (raw === null || raw === "") return null;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t || null;
}

export function parseProjectFields(body: Record<string, unknown>) {
  return {
    name: parseProjectName(body.name),
    status: parseProjectStatus(body.status),
    mission: trimText(body.mission),
    current_step: trimText(body.currentStep ?? body.current_step),
    next_action: trimText(body.nextAction ?? body.next_action),
    blockers: trimText(body.blockers),
    profile_id: parseOptionalProfileId(body.profileId ?? body.profile_id),
    estimated_resume_minutes:
      typeof body.estimatedResumeMinutes === "number" &&
      body.estimatedResumeMinutes > 0
        ? Math.min(999, Math.round(body.estimatedResumeMinutes))
        : typeof body.estimated_resume_minutes === "number" &&
            body.estimated_resume_minutes > 0
          ? Math.min(999, Math.round(body.estimated_resume_minutes))
          : null,
  };
}

export function parseSessionFields(body: Record<string, unknown>) {
  return {
    accomplished: trimText(body.accomplished),
    next_step: trimText(body.nextStep ?? body.next_step),
    blockers: trimText(body.blockers),
    notes: trimText(body.notes),
    mission: trimText(body.mission),
    current_step: trimText(body.currentStep ?? body.current_step),
    next_action: trimText(body.nextAction ?? body.next_action),
    status: parseProjectStatus(body.status),
  };
}
