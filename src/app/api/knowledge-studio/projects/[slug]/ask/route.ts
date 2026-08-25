import { NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/knowledge-studio/projects/apiContext";
import { answerProjectTestQuestion } from "@/lib/knowledge-studio/projects/ask";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ slug: string }> };

/** Test Gideon against published project knowledge only. */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const ctx = await requireProjectAdmin(slug);
  if (ctx instanceof NextResponse) return ctx;

  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    school?: string;
  };
  const question = typeof body.question === "string" ? body.question : "";
  if (!question.trim()) {
    return NextResponse.json({ error: "question is required." }, { status: 400 });
  }

  try {
    const result = await answerProjectTestQuestion({
      admin: ctx.admin,
      projectId: ctx.loaded.project.id,
      question,
      schoolHint: typeof body.school === "string" ? body.school : null,
      authorityDefault: ctx.loaded.project.authority_default ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Test Gideon failed.";
    console.error("Test Gideon failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
