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
import {
  GIDEON_CALENDAR_CONFIRMATION_NOTE,
  GIDEON_CHIEF_OF_STAFF_SYSTEM,
  GIDEON_CONVERSATION_CONTEXT_NOTE,
} from "@/lib/gideon/chiefOfStaff";
import { FOCUS_BLOCK_SYSTEM_NOTE } from "@/lib/gideon/focusBlock";
import type { WorkspaceContextData } from "./types";

function blockIsPresent(text: string | undefined): boolean {
  const t = (text ?? "").trim();
  return Boolean(t) && t !== "(none)" && !t.startsWith("(none");
}

function namedBlock(
  title: string,
  body: string,
  includeEmpty: boolean
): string {
  const t = (body ?? "").trim();
  if (!t) return "";
  if (!includeEmpty && !blockIsPresent(t)) return "";
  return `\n--- ${title} ---\n${t}\n--- END ${title} ---\n`;
}

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
    intent,
    loaded,
    calendarNote,
    focusBlockNote,
    confirmationRequired,
  } = promptOptions;

  const searchedKnowledge = loaded.documents;
  const pictureNote =
    showPictures && searchedKnowledge
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
  const fullLogNote =
    fullLogQuote && loaded.logs
      ? `The user asked for the full Daily Log or client request text. Quote the complete matching entry verbatim from RETRIEVED DAILY LOGS or CLIENT REQUESTS below. Do not paraphrase, shorten, or invent log content. If no matching entry is present in those blocks, say so clearly.`
      : "";
  const ontologyNote =
    searchedKnowledge &&
    blocks.ontology.trim() &&
    blocks.ontology.trim() !== "(none)"
      ? `When ONTOLOGY has matches, always answer using those entities and relationships — including when the user sends a short name or keyword (for example "Onyx"). If INVOICE SUMMARY is present, answer in 2–5 plain sentences from that summary (amount, parties, date). Do not dump MATCHED ENTITIES or RELATIONSHIPS lists unless the user asked about connections. Never return a blank reply when ONTOLOGY is non-empty.`
      : "";

  const chiefOfStaffNote =
    intent === "chief_of_staff" || intent === "combined"
      ? `\n${GIDEON_CHIEF_OF_STAFF_SYSTEM}\n`
      : "";
  const packSkillsNote = (promptOptions.packSkillsNote ?? "").trim()
    ? `\n${promptOptions.packSkillsNote!.trim()}\n`
    : "";
  const confirmationNote = confirmationRequired
    ? `\n${GIDEON_CALENDAR_CONFIRMATION_NOTE}\n`
    : "";
  const focusNote = focusBlockNote
    ? `\n${FOCUS_BLOCK_SYSTEM_NOTE}\n${focusBlockNote}\n`
    : intent === "chief_of_staff" || intent === "combined"
      ? `\n${FOCUS_BLOCK_SYSTEM_NOTE}\n`
      : "";
  const knowledgeModeNote = searchedKnowledge
    ? ""
    : `\nNo Guardian document search ran for this turn. Do not invent files or quotes from the user's spaces.\n`;

  const retrievalBlocks = [
    namedBlock("RETRIEVED EXCERPTS", blocks.excerpts, searchedKnowledge),
    namedBlock(
      "SPACE FILE INVENTORY (complete list of uploaded files in scope; use for \"what's uploaded\" questions)",
      blocks.fileInventory,
      searchedKnowledge
    ),
    namedBlock(
      "ATTACHED DOCUMENT (user sent with this message)",
      blocks.attachedDocument,
      hasAttachedDocument
    ),
    namedBlock(
      "RETRIEVED DAILY LOGS (user-entered notes; space owner labeled when linked)",
      blocks.dailyLogs,
      searchedKnowledge
    ),
    namedBlock(
      "CLIENT REQUESTS (structured issues/requirements from client spaces; includes recent replies)",
      blocks.clientRequests,
      searchedKnowledge
    ),
    namedBlock(
      "PROPOSALS (business quotes and estimates for client spaces)",
      blocks.proposals,
      searchedKnowledge
    ),
    namedBlock(
      "UPCOMING SCHEDULE (saved reminders and document deadlines; space owner labeled when linked)",
      blocks.schedule,
      searchedKnowledge
    ),
    namedBlock("LINKED PROFILE STRUCTURE", blocks.linkedProfiles, searchedKnowledge),
    namedBlock(
      "SPACE MAP STRUCTURE (account hierarchy; use for Space Map / parent-child questions)",
      blocks.vaultMap,
      searchedKnowledge
    ),
    namedBlock(
      "WORK MEMORY (user's active projects and recent sessions)",
      blocks.workMemory,
      searchedKnowledge
    ),
    namedBlock(
      "STRUCTURED KNOWLEDGE (verified facts from the knowledge graph; always cite the source document named here — do not state facts without source provenance)",
      blocks.structuredKnowledge,
      searchedKnowledge
    ),
    namedBlock(
      "ONTOLOGY (business entities, one-hop relationships, and up to two-hop paths from this space; prefer for who/what is connected questions; cite EVIDENCE when using these facts)",
      blocks.ontology,
      searchedKnowledge
    ),
  ]
    .filter(Boolean)
    .join("");

  return `${withVaultPersonality(VAULT_CHAT_SYSTEM, profileKind)}

USER-FACING TERMINOLOGY (strict): In every reply to the user, say "space" or "workspace" — never "vault". Source tags like space:Name below are internal metadata only.
Never mention routing, intents, RAG, or vector search.

Active ${getContainerLabel(activeProfile.profile_type).toLowerCase()}: ${activeProfile.display_name}.
${buildGideonTodayNote(new Date(), timeZone)}
${GIDEON_CONVERSATION_CONTEXT_NOTE}
${chiefOfStaffNote}
${packSkillsNote}
${knowledgeModeNote}
${confirmationNote}
${focusNote}
${calendarNote}
${searchedKnowledge ? allVaultsNote : ""}
${pictureNote}
${searchedKnowledge ? vaultEmptyNote : ""}
${fullLogNote}
${ontologyNote}
${actionNotes}
${clientRequestCreateNote}
${spaceCreateNote}
${agentNote}
${transcriptionNote}
${attachedNote}
${retrievalBlocks}`;
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
    intent,
  } = context.promptOptions;
  if (intent === "chief_of_staff" || intent === "combined") return 1400;
  if (intent === "conversation") return 700;
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
  if (transcriptionMode) return 2000;
  return 900;
}
