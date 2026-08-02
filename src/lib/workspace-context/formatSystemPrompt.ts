import {
  buildGideonTodayNote,
  GIDEON_ATTACHED_DOCUMENT_NOTE,
  GIDEON_TRANSCRIPTION_NOTE,
  withVaultPersonality,
} from "@/lib/vault/gideon";
import { VAULT_CHAT_SYSTEM } from "@/lib/vault/indexDocument";
import { collectActionSystemNotes } from "@/lib/actions/runner";
import type { ActionContext } from "@/lib/actions/types";
import { AGENT_MODE_SYSTEM_NOTE } from "@/lib/agent-mode";
import type { WorkspaceContextData } from "./types";

/** Assemble Gideon's full system prompt from workspace context. */
export function buildGideonSystemPrompt(
  context: WorkspaceContextData,
  actionContext?: ActionContext
): string {
  const { activeProfile, blocks, promptOptions, profileKind } = context;
  const {
    timeZone,
    showPictures,
    transcriptionMode,
    hasAttachedDocument,
    allVaultsNote,
    vaultEmptyNote,
    agentMode,
  } = promptOptions;

  const pictureNote = showPictures
    ? `The user wants to see pictures. Prefer naming image file names from the retrieved excerpts (jpg/png/webp/etc.) so the UI can display them. If no image files were retrieved, say so clearly.`
    : "";

  const actionNotes = actionContext
    ? collectActionSystemNotes(actionContext)
    : "";
  const agentNote = agentMode ? `\n${AGENT_MODE_SYSTEM_NOTE}\n` : "";
  const transcriptionNote = transcriptionMode ? GIDEON_TRANSCRIPTION_NOTE : "";
  const attachedNote = hasAttachedDocument ? GIDEON_ATTACHED_DOCUMENT_NOTE : "";

  return `${withVaultPersonality(VAULT_CHAT_SYSTEM, profileKind)}

Active profile: ${activeProfile.display_name} (${activeProfile.profile_type}).
${buildGideonTodayNote(new Date(), timeZone)}
${allVaultsNote}
${pictureNote}
${vaultEmptyNote}
${actionNotes}
${agentNote}
${transcriptionNote}
${attachedNote}

--- RETRIEVED EXCERPTS ---
${blocks.excerpts}
--- END EXCERPTS ---

--- VAULT FILE INVENTORY (complete list of uploaded files in scope; use for "what's uploaded" questions) ---
${blocks.fileInventory}
--- END VAULT FILE INVENTORY ---

--- ATTACHED DOCUMENT (user sent with this message) ---
${blocks.attachedDocument}
--- END ATTACHED DOCUMENT ---

--- RETRIEVED DAILY LOGS (user-entered notes; vault owner labeled when linked) ---
${blocks.dailyLogs}
--- END DAILY LOGS ---

--- UPCOMING SCHEDULE (saved reminders and document deadlines; vault owner labeled when linked) ---
${blocks.schedule}
--- END UPCOMING SCHEDULE ---

--- LINKED PROFILE STRUCTURE ---
${blocks.linkedProfiles}
--- END LINKED PROFILE STRUCTURE ---

--- VAULT MAP STRUCTURE (account hierarchy; use for vault map / parent-child questions) ---
${blocks.vaultMap}
--- END VAULT MAP STRUCTURE ---

--- WORK MEMORY (user's active projects and recent sessions) ---
${blocks.workMemory}
--- END WORK MEMORY ---`;
}

/** Suggested max tokens based on prompt options. */
export function gideonMaxTokens(context: WorkspaceContextData): number {
  const { reminderAgent, transcriptionMode, agentMode } = context.promptOptions;
  if (agentMode) return 1400;
  if (reminderAgent) return 1100;
  if (transcriptionMode) return 1200;
  return 900;
}
