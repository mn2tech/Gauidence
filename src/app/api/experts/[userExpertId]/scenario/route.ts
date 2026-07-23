import { NextResponse } from "next/server";
import { getExpertScenario } from "@/lib/experts/load-expert";
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

  const scenarioId = new URL(request.url).searchParams.get("scenarioId")?.trim() ?? "";
  if (!scenarioId) {
    return NextResponse.json({ error: "scenarioId is required." }, { status: 400 });
  }

  const scenario = getExpertScenario(installation.expert_id, scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }

  const publicScenario = {
    id: scenario.id,
    title: scenario.title,
    difficulty: scenario.difficulty,
    category: scenario.category,
    fictional: scenario.fictional,
    notice: scenario.notice,
    context: scenario.context,
    records: scenario.records,
    question: scenario.question,
    choices: scenario.choices,
  };

  const { data: attempts } = await auth.supabase
    .from("expert_scenario_attempts")
    .select("*")
    .eq("user_expert_id", installation.id)
    .eq("scenario_id", scenarioId)
    .order("completed_at", { ascending: false })
    .limit(1);

  return NextResponse.json({
    scenario: publicScenario,
    latestAttempt: attempts?.[0] ?? null,
  });
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

  const scenarioId = typeof body.scenarioId === "string" ? body.scenarioId.trim() : "";
  const selectedChoiceIndex =
    typeof body.selectedChoiceIndex === "number" ? body.selectedChoiceIndex : null;
  if (!scenarioId || selectedChoiceIndex === null) {
    return NextResponse.json(
      { error: "scenarioId and selectedChoiceIndex are required." },
      { status: 400 }
    );
  }

  const scenario = getExpertScenario(installation.expert_id, scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: "Scenario not found." }, { status: 404 });
  }

  const wasCorrect = selectedChoiceIndex === scenario.correctChoiceIndex;
  const { data, error } = await auth.supabase
    .from("expert_scenario_attempts")
    .insert({
      user_id: auth.user.id,
      user_expert_id: installation.id,
      scenario_id: scenarioId,
      selected_choice_index: selectedChoiceIndex,
      was_correct: wasCorrect,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Couldn't save scenario attempt." }, { status: 502 });
  }

  await recordExpertActivity(auth.supabase, {
    userId: auth.user.id,
    userExpertId: installation.id,
    activityType: "scenario_completed",
    contentId: scenarioId,
    metadata: { wasCorrect },
  });

  return NextResponse.json({
    attempt: data,
    wasCorrect,
    explanation: scenario.explanation,
    learningPoints: scenario.learningPoints,
    correctChoiceIndex: scenario.correctChoiceIndex,
  });
}
