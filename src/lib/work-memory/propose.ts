import {
  isWorkProjectStatus,
  WORK_STATUS_LABELS,
  type WorkProjectStatus,
} from "@/lib/work-memory/types";

export type ProposedWorkMemoryUpdate = {
  projectId: string;
  status?: WorkProjectStatus;
  mission?: string;
  currentStep?: string;
  nextAction?: string;
  blockers?: string;
};

const WORK_MEMORY_UPDATE_INTENT =
  /\b(update|save|mark|set|record)\b.{0,48}\b(project|work\s*memory|status|next\s*(?:step|action)|current\s*step|blockers?|mission)\b/i;

const FOCUSED_UPDATE_INTENT =
  /\b(update|save|mark|set|record)\b/i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when the user wants Gideon to propose a Work Memory project update. */
export function wantsWorkMemoryUpdate(
  question: string,
  options?: { focusedWorkProject?: boolean }
): boolean {
  const q = question.trim();
  if (!q) return false;
  if (WORK_MEMORY_UPDATE_INTENT.test(q)) return true;
  if (options?.focusedWorkProject && FOCUSED_UPDATE_INTENT.test(q)) return true;
  return false;
}

export function workMemoryUpdateSystemNote(
  focusedProjectId?: string | null
): string {
  const focusLine = focusedProjectId
    ? `The user is continuing from Work Memory project id ${focusedProjectId}. Use that id as project_id in the proposal.`
    : "Use the project id from WORK MEMORY when you know which project to update.";
  return `Work Memory update mode:
The user wants to update a Work Memory project. Answer briefly, then if you can determine concrete field updates from the conversation or WORK MEMORY, end with exactly:

## PROPOSED WORK MEMORY UPDATE
project_id: <uuid>
status: in_progress | waiting | blocked | done
current_step: <optional one line>
next_action: <optional one line>
blockers: <optional one line>
mission: <optional one line>

Include only fields that should change. ${focusLine} Valid status values: in_progress, waiting, blocked, done (map "ready" to waiting). Never invent project facts — omit the section if you cannot name a project and at least one field to update. Do not update the project yourself — the user will confirm in the app.`;
}

const SECTION_START = /^#{1,3}\s*PROPOSED WORK MEMORY UPDATE\s*$/i;

function trimField(value: string | undefined, max = 2000): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * Pull a structured Work Memory update from Gideon markdown, if present and valid.
 */
export function parseProposedWorkMemoryUpdate(
  content: string,
  fallbackProjectId?: string | null
): ProposedWorkMemoryUpdate | null {
  const lines = content.split(/\r?\n/);
  const i = lines.findIndex((line) => SECTION_START.test(line.trim()));
  if (i < 0) return null;

  const fields: Record<string, string> = {};
  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j]!.trim();
    if (!line) continue;
    if (/^#{1,3}\s+/.test(line)) break;
    const m =
      /^(project_id|status|current_step|next_action|blockers|mission)\s*:\s*(.+)$/i.exec(
        line
      );
    if (m) {
      fields[m[1]!.toLowerCase().replace(/_/g, "")] = m[2]!.trim();
    }
  }

  const projectId = (fields.projectid ?? fallbackProjectId ?? "").trim();
  if (!UUID_RE.test(projectId)) return null;

  const statusRaw = (fields.status ?? "").trim().toLowerCase();
  let status: WorkProjectStatus | undefined;
  if (statusRaw === "ready") {
    status = "waiting";
  } else if (isWorkProjectStatus(statusRaw)) {
    status = statusRaw;
  }

  const mission = trimField(fields.mission);
  const currentStep = trimField(fields.currentstep);
  const nextAction = trimField(fields.nextaction);
  const blockers = trimField(fields.blockers);

  if (!status && !mission && !currentStep && !nextAction && !blockers) {
    return null;
  }

  return {
    projectId,
    ...(status ? { status } : {}),
    ...(mission ? { mission } : {}),
    ...(currentStep ? { currentStep } : {}),
    ...(nextAction ? { nextAction } : {}),
    ...(blockers ? { blockers } : {}),
  };
}

/** Remove the proposal section so it is not shown as normal chat text. */
export function stripProposedWorkMemoryUpdateSection(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (SECTION_START.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^#{1,3}\s+\S/.test(line.trim())) {
        skipping = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}

export function proposedWorkMemoryUpdateSummary(
  proposal: ProposedWorkMemoryUpdate,
  projectName?: string | null
): string {
  const parts: string[] = [];
  if (projectName?.trim()) {
    parts.push(projectName.trim());
  }
  if (proposal.status) {
    parts.push(WORK_STATUS_LABELS[proposal.status]);
  }
  if (proposal.currentStep) parts.push(`Step: ${proposal.currentStep}`);
  if (proposal.nextAction) parts.push(`Next: ${proposal.nextAction}`);
  if (proposal.blockers) parts.push(`Blockers: ${proposal.blockers}`);
  if (proposal.mission) parts.push(`Mission: ${proposal.mission}`);
  return parts.join(" · ");
}
