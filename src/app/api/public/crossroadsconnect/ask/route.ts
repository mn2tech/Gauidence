import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAnonServerClient } from "@/lib/supabase/anon";
import { answerCrossroadsPublicQuestion } from "@/lib/knowledge-studio/ask";
import { loadPublishedOrgKnowledge } from "@/lib/knowledge-studio/retrieve";
import { CROSSROADS_ORG_SLUG } from "@/lib/knowledge-studio/constants";

export const runtime = "nodejs";

/**
 * Public CrossRoads Ask — published+public facts and events only.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
  };
  const question = typeof body.question === "string" ? body.question.trim() : "";
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
    const knowledge = await loadPublishedOrgKnowledge(
      supabase,
      CROSSROADS_ORG_SLUG
    );
    const result = await answerCrossroadsPublicQuestion({
      question,
      knowledge,
    });
    const sources = [
      ...knowledge.facts.map(
        (f) => f.source_label || "Published CrossRoads Connect knowledge"
      ),
      ...knowledge.events.map(
        (e) => e.source_label || "Published CrossRoads Connect event"
      ),
    ].filter(Boolean);
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
    console.error("Public Crossroads ask failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
