import {
  WORK_STATUS_LABELS,
  type WorkProject,
  type WorkSession,
} from "@/lib/work-memory/types";

function line(label: string, value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return `${label}: ${v}`;
}

function formatSession(session: WorkSession): string {
  const parts = [
    `  Session ended ${new Date(session.ended_at).toLocaleString()}`,
    line("Accomplished", session.accomplished),
    line("Next step", session.next_step),
    line("Blockers", session.blockers),
    line("Notes", session.notes),
  ].filter(Boolean);
  return parts.join("\n");
}

/**
 * Structured Work Memory block for Gideon system prompts.
 */
export function formatWorkMemoryForGideon(
  projects: WorkProject[],
  sessionsByProject: Map<string, WorkSession[]>
): string {
  if (projects.length === 0) return "";

  const blocks = projects.map((project) => {
    const lines = [
      `Project: ${project.name} (${WORK_STATUS_LABELS[project.status]})`,
      line("Mission", project.mission),
      line("Current step", project.current_step),
      line("Next action", project.next_action),
      line("Blockers", project.blockers),
      project.last_activity_at
        ? `Last activity: ${new Date(project.last_activity_at).toLocaleString()}`
        : null,
    ].filter(Boolean);

    const sessions = sessionsByProject.get(project.id) ?? [];
    if (sessions.length > 0) {
      lines.push("Recent sessions:");
      for (const s of sessions) {
        lines.push(formatSession(s));
      }
    }

    return lines.join("\n");
  });

  return blocks.join("\n\n");
}
