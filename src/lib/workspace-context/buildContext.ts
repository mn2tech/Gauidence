import "server-only";

import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { RetrievedChunk } from "@/lib/vault/retrieve";
import { formatRetrievalContext } from "@/lib/vault/indexDocument";
import { wantsShowPictures } from "@/lib/vault/images";
import { loadVaultFileInventoryContext } from "@/lib/vault/loadInventory";
import { mergePinnedChunks } from "@/lib/vault/retrieve";
import { embedQuery } from "@/lib/vault/embeddings";
import { hybridRetrieveVaultChunks } from "@/lib/vault/hybridRetrieval";
import { getEmbeddingCacheStats } from "@/lib/vault/embeddingCache";
import {
  hashQueryForDiagnostics,
  logRetrievalDiagnostics,
} from "@/lib/vault/retrievalDiagnostics";
import { isKnowledgeEngineV2Enabled } from "@/lib/features/knowledge-engine-v2";
import { retrieveStructuredKnowledge } from "@/lib/knowledge/v2/retrieve";
import { formatKnowledgeForGideon } from "@/lib/knowledge/v2/formatForGideon";
import {
  formatClientRequestsForGideon,
  loadActiveClientRequestsForGideon,
  mergeClientRequestsForGideon,
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
import { wantsDailyLogCapture } from "@/lib/logs/propose";
import { wantsWorkMemoryUpdate } from "@/lib/work-memory/propose";
import { wantsClientRequestReply } from "@/lib/client-requests/propose";
import {
  wantsClientRequestCreate,
  clientRequestCreateSystemNote,
  formatClientVaultCatalog,
} from "@/lib/client-requests/proposeCreate";
import type { AttachedVaultDocument } from "@/lib/vault/attachedDocument";
import { isOrgStyleProfile, type GuardianProfileType } from "@/lib/profiles/types";
import { collaboratorDisplayName } from "@/lib/profiles/collaboratorDisplay";
import { loadCollaboratorMemberAccounts } from "@/lib/profiles/collaboratorMembers";
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
  const dailyLogCaptureAgent = wantsDailyLogCapture(question);
  const workMemoryUpdateAgent = wantsWorkMemoryUpdate(question, {
    focusedWorkProject: Boolean(workProjectId),
  });
  const clientRequestReplyAgent = wantsClientRequestReply(question);
  const clientRequestCreateAgent = wantsClientRequestCreate(question);

  const contextBuildStarted = Date.now();
  let embeddingDurationMs = 0;
  let retrievalDurationMs = 0;
  let vectorCandidateCount = 0;
  let keywordCandidateCount = 0;
  let mergedCandidateCount = 0;
  let knowledgeCandidateCount = 0;

  const embeddingStarted = Date.now();
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
  embeddingDurationMs = Date.now() - embeddingStarted;

  const matchCount = showPictures ? 10 : 8;
  const rollupScopes: LinkedVaultProfile[] = retrievalScopes.map((scope) => ({
    id: scope.id,
    display_name: scope.display_name,
    profile_type:
      scope.profile_type ??
      (activeProfile.profile_type as GuardianProfileType),
  }));

  let retrievedChunks: RetrievedChunk[] = [];
  if (queryEmbedding) {
    const retrievalStarted = Date.now();
    const hybrid = await hybridRetrieveVaultChunks({
      supabase,
      query: retrievalQuestion,
      queryEmbedding,
      scopes: rollupScopes,
      finalTopK: matchCount,
    });
    retrievalDurationMs = Date.now() - retrievalStarted;
    vectorCandidateCount = hybrid.vectorCount;
    keywordCandidateCount = hybrid.keywordCount;
    mergedCandidateCount = hybrid.mergedCount;
    retrievedChunks = hybrid.results;
  }

  const chunks = mergePinnedChunks(attachedDoc?.chunks ?? [], retrievedChunks);
  const formatted = formatRetrievalContext(chunks);

  let structuredKnowledgeContext = "(none)";
  if (isKnowledgeEngineV2Enabled()) {
    const knowledge = await retrieveStructuredKnowledge(supabase, {
      question: retrievalQuestion,
      profileIds: searchProfileIds,
    });
    knowledgeCandidateCount = knowledge.facts.length;
    structuredKnowledgeContext = formatKnowledgeForGideon(
      knowledge,
      profileNames
    );
  }

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
  const includeActiveRequests =
    clientProfileIds.length > 0 &&
    (clientRequestReplyAgent ||
      clientRequestCreateAgent ||
      isOrgStyleProfile(activeProfile.profile_type) ||
      /\b(request|requests|ticket|client)\b/i.test(retrievalQuestion));
  const activeRequests = includeActiveRequests
    ? await loadActiveClientRequestsForGideon(
        supabase,
        clientProfileIds,
        retrievalScopes.length > 1 ? 8 : 6
      )
    : [];
  const mergedRequests = mergeClientRequestsForGideon(
    clientRequests,
    activeRequests,
    retrievalScopes.length > 1 ? 8 : 6
  );
  const assigneeIds = [
    ...new Set(
      mergedRequests
        .map((r) => r.assigned_to_user_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  const requestAssigneeAccounts =
    assigneeIds.length > 0
      ? await loadCollaboratorMemberAccounts(assigneeIds)
      : new Map();
  const requestAssigneeNames = Object.fromEntries(
    assigneeIds.map((id) => [
      id,
      collaboratorDisplayName(requestAssigneeAccounts.get(id)),
    ])
  );
  const clientRequestContext = formatClientRequestsForGideon(
    mergedRequests,
    profileNames,
    requestAuthorNames,
    requestAssigneeNames
  );

  const fileInventoryContext = await loadVaultFileInventoryContext(
    supabase,
    searchProfileIds,
    profileNames,
    retrievalQuestion
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
    meta.searchScope === "global" && retrievalScopes.length > 1
      ? `${GIDEON_CROSS_VAULT_NOTE}

Active vault in the UI: ${activeProfile.display_name}. Document search includes all ${retrievalScopes.length} vaults you can access (${retrievalScopes.map((s) => s.display_name).join(", ")}).`
      : retrievalScopes.length > 1
        ? `Search includes ${retrievalScopes.map((s) => s.display_name).join(", ")} for this chat. Attribute facts to the correct vault.`
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
      structuredKnowledge: structuredKnowledgeContext,
    },
    promptOptions: {
      timeZone,
      showPictures,
      reminderAgent,
      dailyLogCaptureAgent,
      workMemoryUpdateAgent,
      clientRequestReplyAgent,
      clientRequestCreateAgent,
      transcriptionMode,
      hasAttachedDocument: Boolean(attachedDoc),
      allVaultsNote,
      vaultEmptyNote,
      focusedWorkMemory: Boolean(focusedWorkMemory),
      agentMode: false,
      fullLogQuote,
    },
  };

  const contextBuildDurationMs = Date.now() - contextBuildStarted;
  logRetrievalDiagnostics({
    searchScope: meta.searchScope,
    profileIds: searchProfileIds,
    queryHash: hashQueryForDiagnostics(retrievalQuestion),
    vectorCandidateCount,
    keywordCandidateCount,
    mergedCandidateCount,
    selectedEvidenceCount: chunks.length,
    retrievalDurationMs,
    embeddingDurationMs,
    contextBuildDurationMs,
    embeddingCache: getEmbeddingCacheStats(),
    knowledgeCandidateCount,
  });

  return { context, chunks };
}
