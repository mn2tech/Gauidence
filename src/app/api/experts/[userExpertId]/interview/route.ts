import { NextResponse } from "next/server";
import {
  CHAT_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import { buildInterviewFeedbackPrompt } from "@/lib/experts/build-expert-prompt";
import {
  getExpertById,
  getExpertInterviewQuestions,
} from "@/lib/experts/load-expert";
import {
  isExpertAuthed,
  recordExpertActivity,
  requireExpertUser,
  requireOwnedUserExpert,
} from "@/lib/experts/server";
import { withLlmUsage } from "@/lib/usage/record";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userExpertId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireExpertUser();
  if (!isExpertAuthed(auth)) return auth;

  const { userExpertId } = await context.params;
  const installation = await requireOwnedUserExpert(
    auth.supabase,
    auth.user.id,
    userExpertId
  );
  if (!installation) {
    return NextResponse.json({ error: "Expert installation not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const category = url.searchParams.get("category")?.trim();
  const difficulty = url.searchParams.get("difficulty")?.trim();

  let questions = getExpertInterviewQuestions(installation.expert_id).map((q) => ({
    id: q.id,
    category: q.category,
    difficulty: q.difficulty,
    question: q.question,
  }));

  if (category) {
    questions = questions.filter((q) => q.category === category);
  }
  if (difficulty) {
    questions = questions.filter((q) => q.difficulty === difficulty);
  }

  const { data: sessions } = await auth.supabase
    .from("expert_interview_sessions")
    .select("*")
    .eq("user_expert_id", installation.id)
    .order("started_at", { ascending: false })
    .limit(5);

  return NextResponse.json({ questions, sessions: sessions ?? [] });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireExpertUser();
  if (!isExpertAuthed(auth)) return auth;

  const { userExpertId } = await context.params;
  const installation = await requireOwnedUserExpert(
    auth.supabase,
    auth.user.id,
    userExpertId
  );
  if (!installation) {
    return NextResponse.json({ error: "Expert installation not found." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "start";

  if (action === "start") {
    const questionIds = Array.isArray(body.questionIds)
      ? body.questionIds.filter((id): id is string => typeof id === "string")
      : getExpertInterviewQuestions(installation.expert_id).map((q) => q.id);

    const { data, error } = await auth.supabase
      .from("expert_interview_sessions")
      .insert({
        user_id: auth.user.id,
        user_expert_id: installation.id,
        status: "active",
        question_ids: questionIds,
        responses: [],
        feedback: {},
      })
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Couldn't start interview session." }, { status: 502 });
    }

    await recordExpertActivity(auth.supabase, {
      userId: auth.user.id,
      userExpertId: installation.id,
      activityType: "interview_started",
      contentId: data.id,
    });

    return NextResponse.json({ session: data });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
  const response = typeof body.response === "string" ? body.response.trim() : "";

  if (!sessionId || !questionId || !response) {
    return NextResponse.json(
      { error: "sessionId, questionId, and response are required." },
      { status: 400 }
    );
  }

  const expert = getExpertById(installation.expert_id);
  const question = expert?.interviewQuestions.find((q) => q.id === questionId);
  if (!expert || !question) {
    return NextResponse.json({ error: "Interview question not found." }, { status: 404 });
  }

  const prompt = buildInterviewFeedbackPrompt({
    expert,
    question: question.question,
    answerGuide: question.answerGuide,
    userResponse: response,
  });

  const feedback = await withLlmUsage(
    { userId: auth.user.id, feature: "other" },
    async () => {
      const client = createLlmClient();
      return runChatCompletion(client, {
        system: prompt.system,
        messages: prompt.messages,
        model: CHAT_MODEL,
        maxTokens: 1024,
      });
    }
  );

  const { data: session } = await auth.supabase
    .from("expert_interview_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_expert_id", installation.id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "Interview session not found." }, { status: 404 });
  }

  const responses = Array.isArray(session.responses) ? [...session.responses] : [];
  responses.push({ questionId, response, feedback, at: new Date().toISOString() });

  const feedbackMap =
    session.feedback && typeof session.feedback === "object"
      ? { ...(session.feedback as Record<string, unknown>) }
      : {};
  feedbackMap[questionId] = feedback;

  const completed = responses.length >= (session.question_ids as string[]).length;
  const { data: updated, error } = await auth.supabase
    .from("expert_interview_sessions")
    .update({
      responses,
      feedback: feedbackMap,
      status: completed ? "completed" : "active",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", sessionId)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Couldn't save interview response." }, { status: 502 });
  }

  if (completed) {
    await recordExpertActivity(auth.supabase, {
      userId: auth.user.id,
      userExpertId: installation.id,
      activityType: "interview_completed",
      contentId: sessionId,
    });
  }

  return NextResponse.json({ session: updated, feedback });
}
