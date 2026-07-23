import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import { sanitizeChatQuestion } from "@/lib/chat/context";
import { buildExpertPrompt } from "@/lib/experts/build-expert-prompt";
import { getExpertById } from "@/lib/experts/load-expert";
import { searchExpertKnowledge } from "@/lib/experts/search-expert-knowledge";
import {
  appendConversationToPreferences,
  getConversationFromPreferences,
  isExpertAuthed,
  recordExpertActivity,
  requireExpertUser,
  requireOwnedUserExpert,
  touchUserExpertOpened,
} from "@/lib/experts/server";
import { assertBillingQuota, recordChatEvent } from "@/lib/billing/quota";
import { withLlmUsage } from "@/lib/usage/record";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireExpertUser();
  if (!isExpertAuthed(auth)) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const userExpertId =
    typeof body.user_expert_id === "string" ? body.user_expert_id.trim() : "";
  const question = sanitizeChatQuestion(body.question);
  const currentModuleId =
    typeof body.current_module_id === "string" ? body.current_module_id.trim() : undefined;
  const conversationId =
    typeof body.conversation_id === "string" && body.conversation_id.trim()
      ? body.conversation_id.trim()
      : randomUUID();

  if (!userExpertId || !question) {
    return NextResponse.json(
      { error: "user_expert_id and question are required." },
      { status: 400 }
    );
  }

  if (typeof body.system_prompt === "string" || typeof body.expert_id === "string") {
    return NextResponse.json(
      { error: "Client cannot override expert configuration." },
      { status: 400 }
    );
  }

  const installation = await requireOwnedUserExpert(
    auth.supabase,
    auth.user.id,
    userExpertId
  );
  if (!installation) {
    return NextResponse.json({ error: "Expert installation not found." }, { status: 404 });
  }

  const expert = getExpertById(installation.expert_id);
  if (!expert) {
    return NextResponse.json({ error: "Expert definition unavailable." }, { status: 404 });
  }

  try {
    await assertBillingQuota(auth.supabase, auth.user.id, "chat");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat limit reached.";
    return NextResponse.json({ error: message }, { status: 402 });
  }

  const knowledge = searchExpertKnowledge({
    expertId: installation.expert_id,
    query: question,
    limit: 5,
    moduleId: currentModuleId,
  });

  const history =
    getConversationFromPreferences(installation.preferences, conversationId)?.messages ??
    [];

  const prompt = buildExpertPrompt({
    expert,
    question,
    moduleId: currentModuleId,
    knowledge,
    history,
  });

  const answer = await withLlmUsage(
    { userId: auth.user.id, feature: "other" },
    async () => {
      const client = createLlmClient();
      return runChatCompletion(client, {
        system: prompt.system,
        messages: prompt.messages,
        model: CHAT_MODEL,
      });
    }
  );

  const updatedPreferences = appendConversationToPreferences(
    installation.preferences ?? {},
    conversationId,
    question,
    answer
  );

  await auth.supabase
    .from("user_experts")
    .update({ preferences: updatedPreferences, updated_at: new Date().toISOString() })
    .eq("id", installation.id)
    .eq("user_id", auth.user.id);

  await touchUserExpertOpened(auth.supabase, auth.user.id, installation.id);
  await recordExpertActivity(auth.supabase, {
    userId: auth.user.id,
    userExpertId: installation.id,
    activityType: "expert_question_asked",
    contentId: conversationId,
    metadata: { question },
  });
  await recordChatEvent(auth.supabase, auth.user.id, "chat");

  return NextResponse.json({
    answer,
    conversationId,
    citations: knowledge.map((k) => ({
      topicId: k.topicId,
      title: k.title,
      summary: k.summary,
    })),
  });
}
