import { NextResponse } from "next/server";
import { getExpertQuiz } from "@/lib/experts/load-expert";
import {
  isExpertAuthed,
  recordExpertActivity,
  requireExpertUser,
  requireOwnedUserExpert,
} from "@/lib/experts/server";

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

  const quizId = new URL(request.url).searchParams.get("quizId")?.trim() ?? "";
  if (!quizId) {
    return NextResponse.json({ error: "quizId is required." }, { status: 400 });
  }

  const quiz = getExpertQuiz(installation.expert_id, quizId);
  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
  }

  const publicQuiz = {
    ...quiz,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      question: q.question,
      options: q.options,
    })),
  };

  const { data: attempts } = await auth.supabase
    .from("expert_quiz_attempts")
    .select("id, score, correct_answers, total_questions, completed_at")
    .eq("user_expert_id", installation.id)
    .eq("quiz_id", quizId)
    .order("completed_at", { ascending: false });

  return NextResponse.json({ quiz: publicQuiz, attempts: attempts ?? [] });
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

  const quizId = typeof body.quizId === "string" ? body.quizId.trim() : "";
  const answers = Array.isArray(body.answers) ? body.answers : null;
  if (!quizId || !answers) {
    return NextResponse.json({ error: "quizId and answers are required." }, { status: 400 });
  }

  const quiz = getExpertQuiz(installation.expert_id, quizId);
  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
  }

  let correct = 0;
  const graded = quiz.questions.map((question, index) => {
    const selected =
      typeof answers[index] === "number" ? (answers[index] as number) : -1;
    const isCorrect = selected === question.correctOptionIndex;
    if (isCorrect) correct += 1;
    return {
      questionId: question.id,
      selectedOptionIndex: selected,
      correctOptionIndex: question.correctOptionIndex,
      explanation: question.explanation,
      wasCorrect: isCorrect,
    };
  });

  const score = Math.round((correct / quiz.questions.length) * 100);
  const { data, error } = await auth.supabase
    .from("expert_quiz_attempts")
    .insert({
      user_id: auth.user.id,
      user_expert_id: installation.id,
      quiz_id: quizId,
      score,
      correct_answers: correct,
      total_questions: quiz.questions.length,
      answers: graded,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Couldn't save quiz attempt." }, { status: 502 });
  }

  await recordExpertActivity(auth.supabase, {
    userId: auth.user.id,
    userExpertId: installation.id,
    activityType: "quiz_completed",
    contentId: quizId,
    metadata: { score, passed: score >= quiz.passingScore },
  });

  return NextResponse.json({
    attempt: data,
    graded,
    passed: score >= quiz.passingScore,
    passingScore: quiz.passingScore,
  });
}
