import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  createAnalysisClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import {
  isAnthropicConfigured,
  isDeepSeekConfigured,
} from "@/lib/analysis/chatProvider";
import {
  buildGuardianCoachSystemPrompt,
  parseCoachAssistantMessage,
  type CoachMessage,
} from "@/lib/onboarding/coach";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

async function requireUser(): Promise<Authed | NextResponse> {
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
    return NextResponse.json(
      { error: "You need to be signed in." },
      { status: 401 }
    );
  }
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

function parseMessages(value: unknown): CoachMessage[] | null {
  if (!Array.isArray(value)) return null;
  const messages: CoachMessage[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const role = (row as { role?: unknown }).role;
    const content = (row as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || !content.trim()) return null;
    messages.push({ role, content: content.trim().slice(0, 2000) });
  }
  if (messages.length === 0 || messages.length > 12) return null;
  if (messages[messages.length - 1]?.role !== "user") return null;
  return messages;
}

/** One Guardian Coach turn (conversational onboarding). */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { user } = auth;

  if (!isAnthropicConfigured() && !isDeepSeekConfigured()) {
    return NextResponse.json(
      {
        error:
          "Guardian Coach isn't available right now. Pick an option below instead.",
      },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const messages = parseMessages(body.messages);
  if (!messages) {
    return NextResponse.json(
      { error: "Send a valid message history." },
      { status: 400 }
    );
  }

  try {
    const meta = user.user_metadata ?? {};
    const fullName =
      (typeof meta.full_name === "string" && meta.full_name.trim()) ||
      (typeof meta.name === "string" && meta.name.trim()) ||
      null;

    const raw = await runChatCompletion(createAnalysisClient(), {
      system: buildGuardianCoachSystemPrompt(fullName),
      messages,
      maxTokens: 700,
    });

    const { reply, setup } = parseCoachAssistantMessage(raw);
    if (!reply && !setup) {
      return NextResponse.json(
        { error: "Couldn't get a coach response. Try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      reply: reply || "Here's what I recommend for your Guardian setup.",
      setup,
    });
  } catch (err) {
    console.error(
      "Guardian Coach failed:",
      err instanceof Error ? err.message : "error"
    );
    return NextResponse.json(
      { error: "Couldn't reach Gideon right now. Try again or pick an option." },
      { status: 502 }
    );
  }
}
