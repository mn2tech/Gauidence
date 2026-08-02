import "server-only";

import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { RetrievedChunk } from "@/lib/vault/retrieve";
import { formatRetrievalContext } from "@/lib/vault/indexDocument";
import { wantsShowPictures } from "@/lib/vault/images";
import { formatVaultFileListForGideon } from "@/lib/vault/askInventory";
import { retrieveAllAccessibleVaultChunks } from "@/lib/vault/rollup";
import { mergePinnedChunks } from "@/lib/vault/retrieve";
import { embedQuery } from "@/lib/vault/embeddings";
import {
  formatClientRequestsForGideon,
  retrieveRelevantClientRequests,
} from "@/lib/client-requests/retrieve";
import {
  formatDailyLogsForGideon,
  retrieveRelevantDailyLogs,
} from "@/lib/logs/retrieve";
import {
  formatAlertsForGideon,
  retrieveUpcomingAlertsForGideon,
} from "@/lib/reminders/retrieve";
import { formatWorkMemoryForGideon } from "@/lib/work-memory/context";
import {
  loadWorkMemoryForGideon,
  loadWorkMemoryProjectForGideon,
} from "@/lib/work-memory/server";
import { formatVaultMapForGideon } from "@/lib/profiles/vaultMap";
import {
  firstNameFrom,
  GIDEON_CROSS_VAULT_NOTE,
  wantsTranscription,
} from "@/lib/vault/gideon";
import {
  expandRetrievalQuestion,
  wantsFullDailyLogQuote,
  type ChatTurn,
} from "@/lib/vault/expandRetrievalQuestion";
import { wantsReminderAgent } from "@/lib/reminders/propose";
import type { AttachedVaultDocument } from "@/lib/vault/attachedDocument";
import type { GuardianProfileType } from "@/lib/profiles/types";
import type { LinkedVaultProfile } from "@/lib/vault/rollup";
import { loadLinkedOrgContext } from "./linkedProfiles";
import type { WorkspaceContextData, WorkspaceContextMeta } from "./types";

export type LoadWorkspaceContextArgs = {
  supabase: SupabaseClient;
  user: User;
  meta: WorkspaceContextMeta;
  question: string;
  timeZone: string;
  workProjectId?: string;
  attachedDoc?: AttachedVaultDocument | null;
  chunkCount?: number;
  chatHistory?: ChatTurn[];
};

export type WorkspaceContextResult = {
  context: WorkspaceContextData;
  chunks: RetrievedChunk[];
};

/** Fetch retrieval results and formatted context blocks for Gideon. */
export async function loadWorkspaceContext(
  args: LoadWorkspaceContextArgs
): Promise<WorkspaceContextResult> {
  const {
    supabase,
    user,
    meta,
    question,
    timeZone,
    workProjectId = "",
    attachedDoc = null,
    chunkCount = 0,
    chatHistory = [],
  } = args;

  const retrievalQuestion = expandRetrievalQuestion(question, chatHistory);
  const fullLogQuote = wantsFullDailyLogQuote(question);
  const { activeProfile, retrievalScopes, searchProfileIds, profileNames } =
    meta;
  const showPictures = wantsShowPictures(question);
  const transcriptionMode = wantsTranscription(question);
  const reminderAgent = wantsReminderAgent(question);

  const queryEmbedding =
    chunkCount > 0
      ? await embedQuery(retrievalQuestion).catch((embedErr) => {
          console.warn(
            "Vault chat embedding failed; continuing without document search:",
            embedErr instanceof Error ? embedErr.message : "error"
          );
          return null;
        })
      : null;

  const matchCount = showPictures ? 10 : 8;
  const rollupScopes: LinkedVaultProfile[] = retrievalScopes.map((scope) => ({
    id: scope.id,
    display_name: scope.display_name,
    profile_type:
      scope.profile_type ??
      (activeProfile.profile_type as GuardianProfileType),
  }));
  const retrievedChunks = queryEmbedding
    ? await retrieveAllAccessibleVaultChunks(
        supabase,
        queryEmbedding,
        rollupScopes,
        matchCount
      )
    : [];

  const chunks = mergePinnedChunks(attachedDoc?.chunks ?? [], retrievedChunks);
  const formatted = formatRetrievalContext(chunks);

  const { logs: dailyLogs, authorNames } = await retrieveRelevantDailyLogs(
    supabase,
    {
      profileId: activeProfile.id,
      profileIds: searchProfileIds,
      profileNames,
      question: retrievalQuestion,
      limit:
        retrievalScopes.length > 1 ? (fullLogQuote ? 8 : 6) : fullLogQuote ? 6 : 4,
    }
  );
  const logContext = formatDailyLogsForGideon(
    dailyLogs,
    profileNames,
    authorNames
  );

  const clientProfileIds = retrievalScopes
    .filter((scope) => scope.profile_type === "client")
    .map((scope) => scope.id);
  const { requests: clientRequests, authorNames: requestAuthorNames } =
    await retrieveRelevantClientRequests(supabase, {
      clientProfileIds,
      profileNames,
      question: retrievalQuestion,
      limit: retrievalScopes.length > 1 ? 6 : 4,
    });
  const clientRequestContext = formatClientRequestsForGideon(
    clientRequests,
    profileNames,
    requestAuthorNames
  );

  const { data: vaultFileRows } = await supabase
    .from("documents")
    .select("file_name, mime_type, profile_id")
    .in("profile_id", searchProfileIds)
    .order("created_at", { ascending: false })
    .limit(250);

  const fileInventoryContext = formatVaultFileListForGideon(
    vaultFileRows ?? [],
    profileNames
  );

  const upcomingAlerts = await retrieveUpcomingAlertsForGideon(supabase, {
    profileIds: searchProfileIds,
    profileNames,
    question: retrievalQuestion,
    timeZone,
    limit: retrievalScopes.length > 1 ? 12 : 10,
  });
  const scheduleContext = formatAlertsForGideon(upcomingAlerts, {
    profileNames,
    timeZone,
  });

  const linkedContext = await loadLinkedOrgContext(
    supabase,
    user.id,
    activeProfile
  );

  const vaultMapOwnerLabel =
    firstNameFrom(
      user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email
    ) ?? "You";
  const vaultMapContext = formatVaultMapForGideon(
    meta.accessibleProfiles,
    vaultMapOwnerLabel,
    activeProfile.id
  );

  const focusedWorkMemory = workProjectId
    ? await loadWorkMemoryProjectForGideon(supabase, user.id, workProjectId)
    : null;
  const workMemoryBundle =
    focusedWorkMemory ??
    (await loadWorkMemoryForGideon(supabase, user.id));
  const workMemoryBody = formatWorkMemoryForGideon(
    workMemoryBundle.projects,
    workMemoryBundle.sessionsByProject
  );
  const workMemoryContext = focusedWorkMemory
    ? `The user clicked "Continue with Gideon" to resume this project. Prioritize this project's mission, step, blockers, and recent sessions.\n\n${workMemoryBody}`
    : workMemoryBody;

  const allVaultsNote =
    retrievalScopes.length > 1
      ? `${GIDEON_CROSS_VAULT_NOTE}

Active vault in the UI: ${activeProfile.display_name}. Document search includes all ${retrievalScopes.length} vaults you can access (${retrievalScopes.map((s) => s.display_name).join(", ")}).`
      : "Search this vault's documents, Daily Logs, client requests, and upcoming schedule; use GENERAL KNOWLEDGE when the vault does not contain the answer.";

  const attachedTextLimit = transcriptionMode ? 30_000 : 12_000;
  const attachedContext = attachedDoc
    ? [
        `File: ${attachedDoc.fileName}`,
        attachedDoc.sourceText
          ? `Document text (OCR/native):\n${attachedDoc.sourceText.slice(0, attachedTextLimit)}`
          : "(no extracted text — use the attached image if present)",
      ].join("\n\n")
    : "";

  const vaultEmptyNote =
    !formatted.context.trim() &&
    !attachedContext.trim() &&
    !logContext.trim() &&
    !clientRequestContext.trim() &&
    !scheduleContext.trim() &&
    !linkedContext.trim() &&
    vaultMapContext.startsWith("(no vault") &&
    fileInventoryContext.startsWith("(no documents")
      ? "No vault excerpts, Daily Logs, client requests, upcoming schedule items, or linked profile structure matched this question (or the vault is empty). Do not invent vault facts. Use ## GENERAL KNOWLEDGE for general questions, and ## GIDEON'S SUGGESTION to upload documents when that would help."
      : "";

  const context: WorkspaceContextData = {
    ...meta,
    blocks: {
      excerpts: formatted.context.trim() || "(none)",
      fileInventory: fileInventoryContext,
      attachedDocument: attachedContext.trim() || "(none)",
      dailyLogs: logContext.trim() || "(none)",
      clientRequests: clientRequestContext.trim() || "(none)",
      schedule: scheduleContext.trim() || "(none)",
      linkedProfiles: linkedContext.trim() || "(none)",
      vaultMap: vaultMapContext,
      workMemory:
        workMemoryContext.trim() ||
        "(none — user has no active work projects)",
    },
    promptOptions: {
      timeZone,
      showPictures,
      reminderAgent,
      transcriptionMode,
      hasAttachedDocument: Boolean(attachedDoc),
      allVaultsNote,
      vaultEmptyNote,
      focusedWorkMemory: Boolean(focusedWorkMemory),
      agentMode: false,
      fullLogQuote,
    },
  };

  return { context, chunks };
}
