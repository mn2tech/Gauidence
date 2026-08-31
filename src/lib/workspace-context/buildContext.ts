import "server-only";

import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { RetrievedChunk } from "@/lib/vault/retrieve";
import { formatRetrievalContext } from "@/lib/vault/indexDocument";
import { wantsShowPictures } from "@/lib/vault/images";
import { loadVaultFileInventoryContext } from "@/lib/vault/loadInventory";
import { wantsSongOrChartList } from "@/lib/vault/askInventory";
import { mergePinnedChunks } from "@/lib/vault/retrieve";
import { embedQuery } from "@/lib/vault/embeddings";
import { hybridRetrieveVaultChunks } from "@/lib/vault/hybridRetrieval";
import { loadRegulatoryDisclosureChunks } from "@/lib/vault/pinDisclosureChunks";
import { getEmbeddingCacheStats } from "@/lib/vault/embeddingCache";
import {
  hashQueryForDiagnostics,
  logRetrievalDiagnostics,
} from "@/lib/vault/retrievalDiagnostics";
import {
  expandDocumentContentRetrievalQuery,
  isDocumentContentQuestion,
} from "@/lib/gideon/documentGrounding";
import { isKnowledgeEngineV2Enabled } from "@/lib/features/knowledge-engine-v2";
import { isGuardianOntologyEnabled } from "@/lib/features/ontology";
import { retrieveStructuredKnowledge } from "@/lib/knowledge/v2/retrieve";
import { formatKnowledgeForGideon } from "@/lib/knowledge/v2/formatForGideon";
import { getOntologyContext } from "@/lib/ontology/context";
import {
  collectYouTubeUrlsFromOntology,
  formatOntologyForGideon,
} from "@/lib/ontology/formatForGideon";
import { resolveConnectorSourceCitations } from "@/lib/ontology/connectorCitations";
import type { VaultChatCitation } from "@/lib/vault/vaultChatStream";
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
import {
  formatGuardianItemsForGideon,
  retrieveGuardianItemsForGideon,
} from "@/lib/guardian-items/retrieveForGideon";
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
  isPianoOrSongLearnRequest,
  extractChartTitlesFromText,
  wantsOpenChartAttachment,
  type ChatTurn,
} from "@/lib/vault/expandRetrievalQuestion";
import { expandTranscriptionDocumentChunks } from "@/lib/vault/expandTranscriptionChunks";
import {
  filterCitationsToChordCharts,
  isLikelyChordChartFile,
} from "@/lib/ontology/connectorCitationIds";
import { entityMatchesSongTitle } from "@/lib/ontology/pipeline/chartTranscript";
import { wantsReminderAgent } from "@/lib/reminders/propose";
import { wantsDailyLogCapture } from "@/lib/logs/propose";
import { wantsWorkMemoryUpdate } from "@/lib/work-memory/propose";
import { wantsClientRequestReply } from "@/lib/client-requests/propose";
import {
  wantsClientRequestCreate,
  clientRequestCreateSystemNote,
  formatClientVaultCatalog,
} from "@/lib/client-requests/proposeCreate";
import {
  wantsSpaceCreate,
  spaceCreateSystemNote,
  formatSpaceCreateCatalog,
} from "@/lib/profiles/proposeCreate";
import { formatProposalsForGideon } from "@/lib/proposals/retrieve";
import { PROPOSAL_SELECT } from "@/lib/proposals/types";
import { mapProposalRow } from "@/lib/proposals/server";
import type { AttachedVaultDocument } from "@/lib/vault/attachedDocument";
import {
  resolveExplicitSpaceScope,
  resolveNamedSpaceOutsideSearch,
  dominantRetrievalProfileId,
} from "@/lib/vault/detectVaultScope";
import { shouldWidenWorkspaceDocumentSearch } from "@/lib/vault/widenWorkspaceSearch";
import { isOrgStyleProfile, type GuardianProfileType } from "@/lib/profiles/types";
import { collaboratorDisplayName } from "@/lib/profiles/collaboratorDisplay";
import { isGuardianPackEngineEnabled } from "@/lib/features/packs";
import {
  businessPackSkillPromptNote,
  dentalPackSkillPromptNote,
  isBusinessAdvisoryQuestion,
  isBusinessKnowledgeQuestion,
  isDentalAdvisoryQuestion,
  isDentalKnowledgeQuestion,
} from "@/lib/packs/gideon";
import {
  biPlanRequiresDocumentSearch,
  isBusinessIntelligenceQuestion,
  loadBusinessIntelligence,
  planBusinessQuery,
  type GideonClaim,
} from "@/lib/gideon/business";
import { loadCollaboratorMemberAccounts } from "@/lib/profiles/collaboratorMembers";
import type { LinkedVaultProfile } from "@/lib/vault/rollup";
import { loadLinkedOrgContext } from "./linkedProfiles";
import type { WorkspaceContextData, WorkspaceContextMeta } from "./types";
import {
  GIDEON_LOAD_FULL,
  type GideonLoadFlags,
} from "@/lib/gideon/capabilities";
import type { GideonIntent } from "@/lib/gideon/intent";

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
  load?: GideonLoadFlags;
  intent?: GideonIntent;
  calendarNote?: string;
  focusBlockNote?: string;
  confirmationRequired?: boolean;
  /** Claims from the previous assistant turn (Business Pack evidence follow-ups). */
  priorClaims?: unknown;
};

export type WorkspaceContextResult = {
  context: WorkspaceContextData;
  chunks: RetrievedChunk[];
  explicitSpaceName?: string | null;
  /** Connected-source files matched via ontology (openable from Ask Gideon). */
  connectorCitations?: VaultChatCitation[];
  /** YouTube links from matched song/chart ontology entities. */
  youtubeUrls?: string[];
  businessClaims?: GideonClaim[];
  /** Prefer as the user-facing answer for Business Pack BI intents. */
  businessAnswerDraft?: string | null;
  /** This-space search was empty; this turn searched all accessible Spaces. */
  widenedToAllSpaces?: boolean;
  /** When widened (or cross-space) evidence mostly comes from one other Space. */
  foundInSpace?: { profileId: string; profileName: string } | null;
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
  const load = args.load ?? GIDEON_LOAD_FULL;
  const intent = args.intent ?? "knowledge_search";
  const calendarNote = args.calendarNote ?? "";
  const focusBlockNote = args.focusBlockNote ?? "";
  const confirmationRequired = args.confirmationRequired ?? false;

  const retrievalQuestion = expandRetrievalQuestion(question, chatHistory);
  const fullLogQuote = wantsFullDailyLogQuote(question);
  const { activeProfile, retrievalScopes, searchProfileIds, profileNames } =
    meta;

  const packEngineOn = isGuardianPackEngineEnabled({ email: user.email });
  const ontologyOn = isGuardianOntologyEnabled();
  const orgSpace = isOrgStyleProfile(activeProfile.profile_type);
  const businessQuestion =
    isBusinessIntelligenceQuestion(question) ||
    isBusinessKnowledgeQuestion(question) ||
    isBusinessAdvisoryQuestion(question);
  // Run BI when Pack Engine is on, or when ontology is enabled on an org Space
  // (so Entity 360 still works if the pack flag is admin-only for Settings UI).
  const businessPlan =
    orgSpace &&
    activeProfile.profile_type !== "client" &&
    businessQuestion &&
    (packEngineOn || ontologyOn)
      ? planBusinessQuery(question)
      : null;
  const forceDocumentSearch = isDocumentContentQuestion(question);
  const scopeCandidates = meta.accessibleProfiles.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    profile_type: p.profile_type,
  }));
  const explicitSpace = resolveExplicitSpaceScope({
    question: retrievalQuestion,
    accessibleProfiles: scopeCandidates,
  });
  // e.g. on NM2TECH asking about "Kendall Capital" — pull that Space's files.
  const namedOutsideSpace = resolveNamedSpaceOutsideSearch({
    question: retrievalQuestion,
    accessibleProfiles: scopeCandidates,
    currentSearchProfileIds: searchProfileIds,
  });

  let effectiveSearchIds = searchProfileIds;
  let effectiveRetrievalScopes = retrievalScopes;
  let focusedSpaceName: string | null = null;

  if (explicitSpace && searchProfileIds.includes(explicitSpace.id)) {
    effectiveSearchIds = [explicitSpace.id];
    effectiveRetrievalScopes = retrievalScopes.filter(
      (scope) => scope.id === explicitSpace.id
    );
    focusedSpaceName = explicitSpace.display_name;
  } else if (namedOutsideSpace) {
    effectiveSearchIds = [namedOutsideSpace.id];
    effectiveRetrievalScopes = [
      {
        id: namedOutsideSpace.id,
        display_name: namedOutsideSpace.display_name,
        profile_type:
          namedOutsideSpace.profile_type ?? activeProfile.profile_type,
      },
    ];
    focusedSpaceName = namedOutsideSpace.display_name;
  }

  const forceNamedSpaceDocs = Boolean(namedOutsideSpace);
  const runDocumentSearch =
    load.documents &&
    (forceDocumentSearch ||
      forceNamedSpaceDocs ||
      !businessPlan ||
      biPlanRequiresDocumentSearch(businessPlan));
  const showPictures = wantsShowPictures(question);
  const transcriptionMode = wantsTranscription(question);
  const songListOnly = wantsSongOrChartList(question);
  const reminderAgent = wantsReminderAgent(question);
  const dailyLogCaptureAgent = wantsDailyLogCapture(question, chatHistory);
  const workMemoryUpdateAgent = wantsWorkMemoryUpdate(question, {
    focusedWorkProject: Boolean(workProjectId),
  });
  const clientRequestReplyAgent = wantsClientRequestReply(question);
  const clientRequestCreateAgent = wantsClientRequestCreate(question);
  const spaceCreateAgent = wantsSpaceCreate(question);

  const contextBuildStarted = Date.now();
  let embeddingDurationMs = 0;
  let retrievalDurationMs = 0;
  let vectorCandidateCount = 0;
  let keywordCandidateCount = 0;
  let mergedCandidateCount = 0;
  let knowledgeCandidateCount = 0;

  const documentRetrievalQuery = expandDocumentContentRetrievalQuery(
    retrievalQuestion
  );

  let searchableChunkCount = chunkCount;
  if (
    forceNamedSpaceDocs &&
    namedOutsideSpace &&
    !searchProfileIds.includes(namedOutsideSpace.id)
  ) {
    const { count } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .in("profile_id", effectiveSearchIds);
    searchableChunkCount = count ?? 0;
  }

  let widenedToAllSpaces = false;
  const allAccessibleScopes: LinkedVaultProfile[] = scopeCandidates.map(
    (p) => ({
      id: p.id,
      display_name: p.display_name,
      profile_type:
        p.profile_type ??
        (activeProfile.profile_type as GuardianProfileType),
    })
  );

  // Empty vault in the active Space — widen before embedding so we still search.
  if (
    shouldWidenWorkspaceDocumentSearch({
      searchScope: meta.searchScope,
      hasExplicitSpaceFocus: Boolean(explicitSpace || namedOutsideSpace),
      retrievedChunkCount: 0,
      accessibleProfileCount: allAccessibleScopes.length,
      workspaceSearchProfileCount: searchProfileIds.length,
    }) &&
    searchableChunkCount === 0 &&
    runDocumentSearch &&
    !songListOnly
  ) {
    effectiveSearchIds = allAccessibleScopes.map((s) => s.id);
    effectiveRetrievalScopes = allAccessibleScopes;
    widenedToAllSpaces = true;
    const { count } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .in("profile_id", effectiveSearchIds);
    searchableChunkCount = count ?? 0;
  }

  const embeddingStarted = Date.now();
  let queryEmbedding =
    runDocumentSearch && searchableChunkCount > 0 && !songListOnly
      ? await embedQuery(documentRetrievalQuery).catch((embedErr) => {
          console.warn(
            "Vault chat embedding failed; continuing without document search:",
            embedErr instanceof Error ? embedErr.message : "error"
          );
          return null;
        })
      : null;
  embeddingDurationMs = Date.now() - embeddingStarted;

  const matchCount = showPictures ? 10 : transcriptionMode ? 20 : 8;
  let rollupScopes: LinkedVaultProfile[] = effectiveRetrievalScopes.map((scope) => ({
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
      query: documentRetrievalQuery,
      queryEmbedding,
      scopes: rollupScopes,
      finalTopK: matchCount,
    });
    retrievalDurationMs = Date.now() - retrievalStarted;
    vectorCandidateCount = hybrid.vectorCount;
    keywordCandidateCount = hybrid.keywordCount;
    mergedCandidateCount = hybrid.mergedCount;
    retrievedChunks = hybrid.results;
    if (transcriptionMode && retrievedChunks.length > 0) {
      retrievedChunks = await expandTranscriptionDocumentChunks(
        supabase,
        retrievedChunks,
        { maxDocuments: 3, maxChunks: 80 }
      );
    }
  }

  // This-space search returned nothing — widen once and search everywhere.
  if (
    !widenedToAllSpaces &&
    queryEmbedding &&
    shouldWidenWorkspaceDocumentSearch({
      searchScope: meta.searchScope,
      hasExplicitSpaceFocus: Boolean(explicitSpace || namedOutsideSpace),
      retrievedChunkCount: retrievedChunks.length,
      accessibleProfileCount: allAccessibleScopes.length,
      workspaceSearchProfileCount: searchProfileIds.length,
    })
  ) {
    const widenStarted = Date.now();
    const hybrid = await hybridRetrieveVaultChunks({
      supabase,
      query: documentRetrievalQuery,
      queryEmbedding,
      scopes: allAccessibleScopes,
      finalTopK: matchCount,
    });
    retrievalDurationMs += Date.now() - widenStarted;
    vectorCandidateCount = Math.max(vectorCandidateCount, hybrid.vectorCount);
    keywordCandidateCount = Math.max(
      keywordCandidateCount,
      hybrid.keywordCount
    );
    mergedCandidateCount = Math.max(mergedCandidateCount, hybrid.mergedCount);
    if (hybrid.results.length > 0) {
      retrievedChunks = hybrid.results;
      if (transcriptionMode) {
        retrievedChunks = await expandTranscriptionDocumentChunks(
          supabase,
          retrievedChunks,
          { maxDocuments: 3, maxChunks: 80 }
        );
      }
      effectiveSearchIds = allAccessibleScopes.map((s) => s.id);
      effectiveRetrievalScopes = allAccessibleScopes;
      rollupScopes = allAccessibleScopes;
      widenedToAllSpaces = true;
    }
  }

  const disclosurePins =
    runDocumentSearch && !songListOnly
      ? await loadRegulatoryDisclosureChunks(supabase, {
          question,
          profileIds: effectiveSearchIds,
          limit: 6,
        })
      : [];

  const chunks = mergePinnedChunks(
    [...(attachedDoc?.chunks ?? []), ...disclosurePins],
    retrievedChunks
  );
  const formatted = formatRetrievalContext(chunks, {
    maxChunkChars: transcriptionMode
      ? 8000
      : forceDocumentSearch
        ? 2800
        : undefined,
  });

  const ontologySpaceId =
    explicitSpace?.id ??
    namedOutsideSpace?.id ??
    meta.chatScopedProfileId ??
    activeProfile.id;
  const clientProfileIds = effectiveRetrievalScopes
    .filter((scope) => scope.profile_type === "client")
    .map((scope) => scope.id);
  const includeActiveRequests =
    clientProfileIds.length > 0 &&
    (clientRequestReplyAgent ||
      clientRequestCreateAgent ||
      isOrgStyleProfile(activeProfile.profile_type) ||
      /\b(request|requests|ticket|client)\b/i.test(retrievalQuestion));
  const loadProposals =
    isOrgStyleProfile(activeProfile.profile_type) &&
    activeProfile.profile_type !== "client" &&
    (Boolean(businessPlan?.requiresStructuredData) ||
      /\b(proposal|proposals|quote|estimate)\b/i.test(retrievalQuestion));

  const packSkillsNote = [
    businessPackSkillPromptNote({
      packEngineEnabled: packEngineOn,
      isOrgSpace: orgSpace,
      includeSkill:
        intent === "knowledge_search" ||
        intent === "combined" ||
        Boolean(businessPlan) ||
        (intent === "chief_of_staff" &&
          (isBusinessAdvisoryQuestion(retrievalQuestion) ||
            isBusinessKnowledgeQuestion(retrievalQuestion))),
    }),
    dentalPackSkillPromptNote({
      packEngineEnabled: packEngineOn,
      isOrgSpace: orgSpace,
      includeSkill:
        isDentalKnowledgeQuestion(retrievalQuestion) ||
        isDentalAdvisoryQuestion(retrievalQuestion) ||
        (intent === "knowledge_search" &&
          isDentalKnowledgeQuestion(retrievalQuestion)),
    }),
  ]
    .filter(Boolean)
    .join("\n\n");

  const loadOntologyContext =
    load.documents &&
    isGuardianOntologyEnabled() &&
    !songListOnly &&
    businessPlan?.intent !== "EVIDENCE_REQUEST" &&
    (businessPlan == null ||
      businessPlan.requiresOntology ||
      businessPlan.requiresSearch);

  const [
    structuredKnowledgeBundle,
    ontologyBundle,
    dailyLogsBundle,
    clientRequestsBundle,
    activeRequests,
    proposalsBundle,
    fileInventoryContext,
    scheduleBundle,
    linkedContext,
    workMemoryBundleRaw,
    businessIntelligenceBundle,
  ] = await Promise.all([
    runDocumentSearch && isKnowledgeEngineV2Enabled() && !songListOnly
      ? retrieveStructuredKnowledge(supabase, {
          question: retrievalQuestion,
          profileIds: effectiveSearchIds,
        }).then((knowledge) => ({
          count: knowledge.facts.length,
          text: formatKnowledgeForGideon(knowledge, profileNames),
        }))
      : Promise.resolve({ count: 0, text: "(none)" }),
    loadOntologyContext
      ? getOntologyContext(supabase, {
          spaceId: ontologySpaceId,
          query: retrievalQuestion,
          userId: user.id,
        })
          .then(async (ontology) => {
            const text = formatOntologyForGideon(ontology, {
              query: retrievalQuestion,
            });
            const citations = await resolveConnectorSourceCitations(
              supabase,
              ontology,
              user.id
            );
            const youtubeUrls = collectYouTubeUrlsFromOntology(
              ontology,
              retrievalQuestion
            );
            return { text, citations, youtubeUrls };
          })
          .catch((err) => {
            console.warn(
              "Ontology context for Gideon failed; continuing without it:",
              err instanceof Error ? err.message : "error"
            );
            return {
              text: "(none)",
              citations: [] as VaultChatCitation[],
              youtubeUrls: [] as string[],
            };
          })
      : Promise.resolve({
          text: "(none)",
          citations: [] as VaultChatCitation[],
          youtubeUrls: [] as string[],
        }),
    load.logs
      ? retrieveRelevantDailyLogs(supabase, {
          profileId: activeProfile.id,
          profileIds: effectiveSearchIds,
          profileNames,
          question: retrievalQuestion,
          limit:
            effectiveRetrievalScopes.length > 1
              ? fullLogQuote
                ? 8
                : 6
              : fullLogQuote
                ? 6
                : 4,
        })
      : Promise.resolve({ logs: [], authorNames: {} as Record<string, string> }),
    load.clientRequests
      ? retrieveRelevantClientRequests(supabase, {
          clientProfileIds,
          profileNames,
          question: retrievalQuestion,
          limit: effectiveRetrievalScopes.length > 1 ? 6 : 4,
        })
      : Promise.resolve({
          requests: [],
          authorNames: {} as Record<string, string>,
        }),
    load.clientRequests && includeActiveRequests
      ? loadActiveClientRequestsForGideon(
          supabase,
          clientProfileIds,
          effectiveRetrievalScopes.length > 1 ? 8 : 6
        )
      : Promise.resolve([]),
    load.proposals && loadProposals
      ? supabase
          .from("proposals")
          .select(PROPOSAL_SELECT)
          .eq("business_profile_id", activeProfile.id)
          .order("updated_at", { ascending: false })
          .limit(8)
          .then(({ data: proposalRows }) =>
            formatProposalsForGideon(
              (proposalRows ?? []).map((row) => mapProposalRow(row)),
              profileNames
            )
          )
      : Promise.resolve("(none)"),
    load.documents || songListOnly
      ? loadVaultFileInventoryContext(
          supabase,
          effectiveSearchIds,
          profileNames,
          retrievalQuestion,
          user.id
        )
      : Promise.resolve("(none)"),
    load.schedule
      ? Promise.all([
          retrieveGuardianItemsForGideon(supabase, {
            spaceIds: effectiveSearchIds,
            profileNames,
            question: retrievalQuestion,
            timeZone,
            limit: effectiveRetrievalScopes.length > 1 ? 12 : 10,
          }),
          retrieveUpcomingAlertsForGideon(supabase, {
            profileIds: effectiveSearchIds,
            profileNames,
            question: retrievalQuestion,
            timeZone,
            limit: effectiveRetrievalScopes.length > 1 ? 12 : 10,
          }),
        ]).then(([items, alerts]) => ({ items, alerts }))
      : Promise.resolve({ items: [], alerts: [] }),
    load.linkedProfiles
      ? loadLinkedOrgContext(supabase, user.id, activeProfile)
      : Promise.resolve("(none)"),
    load.workMemory
      ? workProjectId
        ? (async () => {
            const focused = await loadWorkMemoryProjectForGideon(
              supabase,
              user.id,
              workProjectId
            );
            if (focused) {
              return { focused: true as const, bundle: focused };
            }
            const bundle = await loadWorkMemoryForGideon(supabase, user.id);
            return { focused: false as const, bundle };
          })()
        : loadWorkMemoryForGideon(supabase, user.id).then((bundle) => ({
            focused: false as const,
            bundle,
          }))
      : Promise.resolve({
          focused: false as const,
          bundle: { projects: [], sessionsByProject: new Map() },
        }),
    businessPlan
      ? loadBusinessIntelligence({
          supabase,
          businessProfileId: activeProfile.id,
          question: retrievalQuestion,
          // Include all accessible Spaces so proposal client_profile_id lookups resolve.
          profileNames: {
            ...profileNames,
            ...Object.fromEntries(
              meta.accessibleProfiles.map((p) => [p.id, p.display_name])
            ),
          },
          priorClaims: args.priorClaims,
          plan: businessPlan,
        }).catch((err) => {
          console.warn(
            "Business intelligence load failed; continuing without it:",
            err instanceof Error ? err.message : "error"
          );
          return null;
        })
      : Promise.resolve(null),
  ]);

  knowledgeCandidateCount = structuredKnowledgeBundle.count;
  const structuredKnowledgeContext = structuredKnowledgeBundle.text;
  const ontologyContext = ontologyBundle.text;
  const namedCharts = extractChartTitlesFromText(retrievalQuestion);
  let connectorCitations = ontologyBundle.citations;
  if (isPianoOrSongLearnRequest(question) || namedCharts.length > 0 || wantsOpenChartAttachment(question)) {
    connectorCitations = filterCitationsToChordCharts(connectorCitations);
    if (namedCharts.length) {
      const lowered = namedCharts.map((t) => t.toLowerCase());
      const matched = connectorCitations.filter((c) => {
        const labels = [c.fileName, c.cardName]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter(Boolean);
        return lowered.some((title) =>
          labels.some((label) => {
            const stem = label.replace(/\.[^.]+$/, "").toLowerCase();
            return (
              stem.includes(title) ||
              title.includes(stem.slice(0, 24)) ||
              entityMatchesSongTitle(label, title) ||
              entityMatchesSongTitle(title, label)
            );
          })
        );
      });
      // Keep opaque Trello filenames (trello123.jpg) for answer-time picking;
      // drop clearly unrelated named charts/PDFs when we have a song title.
      if (matched.length) {
        connectorCitations = matched;
      } else {
        connectorCitations = connectorCitations.filter((c) => {
          const stem = c.fileName.replace(/\.[^.]+$/, "").toLowerCase();
          if (/^trello\d+/i.test(stem)) return true;
          if (isLikelyChordChartFile(c.fileName, c.mimeType ?? null)) return true;
          if (/\.(jpe?g|png|webp|gif)$/i.test(c.fileName)) return true;
          return false;
        });
      }
    }
  }

  const { logs: dailyLogs, authorNames } = dailyLogsBundle;
  const logContext = formatDailyLogsForGideon(
    dailyLogs,
    profileNames,
    authorNames
  );

  const { requests: clientRequests, authorNames: requestAuthorNames } =
    clientRequestsBundle;
  const mergedRequests = mergeClientRequestsForGideon(
    clientRequests,
    activeRequests,
    effectiveRetrievalScopes.length > 1 ? 8 : 6
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

  const proposalsContext = proposalsBundle;
  const guardianSchedule = formatGuardianItemsForGideon(scheduleBundle.items);
  const alertsSchedule = formatAlertsForGideon(scheduleBundle.alerts, {
    profileNames,
    timeZone,
  });
  const scheduleContext =
    scheduleBundle.items.length > 0
      ? [
          guardianSchedule,
          alertsSchedule
            ? `Also saved reminders:\n${alertsSchedule}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n")
      : alertsSchedule;

  const vaultMapOwnerLabel =
    firstNameFrom(
      user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email
    ) ?? "You";
  const vaultMapContext = load.vaultMap
    ? formatVaultMapForGideon(
        meta.accessibleProfiles,
        vaultMapOwnerLabel,
        activeProfile.id
      )
    : "(none)";

  const workMemoryBundle = workMemoryBundleRaw.bundle;
  const focusedWorkMemory = workMemoryBundleRaw.focused;
  const workMemoryBody = formatWorkMemoryForGideon(
    workMemoryBundle.projects,
    workMemoryBundle.sessionsByProject
  );
  const workMemoryContext = focusedWorkMemory
    ? `The user clicked "Continue with Gideon" to resume this project. Prioritize this project's mission, step, blockers, and recent sessions.\n\n${workMemoryBody}`
    : workMemoryBody;

  const explicitScopeNote = focusedSpaceName
    ? `This question is scoped to the ${focusedSpaceName} space only. Use RETRIEVED EXCERPTS, DAILY LOGS, and SPACE FILE INVENTORY for that space.${
        namedOutsideSpace
          ? ` The user named ${focusedSpaceName} while working from ${activeProfile.display_name}.`
          : ""
      }${
        /\babout\b/i.test(retrievalQuestion)
          ? " Filter to the topic named in the question — do not dump full file lists from other spaces; one brief redirect sentence is enough if nothing matches."
          : ""
      }\n\n`
    : "";

  const allVaultsNote =
    explicitScopeNote +
    (widenedToAllSpaces
      ? `Nothing matched in the active space (${activeProfile.display_name}), so document search was widened to all accessible spaces for this turn (${effectiveRetrievalScopes.map((s) => s.display_name).join(", ")}). Attribute every fact to the correct space by name. Prefer answering from the matching space; do not invent that files live in ${activeProfile.display_name}.`
      : meta.searchScope === "global" && retrievalScopes.length > 1
      ? `${GIDEON_CROSS_VAULT_NOTE}

Active space in the UI: ${activeProfile.display_name}. Document search includes all ${retrievalScopes.length} spaces and workspaces you can access (${retrievalScopes.map((s) => s.display_name).join(", ")}).`
      : retrievalScopes.length > 1
        ? `Search includes ${retrievalScopes.map((s) => s.display_name).join(", ")} for this chat. Attribute facts to the correct space.`
        : "Search this space's documents, Daily Logs, client requests, and upcoming schedule; use GENERAL KNOWLEDGE when the space does not contain the answer.");

  const attachedTextLimit = transcriptionMode ? 30_000 : 12_000;
  const attachedContext = attachedDoc
    ? [
        `File: ${attachedDoc.fileName}`,
        attachedDoc.isImage
          ? "This is an image already stored in Guardian. The original file is attached to this request — inspect it directly. Cite what you read from it under FROM YOUR DOCUMENTS, not Daily Logs."
          : "Cite this file under FROM YOUR DOCUMENTS, not Daily Logs.",
        attachedDoc.visionSummary
          ? `Vision summary:\n${attachedDoc.visionSummary.slice(0, 4_000)}`
          : "",
        attachedDoc.sourceText
          ? `Document text:\n${attachedDoc.sourceText.slice(0, attachedTextLimit)}`
          : attachedDoc.isImage
            ? "(No extracted text yet — use the attached image. Do not ask the user to re-upload it.)"
            : "(no extracted text)",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  const noDocumentExcerpts = !formatted.context.trim();
  const noMatchedLogs =
    !logContext.trim() || logContext.trim() === "(none)";
  let vaultEmptyNote = "";
  if (noDocumentExcerpts && !attachedContext.trim()) {
    if (focusedSpaceName) {
      vaultEmptyNote = `No document excerpts matched in ${focusedSpaceName}. Check RETRIEVED DAILY LOGS and SPACE FILE INVENTORY below for this space. If nothing matches the question (including names or topics mentioned), say clearly you could not find that in ${focusedSpaceName}. Do not invent facts. You must always reply in complete sentences — never return a blank response.`;
    } else if (noMatchedLogs) {
      vaultEmptyNote =
        "No document excerpts or Daily Logs matched this question. If SPACE FILE INVENTORY lists relevant files, you may name them; otherwise say you could not find it. Do not invent facts. You must always reply — never return a blank response.";
    } else {
      vaultEmptyNote =
        "No document excerpts matched this question. Use RETRIEVED DAILY LOGS if they answer it; otherwise say you could not find it in documents. You must always reply — never return a blank response.";
    }
  }

  const suppressRawDocsForBi =
    Boolean(businessPlan) &&
    !biPlanRequiresDocumentSearch(businessPlan!) &&
    !forceDocumentSearch &&
    !forceNamedSpaceDocs;

  const context: WorkspaceContextData = {
    ...meta,
    blocks: {
      excerpts: suppressRawDocsForBi
        ? "(none — use BUSINESS INTELLIGENCE; do not invent a raw fact list from documents)"
        : formatted.context.trim() || "(none)",
      fileInventory: fileInventoryContext,
      attachedDocument: attachedContext.trim() || "(none)",
      dailyLogs: logContext.trim() || "(none)",
      clientRequests: clientRequestContext.trim() || "(none)",
      proposals: proposalsContext.trim() || "(none)",
      schedule: scheduleContext.trim() || "(none)",
      linkedProfiles: linkedContext.trim() || "(none)",
      vaultMap: vaultMapContext,
      workMemory:
        workMemoryContext.trim() ||
        "(none — user has no active work projects)",
      structuredKnowledge: suppressRawDocsForBi
        ? "(none — use BUSINESS INTELLIGENCE)"
        : structuredKnowledgeContext,
      ontology:
        businessPlan?.intent === "ENTITY_360" ||
        businessPlan?.intent === "RELATIONSHIP_QUERY" ||
        businessPlan?.intent === "ADVISORY" ||
        businessPlan?.intent === "COMMITMENT_ANALYSIS" ||
        businessPlan?.intent === "EVIDENCE_REQUEST"
          ? "(none — prefer BUSINESS INTELLIGENCE block over raw ontology dump)"
          : ontologyContext,
      businessIntelligence:
        businessIntelligenceBundle?.promptBlock?.trim() || "(none)",
    },
    promptOptions: {
      timeZone,
      showPictures,
      reminderAgent,
      dailyLogCaptureAgent,
      workMemoryUpdateAgent,
      clientRequestReplyAgent,
      clientRequestCreateAgent,
      spaceCreateAgent,
      transcriptionMode,
      hasAttachedDocument: Boolean(attachedDoc),
      hasVisionImages: Boolean(attachedDoc?.isImage && attachedDoc.imageBase64),
      allVaultsNote,
      vaultEmptyNote,
      focusedWorkMemory: Boolean(focusedWorkMemory),
      agentMode: false,
      fullLogQuote,
      intent,
      loaded: load,
      calendarNote,
      focusBlockNote,
      confirmationRequired,
      packSkillsNote: packSkillsNote || undefined,
    },
    businessClaims: businessIntelligenceBundle?.claims,
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

  return {
    context,
    chunks: suppressRawDocsForBi ? [] : chunks,
    explicitSpaceName: focusedSpaceName,
    connectorCitations,
    youtubeUrls: ontologyBundle.youtubeUrls ?? [],
    businessClaims: businessIntelligenceBundle?.claims,
    // Fee / ADV / CRS questions must use document excerpts + LLM, not a BI draft
    // that may still claim Form ADV is missing after it was uploaded.
    businessAnswerDraft:
      forceDocumentSearch || forceNamedSpaceDocs
        ? null
        : (businessIntelligenceBundle?.userAnswerDraft ?? null),
    widenedToAllSpaces,
    foundInSpace: (() => {
      const dominantId = dominantRetrievalProfileId(chunks);
      if (!dominantId || dominantId === activeProfile.id) return null;
      if (!widenedToAllSpaces && meta.searchScope !== "global") return null;
      const match =
        allAccessibleScopes.find((s) => s.id === dominantId) ??
        scopeCandidates.find((s) => s.id === dominantId);
      if (!match) return null;
      return {
        profileId: match.id,
        profileName: match.display_name,
      };
    })(),
  };
}
