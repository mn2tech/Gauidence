export const WORK_PROJECT_STATUSES = [
  "in_progress",
  "waiting",
  "blocked",
  "done",
  "archived",
] as const;

export type WorkProjectStatus = (typeof WORK_PROJECT_STATUSES)[number];

export type WorkProject = {
  id: string;
  owner_user_id: string;
  profile_id: string | null;
  name: string;
  status: WorkProjectStatus;
  mission: string | null;
  current_step: string | null;
  next_action: string | null;
  blockers: string | null;
  priority: number;
  estimated_resume_minutes: number | null;
  resume_context: Record<string, unknown> | null;
  last_activity_at: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkSession = {
  id: string;
  project_id: string;
  owner_user_id: string;
  started_at: string | null;
  ended_at: string;
  accomplished: string | null;
  next_step: string | null;
  blockers: string | null;
  notes: string | null;
  created_at: string;
};

export const WORK_PROJECT_SELECT =
  "id, owner_user_id, profile_id, name, status, mission, current_step, next_action, blockers, priority, estimated_resume_minutes, resume_context, last_activity_at, last_opened_at, created_at, updated_at";

export const WORK_SESSION_SELECT =
  "id, project_id, owner_user_id, started_at, ended_at, accomplished, next_step, blockers, notes, created_at";

export const WORK_STATUS_LABELS: Record<WorkProjectStatus, string> = {
  in_progress: "In progress",
  waiting: "Waiting",
  blocked: "Blocked",
  done: "Done",
  archived: "Archived",
};

export function isWorkProjectStatus(v: unknown): v is WorkProjectStatus {
  return (
    typeof v === "string" &&
    (WORK_PROJECT_STATUSES as readonly string[]).includes(v)
  );
}

export function workProjectAskHref(project: {
  id: string;
  profile_id: string | null;
}): string {
  const params = new URLSearchParams({ projectId: project.id });
  if (project.profile_id) params.set("profileId", project.profile_id);
  return `/ask?${params.toString()}`;
}

export function formatWorkActivity(when: string | null | undefined): string {
  if (!when) return "No activity yet";
  const date = new Date(when);
  if (Number.isNaN(date.getTime())) return "No activity yet";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (date >= startOfToday) return `Today ${time}`;
  if (date >= startOfYesterday) return `Yesterday ${time}`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
