import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import {
  isAnthropicConfigured,
  isChatLlmConfigured,
} from "@/lib/analysis/chatProvider";
import { routeGideonRequest, resolveGideonLoad } from "@/lib/gideon/orchestrator";
import { buildSuggestedQuestions } from "@/lib/gideon/suggestedQuestions";
import { extractBusinessEntityMentions } from "@/lib/gideon/business/queryPlanner";
import { selectCitationsForAnswer } from "@/lib/vault/retrieve";
import {
  buildGideonSystemPrompt,
  gideonMaxTokens,
} from "@/lib/workspace-context/formatSystemPrompt";
import { loadWorkspaceContext } from "@/lib/workspace-context/buildContext";
import { resolveWorkspaceScopes } from "@/lib/workspace-context/scopes";
import type { GuardianProfile } from "@/lib/profiles/types";
import { listGuardianProfiles } from "@/lib/profiles/server";
import {
  formatSpaceKnowledgeForGideon,
  knowledgeCitationsFromItems,
  retrieveSpaceKnowledgeForGideon,
} from "./retrieveKnowledge";
import type { SpaceConversationCitation } from "./types";
import { extractGideonQuestion } from "./helpers";

export type SpaceGideonAnswerResult = {
  answer: string;
  citations: SpaceConversationCitation[];
  suggestedQuestions: string[];
};

/**
 * Answer an @Gideon turn scoped strictly to the current Space.
 * Reuses Guardian retrieval (loadWorkspaceContext) — does not fork RAG.
 */
export async function answerSpaceConversationGideon(args: {
  supabase: SupabaseClient;
  user: User;
  profile: GuardianProfile;
  rawContent: string;
  history: { role: "user" | "assistant"; content: string }[];
  timeZone?: string;
}): Promise<SpaceGideonAnswerResult> {
  const question = extractGideonQuestion(args.rawContent);
  if (!question) {
    return {
      answer: "What would you like me to look up in this Space?",
      citations: [],
      suggestedQuestions: [],
    };
  }

  if (!isChatLlmConfigured()) {
    return {
      answer:
        "Gideon isn't configured on this deployment yet. You can still discuss with your team here.",
      citations: [],
      suggestedQuestions: [],
    };
  }

  const accessibleProfiles = await listGuardianProfiles(
    args.supabase,
    args.user.id
  );
  const meta = resolveWorkspaceScopes({
    accessibleProfiles,
    activeProfile: args.profile,
    chatHomeProfileId: args.profile.id,
    chatScopedProfileId: null,
    searchScope: "workspace",
  });

  const gideonRoute = routeGideonRequest({
    question,
    history: args.history,
    hasAttachment: false,
    forceKnowledge: true,
  });
  const loadFlags = resolveGideonLoad(gideonRoute);

  const knowledgeItems = await retrieveSpaceKnowledgeForGideon(args.supabase, {
    profileId: args.profile.id,
    question,
  });
  const knowledgeBlock = formatSpaceKnowledgeForGideon(knowledgeItems);

  const { chunks, context: workspaceContext } = await loadWorkspaceContext({
    supabase: args.supabase,
    user: args.user,
    meta,
    question,
    timeZone: args.timeZone ?? "America/New_York",
    chatHistory: args.history,
    load: loadFlags,
    intent: gideonRoute.intent,
  });

  if (knowledgeBlock.trim()) {
    workspaceContext.blocks.dailyLogs = [
      knowledgeBlock.trim()
        ? `SAVED SPACE KNOWLEDGE (decisions, tasks, notes — higher priority than casual chat)\n${knowledgeBlock}`
        : "",
      workspaceContext.blocks.dailyLogs &&
      workspaceContext.blocks.dailyLogs !== "(none)"
        ? workspaceContext.blocks.dailyLogs
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  workspaceContext.promptOptions.agentMode = false;

  const system = [
    buildGideonSystemPrompt(workspaceContext),
    "",
    "You are answering inside a shared Space Conversation.",
    "Only use knowledge from this Space that the member is authorized to see.",
    "When citing saved decisions, tasks, or notes, mention them clearly.",
    "Never invent citations or cross-Space facts.",
  ].join("\n");

  const client = isAnthropicConfigured() ? createLlmClient() : null;
  const answer = (
    await runChatCompletion(client, {
      system,
      messages: [
        ...args.history.slice(-12),
        { role: "user", content: question },
      ],
      model: CHAT_MODEL,
      maxTokens: gideonMaxTokens(workspaceContext),
    })
  ).trim();

  const finalAnswer =
    answer ||
    "I couldn't find enough in this Space to answer that. Try attaching a document or uploading more files.";

  const docCitations = selectCitationsForAnswer(
    finalAnswer,
    chunks,
    question
  ).map((c) => ({
    documentId: c.documentId,
    fileName: c.fileName,
    profileName: c.profileName,
    kind: "vault" as const,
  }));

  const knowledgeCitations = knowledgeCitationsFromItems(
    knowledgeItems,
    finalAnswer
  );

  const citations: SpaceConversationCitation[] = [
    ...docCitations,
    ...knowledgeCitations,
  ];

  const suggestedQuestions = buildSuggestedQuestions({
    question,
    answer: finalAnswer,
    entityNames: extractBusinessEntityMentions(question),
    availableDocumentLabels: citations.map((c) => c.fileName),
    evidenceTexts: [finalAnswer],
    preferEvidenceOrGap: true,
  });

  return {
    answer: finalAnswer,
    citations,
    suggestedQuestions,
  };
}
