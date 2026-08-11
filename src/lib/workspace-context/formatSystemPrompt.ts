import "server-only";

import {
  buildGideonTodayNote,
  GIDEON_ATTACHED_DOCUMENT_NOTE,
  GIDEON_TRANSCRIPTION_NOTE,
  withVaultPersonality,
} from "@/lib/vault/gideon";
import { VAULT_CHAT_SYSTEM } from "@/lib/vault/indexDocument";
import { getContainerLabel } from "@/lib/profiles/containerLabels";
import { collectActionSystemNotes } from "@/lib/actions/runner";
import type { ActionContext } from "@/lib/actions/types";
import { AGENT_MODE_SYSTEM_NOTE } from "@/lib/agent-mode";
import {
  clientRequestCreateSystemNote,
  formatClientVaultCatalog,
} from "@/lib/client-requests/proposeCreate";
import {
  spaceCreateSystemNote,
  formatSpaceCreateCatalog,
} from "@/lib/profiles/proposeCreate";
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
    fullLogQuote,
  } = promptOptions;

  const pictureNote = showPictures
    ? `The user wants to see pictures. Prefer naming image file names from the retrieved excerpts (jpg/png/webp/etc.) so the UI can display them. If no image files were retrieved, say so clearly.`
    : "";

  const actionNotes = actionContext
    ? collectActionSystemNotes(actionContext)
    : "";
  const clientProfileIds = context.retrievalScopes
    .filter((scope) => scope.profile_type === "client")
    .map((scope) => scope.id);
  const clientRequestCreateNote = context.promptOptions.clientRequestCreateAgent
    ? `\n${clientRequestCreateSystemNote(
        formatClientVaultCatalog(clientProfileIds, context.profileNames),
        activeProfile.id,
        activeProfile.profile_type
      )}\n`
    : "";
  const spaceCreateNote = context.promptOptions.spaceCreateAgent
    ? `\n${spaceCreateSystemNote(
        formatSpaceCreateCatalog(context.accessibleProfiles),
        activeProfile.id,
        activeProfile.display_name
      )}\n`
    : "";
  const agentNote = agentMode ? `\n${AGENT_MODE_SYSTEM_NOTE}\n` : "";
  const transcriptionNote = transcriptionMode ? GIDEON_TRANSCRIPTION_NOTE : "";
  const attachedNote = hasAttachedDocument ? GIDEON_ATTACHED_DOCUMENT_NOTE : "";
  const fullLogNote = fullLogQuote
    ? `The user asked for the full Daily Log or client request text. Quote the complete matching entry verbatim from RETRIEVED DAILY LOGS or CLIENT REQUESTS below. Do not paraphrase, shorten, or invent log content. If no matching entry is present in those blocks, say so clearly.`
    : "";
  const ontologyNote =
    blocks.ontology.trim() && blocks.ontology.trim() !== "(none)"
      ? `When ONTOLOGY has matches, always answer using those entities and relationships — including when the user sends a short name or keyword (for example "Onyx"). Summarize the match and key connections in 2–5 sentences. Never return a blank reply when ONTOLOGY is non-empty.`
      : "";

  return `${withVaultPersonality(VAULT_CHAT_SYSTEM, profileKind)}

USER-FACING TERMINOLOGY (strict): In every reply to the user, say "space" or "workspace" — never "vault". Source tags like space:Name below are internal metadata only.

Active ${getContainerLabel(activeProfile.profile_type).toLowerCase()}: ${activeProfile.display_name}.
${buildGideonTodayNote(new Date(), timeZone)}
${allVaultsNote}
${pictureNote}
${vaultEmptyNote}
${fullLogNote}
${ontologyNote}
${actionNotes}
${clientRequestCreateNote}
${spaceCreateNote}
${agentNote}
${transcriptionNote}
${attachedNote}

--- RETRIEVED EXCERPTS ---
${blocks.excerpts}
--- END EXCERPTS ---

--- SPACE FILE INVENTORY (complete list of uploaded files in scope; use for "what's uploaded" questions) ---
${blocks.fileInventory}
--- END SPACE FILE INVENTORY ---

--- ATTACHED DOCUMENT (user sent with this message) ---
${blocks.attachedDocument}
--- END ATTACHED DOCUMENT ---

--- RETRIEVED DAILY LOGS (user-entered notes; space owner labeled when linked) ---
${blocks.dailyLogs}
--- END DAILY LOGS ---

--- CLIENT REQUESTS (structured issues/requirements from client spaces; includes recent replies) ---
${blocks.clientRequests}
--- END CLIENT REQUESTS ---

--- PROPOSALS (business quotes and estimates for client spaces) ---
${blocks.proposals}
--- END PROPOSALS ---

--- UPCOMING SCHEDULE (saved reminders and document deadlines; space owner labeled when linked) ---
${blocks.schedule}
--- END UPCOMING SCHEDULE ---

--- LINKED PROFILE STRUCTURE ---
${blocks.linkedProfiles}
--- END LINKED PROFILE STRUCTURE ---

--- SPACE MAP STRUCTURE (account hierarchy; use for Space Map / parent-child questions) ---
${blocks.vaultMap}
--- END SPACE MAP STRUCTURE ---

--- WORK MEMORY (user's active projects and recent sessions) ---
${blocks.workMemory}
--- END WORK MEMORY ---

--- STRUCTURED KNOWLEDGE (verified facts from the knowledge graph; always cite the source document named here — do not state facts without source provenance) ---
${blocks.structuredKnowledge}
--- END STRUCTURED KNOWLEDGE ---

--- ONTOLOGY (business entities, one-hop relationships, and up to two-hop paths from this space; prefer for who/what is connected questions; cite EVIDENCE when using these facts) ---
${blocks.ontology}
--- END ONTOLOGY ---`;
}

/** Suggested max tokens based on prompt options. */
export function gideonMaxTokens(context: WorkspaceContextData): number {
  const {
    reminderAgent,
    dailyLogCaptureAgent,
    workMemoryUpdateAgent,
    clientRequestReplyAgent,
    clientRequestCreateAgent,
    spaceCreateAgent,
    transcriptionMode,
    agentMode,
    fullLogQuote,
  } = context.promptOptions;
  if (agentMode || fullLogQuote) return 1400;
  if (
    reminderAgent ||
    dailyLogCaptureAgent ||
    workMemoryUpdateAgent ||
    clientRequestReplyAgent ||
    clientRequestCreateAgent ||
    spaceCreateAgent
  ) {
    return 1100;
  }
  if (transcriptionMode) return 1200;
  return 900;
}
