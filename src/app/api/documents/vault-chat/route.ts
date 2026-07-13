import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  ANALYSIS_MODEL,
  createLlmClient,
  runChatCompletion,
} from "@/lib/analysis/llm";
import {
  sanitizeChatQuestion,
  CHAT_HISTORY_MAX_TURNS,
} from "@/lib/chat/context";
import { embedQuery, isVaultEmbeddingConfigured } from "@/lib/vault/embeddings";
import {
  formatRetrievalContext,
  retrieveVaultChunks,
  selectCitationsForAnswer,
  VAULT_CHAT_SYSTEM,
} from "@/lib/vault/indexDocument";
import { ensureUserVaultIndexed } from "@/lib/vault/ensureIndexed";
import {
  buildGideonSuggestions,
  firstNameFrom,
  type SuggestionProfileKind,
  type VaultDocHint,
} from "@/lib/vault/gideon";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
import {
  askGideonContextLabel,
  type GuardianProfileType,
} from "@/lib/profiles/types";
import {
  formatDailyLogsForGideon,
  retrieveRelevantDailyLogs,
} from "@/lib/logs/retrieve";

function suggestionKindFrom(
  type: GuardianProfileType
): SuggestionProfileKind {
  if (type === "child" || type === "student") return type;
  if (type === "business" || type === "employee" || type === "client") {
    return type;
  }
  if (
    type === "spouse_partner" ||
    type === "parent" ||
    type === "family_member"
  ) {
    return "family";
  }
  if (type === "personal") return "personal";
  return "other";
}

export const runtime = "nodejs";
export const maxDuration = 60;

const CHAT_LIMIT_PER_HOUR = 30;

type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: { documentId: string; fileName: string }[];
  created_at: string;
};

type ChatSummary = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
};

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

function titleFromQuestion(question: string): string {
  const t = question.trim().replace(/\s+/g, " ");
  if (t.length <= 48) return t || "New chat";
  return `${t.slice(0, 47)}…`;
}

async function listChats(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<ChatSummary[]> {
  const { data } = await supabase
    .from("vault_chats")
    .select("id, title, updated_at, created_at")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []) as ChatSummary[];
}

/** List threads, or load one thread's messages. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const active = await getActiveGuardianProfile(supabase, user);
  const chatId = new URL(request.url).searchParams.get("chatId");
  const chats = await listChats(supabase, user.id, active.id);

  if (!chatId) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_name")
      .eq("user_id", user.id)
      .eq("profile_id", active.id);

    const docCount = docs?.length ?? 0;
    let suggestions: string[] = [];
    if (docCount > 0) {
      const { data: extracted } = await supabase
        .from("extracted_data")
        .select("document_id, document_type, guardian_status, title")
        .eq("user_id", user.id)
        .eq("profile_id", active.id);
      const nameById = new Map((docs ?? []).map((d) => [d.id, d.file_name]));
      const hints: VaultDocHint[] = (extracted ?? []).map((row) => ({
        documentType: row.document_type,
        guardianStatus: row.guardian_status,
        title: row.title,
        fileName: nameById.get(row.document_id) ?? null,
      }));
      if (hints.length === 0) {
        hints.push(
          ...((docs ?? []).map((d) => ({ fileName: d.file_name })) as VaultDocHint[])
        );
      }
      suggestions = buildGideonSuggestions(
        hints,
        suggestionKindFrom(active.profile_type)
      );
    }

    return NextResponse.json({
      chats,
      meta: {
        firstName: firstNameFrom(active.display_name),
        documentCount: docCount,
        suggestions,
        profileId: active.id,
        profileName: active.display_name,
        profileType: active.profile_type,
        askContextLabel: askGideonContextLabel(active),
      },
    });
  }

  const { data: chat } = await supabase
    .from("vault_chats")
    .select("id, title, profile_id")
    .eq("id", chatId)
    .eq("user_id", user.id)
    .eq("profile_id", active.id)
    .maybeSingle();

  if (!chat) {
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }

  const { data: messages, error } = await supabase
    .from("vault_chat_messages")
    .select("id, role, content, citations, created_at")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Couldn't load vault chat history." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    chats,
    chatId: chat.id,
    title: chat.title,
    messages: (messages ?? []) as ChatMessageRow[],
    meta: {
      profileId: active.id,
      profileName: active.display_name,
      askContextLabel: askGideonContextLabel(active),
    },
  });
}

/** Create a blank thread (New chat). */
export async function PUT() {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const active = await getActiveGuardianProfile(supabase, user);

  const { data: created, error } = await supabase
    .from("vault_chats")
    .insert({
      user_id: user.id,
      profile_id: active.id,
      title: "New chat",
    })
    .select("id, title, updated_at, created_at")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: "Couldn't create a new chat." },
      { status: 502 }
    );
  }

  const chats = await listChats(supabase, user.id, active.id);
  return NextResponse.json({ chat: created as ChatSummary, chats });
}

/** Delete a thread. */
export async function DELETE(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const active = await getActiveGuardianProfile(supabase, user);

  const chatId = new URL(request.url).searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json({ error: "Missing chatId." }, { status: 400 });
  }

  const { error } = await supabase
    .from("vault_chats")
    .delete()
    .eq("id", chatId)
    .eq("user_id", user.id)
    .eq("profile_id", active.id);

  if (error) {
    return NextResponse.json(
      { error: "Couldn't delete chat." },
      { status: 502 }
    );
  }

  const chats = await listChats(supabase, user.id, active.id);
  return NextResponse.json({ chats });
}

/** Ask a question; pass chatId to continue a thread, or omit to start a new one. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "I couldn't complete that request right now. Please try again.",
      },
      { status: 503 }
    );
  }

  if (!isVaultEmbeddingConfigured()) {
    return NextResponse.json(
      {
        error:
          "I couldn't complete that request right now. Please try again.",
      },
      { status: 503 }
    );
  }

  let questionRaw: unknown;
  let chatIdRaw: unknown;
  try {
    const body = await request.json();
    questionRaw = body.question;
    chatIdRaw = body.chatId;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = sanitizeChatQuestion(questionRaw);
  if (!question) {
    return NextResponse.json(
      { error: "Enter a question about your vault." },
      { status: 400 }
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
      { error: "We couldn't start vault chat. Please try again." },
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
      { error: "We couldn't start vault chat. Please try again." },
      { status: 502 }
    );
  }

  const active = await getActiveGuardianProfile(supabase, user);

  try {
    await ensureUserVaultIndexed(supabase, user.id, active.id);
  } catch (err) {
    console.error(
      "Vault ensure index failed:",
      err instanceof Error ? err.message : "error"
    );
  }

  const { count: chunkCount } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("profile_id", active.id);

  const { count: logCount } = await supabase
    .from("daily_logs")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .eq("profile_id", active.id);

  if ((chunkCount ?? 0) === 0 && (logCount ?? 0) === 0) {
    return NextResponse.json(
      {
        error:
          "Analyze a document or add a Daily Log so Gideon has something to search in this profile.",
      },
      { status: 409 }
    );
  }

  let chatId: string;
  let isNewChat = false;
  const requestedId =
    typeof chatIdRaw === "string" && chatIdRaw.trim() ? chatIdRaw.trim() : null;

  if (requestedId) {
    const { data: existingChat } = await supabase
      .from("vault_chats")
      .select("id, title")
      .eq("id", requestedId)
      .eq("user_id", user.id)
      .eq("profile_id", active.id)
      .maybeSingle();
    if (!existingChat) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
    chatId = existingChat.id;
  } else {
    const { data: created, error: chatError } = await supabase
      .from("vault_chats")
      .insert({
        user_id: user.id,
        profile_id: active.id,
        title: titleFromQuestion(question),
      })
      .select("id")
      .single();
    if (chatError || !created) {
      return NextResponse.json(
        { error: "Couldn't create vault chat." },
        { status: 502 }
      );
    }
    chatId = created.id;
    isNewChat = true;
  }

  const { data: priorMessages } = await supabase
    .from("vault_chat_messages")
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

  if (!isNewChat && history.length === 0) {
    await supabase
      .from("vault_chats")
      .update({ title: titleFromQuestion(question) })
      .eq("id", chatId)
      .eq("user_id", user.id)
      .eq("profile_id", active.id);
  }

  const { data: userMsg, error: userMsgError } = await supabase
    .from("vault_chat_messages")
    .insert({
      chat_id: chatId,
      user_id: user.id,
      role: "user",
      content: question,
      citations: [],
    })
    .select("id, role, content, citations, created_at")
    .single();

  if (userMsgError || !userMsg) {
    return NextResponse.json(
      { error: "Couldn't save your question." },
      { status: 502 }
    );
  }

  let citations: { documentId: string; fileName: string }[] = [];
  let answer: string;

  try {
    const queryEmbedding =
      (chunkCount ?? 0) > 0 ? await embedQuery(question) : null;
    const chunks = queryEmbedding
      ? await retrieveVaultChunks(supabase, queryEmbedding, active.id, 8)
      : [];
    const formatted = formatRetrievalContext(chunks);
    const dailyLogs = await retrieveRelevantDailyLogs(supabase, {
      userId: user.id,
      profileId: active.id,
      question,
    });
    const logContext = formatDailyLogsForGideon(dailyLogs);

    if (!formatted.context.trim() && !logContext.trim()) {
      answer =
        "I couldn't find that information in your current vault.";
      citations = [];
    } else {
      const client = createLlmClient();
      const system = `${VAULT_CHAT_SYSTEM}

Active profile: ${active.display_name} (${active.profile_type}).
Search only this profile's vault and Daily Logs. Never use other profiles' data.

--- RETRIEVED EXCERPTS (active profile documents only) ---
${formatted.context.trim() || "(none)"}
--- END EXCERPTS ---

--- RETRIEVED DAILY LOGS (active profile only; user-entered notes) ---
${logContext.trim() || "(none)"}
--- END DAILY LOGS ---`;

      answer = await runChatCompletion(client, {
        system,
        model: ANALYSIS_MODEL,
        messages: [...history, { role: "user", content: question }],
      });
      if (!answer) {
        answer =
          "I found potentially relevant information, but it needs verification before I can give you a reliable answer.";
      }
      citations = selectCitationsForAnswer(answer, chunks);
    }
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && "message" in err) {
      return NextResponse.json(
        { error: "I couldn't complete that request right now. Please try again." },
        { status: Number((err as { status: number }).status) || 502 }
      );
    }
    console.error(
      "Vault chat failed:",
      err instanceof Error ? err.name : "error"
    );
    return NextResponse.json(
      { error: "I couldn't complete that request right now. Please try again." },
      { status: 502 }
    );
  }

  const { data: assistantMsg, error: assistantError } = await supabase
    .from("vault_chat_messages")
    .insert({
      chat_id: chatId,
      user_id: user.id,
      role: "assistant",
      content: answer,
      citations,
    })
    .select("id, role, content, citations, created_at")
    .single();

  if (assistantError || !assistantMsg) {
    return NextResponse.json(
      { error: "Answer generated but couldn't be saved." },
      { status: 500 }
    );
  }

  await supabase
    .from("vault_chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId);

  const chats = await listChats(supabase, user.id, active.id);

  return NextResponse.json({
    chatId,
    chats,
    messages: [userMsg, assistantMsg] as ChatMessageRow[],
  });
}
