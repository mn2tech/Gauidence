import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ANALYSIS_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import {
  buildDocumentChatContext,
  DOCUMENT_CHAT_SYSTEM,
  sanitizeChatQuestion,
  CHAT_HISTORY_MAX_TURNS,
  type ChatFactInput,
} from "@/lib/chat/context";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHAT_LIMIT_PER_HOUR = 30;

type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type Authed = {
  supabase: SupabaseClient;
  user: User;
};

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

/** Load chat history for a document the caller owns. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;

  const { supabase, user } = auth;
  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const { data: chat } = await supabase
    .from("document_chats")
    .select("id")
    .eq("document_id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!chat) {
    return NextResponse.json({ messages: [] as ChatMessageRow[] });
  }

  const { data: messages, error } = await supabase
    .from("document_chat_messages")
    .select("id, role, content, created_at")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Couldn't load chat history." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    chatId: chat.id,
    messages: (messages ?? []) as ChatMessageRow[],
  });
}

/** Ask a question about one owned document; persists the turn. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;

  const { supabase, user } = auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "AI chat isn't set up yet on this deployment. The site owner needs to add an Anthropic (Claude) API key.",
      },
      { status: 503 }
    );
  }

  let documentId: string | undefined;
  let questionRaw: unknown;
  try {
    const body = await request.json();
    documentId = body.documentId;
    questionRaw = body.question;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!documentId) {
    return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
  }

  const question = sanitizeChatQuestion(questionRaw);
  if (!question) {
    return NextResponse.json(
      { error: "Enter a question about this document." },
      { status: 400 }
    );
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const { data: extracted } = await supabase
    .from("extracted_data")
    .select(
      "summary, facts, title, document_type, guardian_status, overall_confidence, warnings, specialist"
    )
    .eq("document_id", documentId)
    .maybeSingle();

  const contextResult = buildDocumentChatContext({
    fileName: doc.file_name,
    title: extracted?.title ?? null,
    summary: extracted?.summary ?? null,
    documentType: extracted?.document_type ?? null,
    guardianStatus: extracted?.guardian_status ?? null,
    overallConfidence: extracted?.overall_confidence ?? null,
    warnings: Array.isArray(extracted?.warnings)
      ? (extracted.warnings as string[])
      : null,
    facts: Array.isArray(extracted?.facts)
      ? (extracted.facts as ChatFactInput[])
      : null,
    specialist:
      extracted?.specialist && typeof extracted.specialist === "object"
        ? (extracted.specialist as Record<string, unknown>)
        : null,
  });

  if (!contextResult.ok) {
    return NextResponse.json(
      {
        error:
          "Analyze this document first, then you can ask questions about it.",
      },
      { status: 409 }
    );
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("chat_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", hourAgo);
  if (countError) {
    return NextResponse.json(
      { error: "We couldn't start the chat. Please try again." },
      { status: 502 }
    );
  }
  if ((count ?? 0) >= CHAT_LIMIT_PER_HOUR) {
    return NextResponse.json(
      {
        error:
          "You've reached the chat limit for now. Try again in about an hour.",
      },
      { status: 429 }
    );
  }

  const { error: eventError } = await supabase.from("chat_events").insert({
    user_id: user.id,
  });
  if (eventError) {
    return NextResponse.json(
      { error: "We couldn't start the chat. Please try again." },
      { status: 502 }
    );
  }

  let chatId: string;
  const { data: existingChat } = await supabase
    .from("document_chats")
    .select("id")
    .eq("document_id", documentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingChat) {
    chatId = existingChat.id;
  } else {
    const { data: created, error: chatError } = await supabase
      .from("document_chats")
      .insert({
        document_id: documentId,
        user_id: user.id,
      })
      .select("id")
      .single();
    if (chatError || !created) {
      return NextResponse.json(
        { error: "Couldn't create chat thread." },
        { status: 502 }
      );
    }
    chatId = created.id;
  }

  const { data: priorMessages } = await supabase
    .from("document_chat_messages")
    .select("role, content")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  const history = (priorMessages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-CHAT_HISTORY_MAX_TURNS * 2)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content),
    }));

  const { data: userMsg, error: userMsgError } = await supabase
    .from("document_chat_messages")
    .insert({
      chat_id: chatId,
      user_id: user.id,
      role: "user",
      content: question,
    })
    .select("id, role, content, created_at")
    .single();

  if (userMsgError || !userMsg) {
    return NextResponse.json(
      { error: "Couldn't save your question." },
      { status: 502 }
    );
  }

  const system = `${DOCUMENT_CHAT_SYSTEM}

--- DOCUMENT CONTEXT ---
${contextResult.context}
--- END DOCUMENT CONTEXT ---`;

  let answer: string;
  try {
    const client = createLlmClient();
    answer = await runChatCompletion(client, {
      system,
      model: ANALYSIS_MODEL,
      messages: [...history, { role: "user", content: question }],
    });
    if (!answer) {
      answer =
        "I couldn't generate an answer from this document. Try rephrasing your question.";
    }
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && "message" in err) {
      return NextResponse.json(
        { error: String((err as { message: string }).message) },
        { status: Number((err as { status: number }).status) || 502 }
      );
    }
    return NextResponse.json(
      { error: "The AI service couldn't answer. Please try again." },
      { status: 502 }
    );
  }

  const { data: assistantMsg, error: assistantError } = await supabase
    .from("document_chat_messages")
    .insert({
      chat_id: chatId,
      user_id: user.id,
      role: "assistant",
      content: answer,
    })
    .select("id, role, content, created_at")
    .single();

  if (assistantError || !assistantMsg) {
    return NextResponse.json(
      { error: "Answer generated but couldn't be saved." },
      { status: 500 }
    );
  }

  await supabase
    .from("document_chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId);

  return NextResponse.json({
    chatId,
    messages: [userMsg, assistantMsg] as ChatMessageRow[],
  });
}
