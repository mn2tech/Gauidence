import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import type { Fact } from "@/lib/analysis";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const MAX_ANALYZE_BYTES = 15 * 1024 * 1024;

const EXTRACTION_SCHEMA = {
  name: "document_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
        description:
          "2-3 sentence plain-language summary of what this document is and why it matters.",
      },
      facts: {
        type: "array",
        description:
          "Key facts stated LITERALLY in the document: names, numbers, amounts, dates, policy/account identifiers.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string", description: "Short name of the fact." },
            value: { type: "string", description: "The fact exactly as stated." },
            date: {
              type: ["string", "null"],
              description:
                "ISO date YYYY-MM-DD if this fact is a specific date stated in the document, otherwise null.",
            },
            is_deadline: {
              type: "boolean",
              description:
                "True when the date is something the owner must act on or before (renewal, expiration, due date).",
            },
          },
          required: ["label", "value", "date", "is_deadline"],
        },
      },
      recommendations: {
        type: "array",
        description:
          "1-3 practical suggestions for the document owner. These are AI-generated advice, not document content.",
        items: { type: "string" },
      },
    },
    required: ["summary", "facts", "recommendations"],
  },
} as const;

const SYSTEM_PROMPT = `You extract information from personal documents (insurance policies, IDs, leases, letters, bills).
Rules:
- "facts" may ONLY contain information literally present in the document. Never infer or invent a fact.
- If you cannot read the document or it contains no useful facts, return an empty facts list and say so in the summary.
- Dates must be returned in ISO format (YYYY-MM-DD). Only set is_deadline=true for dates requiring action on or before them.
- Recommendations are clearly separated advice; keep them practical and short.`;

type ModelFact = {
  label: string;
  value: string;
  date: string | null;
  is_deadline: boolean;
};

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso).getTime() - today.getTime()) / 86_400_000);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "AI analysis isn't set up yet on this deployment. The site owner needs to add an OpenAI API key.",
      },
      { status: 503 }
    );
  }

  let documentId: string | undefined;
  try {
    ({ documentId } = await request.json());
  } catch {
    // fall through to the validation below
  }
  if (!documentId) {
    return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
  }

  // RLS limits this to the caller's own documents.
  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, file_path, mime_type, size_bytes")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (doc.size_bytes > MAX_ANALYZE_BYTES) {
    return NextResponse.json(
      { error: "This document is too large to analyze." },
      { status: 413 }
    );
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from("documents")
    .download(doc.file_path);
  if (downloadError || !file) {
    return NextResponse.json(
      { error: "We couldn't read the stored file. Try again in a moment." },
      { status: 502 }
    );
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const dataUrl = `data:${doc.mime_type};base64,${base64}`;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
    doc.mime_type === "application/pdf"
      ? [
          { type: "text", text: "Extract the key information from this document." },
          {
            type: "file",
            file: { filename: doc.file_name, file_data: dataUrl },
          },
        ]
      : [
          { type: "text", text: "Extract the key information from this document." },
          { type: "image_url", image_url: { url: dataUrl } },
        ];

  let parsed: { summary: string; facts: ModelFact[]; recommendations: string[] };
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA },
    });
    parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch (err) {
    console.error("OpenAI analysis failed:", err);
    return NextResponse.json(
      { error: "The AI service couldn't analyze this document. Please try again." },
      { status: 502 }
    );
  }

  // Assemble the transparent fact list: document facts as returned, date math
  // done here in code (calculated), recommendations labeled as AI-generated.
  const facts: Fact[] = [];
  const deadlines: { title: string; due_date: string }[] = [];

  for (const f of parsed.facts ?? []) {
    facts.push({ label: f.label, value: f.value, source: "document", date: f.date });
    if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) {
      const days = daysUntil(f.date);
      if (f.is_deadline) {
        facts.push({
          label: `${f.label} — time remaining`,
          value:
            days > 0
              ? `${days} day${days === 1 ? "" : "s"} from today`
              : days === 0
                ? "Today"
                : `${Math.abs(days)} day${days === -1 ? "" : "s"} ago`,
          source: "calculated",
          date: f.date,
        });
        if (days >= 0) {
          deadlines.push({ title: `${doc.file_name}: ${f.label}`, due_date: f.date });
        }
      }
    }
  }
  for (const rec of parsed.recommendations ?? []) {
    facts.push({ label: "Suggestion", value: rec, source: "ai_generated", date: null });
  }

  const { error: saveError } = await supabase.from("extracted_data").upsert(
    {
      document_id: doc.id,
      user_id: user.id,
      summary: parsed.summary ?? "",
      facts,
      model: MODEL,
    },
    { onConflict: "document_id" }
  );
  if (saveError) {
    return NextResponse.json(
      { error: "Analysis finished but couldn't be saved. Please try again." },
      { status: 500 }
    );
  }

  // Replace this document's alerts with the fresh set.
  await supabase.from("alerts").delete().eq("document_id", doc.id);
  if (deadlines.length > 0) {
    await supabase.from("alerts").insert(
      deadlines.map((d) => ({
        document_id: doc.id,
        user_id: user.id,
        title: d.title,
        due_date: d.due_date,
        source: "document",
      }))
    );
  }

  return NextResponse.json({
    summary: parsed.summary ?? "",
    facts,
    model: MODEL,
    analyzedAt: new Date().toISOString(),
  });
}
