import { NextResponse } from "next/server";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { createClient } from "@/lib/supabase/server";
import { answerSummitPublicQuestion } from "@/lib/summit-space/ask";
import { loadPublishedSummitKnowledge } from "@/lib/summit-space/retrieve";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * Public Gideon Q&A for summit spaces — published knowledge only.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { slug } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
  };
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Ask a question" }, { status: 400 });
  }

  const supabase = createAnonServerClient() ?? (await createClient());
  if (!supabase) {
    return NextResponse.json(
      { error: "Guardian is not configured" },
      { status: 503 }
    );
  }

  try {
    const knowledge = await loadPublishedSummitKnowledge(supabase, slug);
    if (!knowledge) {
      return NextResponse.json({ error: "Summit not found" }, { status: 404 });
    }

    const result = await answerSummitPublicQuestion({ question, knowledge });
    const sources = knowledge.entities
      .map((e) => e.source_label)
      .filter(Boolean) as string[];

    return NextResponse.json({
      answer: result.answer,
      usedKnowledge: result.usedKnowledge,
      sources: result.usedKnowledge
        ? [...new Set(sources)].slice(0, 5)
        : [],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not answer right now.";
    console.error("Public summit ask failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
