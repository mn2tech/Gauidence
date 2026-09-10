import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { answerProjectTestQuestion } from "@/lib/knowledge-studio/projects/ask";
import { loadKnowledgeProject } from "@/lib/knowledge-studio/projects/loadProject";
import {
  CLS_AUTHORITY,
  CLS_PROJECT_SLUG,
  NO_VERIFIED_CLS_ANSWER,
} from "@/lib/knowledge-studio/projects/constants";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Public Covenant Life School Ask — published knowledge items only.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
  };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Guardian is not configured." },
      { status: 503 }
    );
  }

  try {
    const loaded = await loadKnowledgeProject(admin, CLS_PROJECT_SLUG);
    if (!loaded) {
      return NextResponse.json(
        { error: "Covenant Life School knowledge is not available yet." },
        { status: 404 }
      );
    }

    const result = await answerProjectTestQuestion({
      admin,
      projectId: loaded.project.id,
      question,
      schoolHint: "Covenant Life School",
      authorityDefault:
        loaded.project.authority_default ?? CLS_AUTHORITY,
      emptyAnswer: NO_VERIFIED_CLS_ANSWER,
    });

    const sources = result.usedKnowledge
      ? [
          ...new Set(
            result.sources_used.map((s) => {
              const parts = [s.authority ?? CLS_AUTHORITY, s.source_name].filter(
                Boolean
              );
              if (s.source_url) parts.push(s.source_url);
              return parts.join(" · ");
            })
          ),
        ].slice(0, 5)
      : [];

    return NextResponse.json({
      answer: result.answer,
      usedKnowledge: result.usedKnowledge,
      sources,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not answer right now.";
    console.error("Public Covenant Life ask failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
