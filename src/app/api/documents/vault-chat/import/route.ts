import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveGuardianProfile,
  requireAccessibleGuardianProfile,
} from "@/lib/profiles/server";
import type { GuardianProfile } from "@/lib/profiles/types";
import type { ImportedConversation } from "@/lib/chat/import/types";
import {
  IMPORT_MAX_CONVERSATIONS,
  IMPORT_MAX_MESSAGES_PER_CONVERSATION,
} from "@/lib/chat/import/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Authed = { supabase: SupabaseClient; user: User };

type ChatSummary = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  imported_from?: "chatgpt" | "claude" | null;
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

async function resolveVaultChatProfile(
  supabase: SupabaseClient,
  user: User,
  profileIdOverride?: string | null
): Promise<GuardianProfile | null> {
  const override =
    typeof profileIdOverride === "string" && profileIdOverride.trim()
      ? profileIdOverride.trim()
      : null;
  if (override) {
    return requireAccessibleGuardianProfile(supabase, user.id, override);
  }
  return getActiveGuardianProfile(supabase, user);
}

function vaultProfileNotFoundResponse(profileIdOverride?: string | null) {
  if (profileIdOverride) {
    return NextResponse.json(
      { error: "Vault not found or not accessible." },
      { status: 403 }
    );
  }
  return NextResponse.json(
    {
      error:
        "Create a person or space first — open the dashboard and choose who you're helping.",
    },
    { status: 400 }
  );
}

async function listChats(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
): Promise<ChatSummary[]> {
  const { data } = await supabase
    .from("vault_chats")
    .select("id, title, updated_at, created_at, imported_from")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []) as ChatSummary[];
}

function isMissingImportColumns(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message ?? "";
  return (
    /imported_from|external_id/i.test(msg) &&
    /does not exist|unknown|schema cache/i.test(msg)
  );
}

function parseImportedConversation(raw: unknown): ImportedConversation | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const source = record.source;
  if (source !== "chatgpt" && source !== "claude") return null;
  const externalId =
    typeof record.externalId === "string" && record.externalId.trim()
      ? record.externalId.trim()
      : null;
  const title =
    typeof record.title === "string" && record.title.trim()
      ? record.title.trim().slice(0, 200)
      : "Imported chat";
  const createdAt =
    typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString();
  const updatedAt =
    typeof record.updatedAt === "string" ? record.updatedAt : createdAt;
  if (!externalId || !Array.isArray(record.messages)) return null;

  const messages: ImportedConversation["messages"] = [];
  for (const item of record.messages) {
    if (!item || typeof item !== "object") continue;
    const msg = item as Record<string, unknown>;
    const role = msg.role;
    const content = typeof msg.content === "string" ? msg.content.trim() : "";
    const msgCreatedAt =
      typeof msg.createdAt === "string" ? msg.createdAt : createdAt;
    if ((role !== "user" && role !== "assistant") || !content) continue;
    messages.push({ role, content, createdAt: msgCreatedAt });
    if (messages.length >= IMPORT_MAX_MESSAGES_PER_CONVERSATION) break;
  }

  if (messages.length === 0) return null;

  return {
    externalId,
    title,
    source,
    createdAt,
    updatedAt,
    messages,
  };
}

/** Import ChatGPT / Claude export conversations into vault chat threads. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let profileIdRaw: unknown;
  let conversationsRaw: unknown;
  try {
    const body = await request.json();
    profileIdRaw = body.profileId;
    conversationsRaw = body.conversations;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const profileIdOverride =
    typeof profileIdRaw === "string" && profileIdRaw.trim()
      ? profileIdRaw.trim()
      : null;
  const active = await resolveVaultChatProfile(supabase, user, profileIdOverride);
  if (!active) {
    return vaultProfileNotFoundResponse(profileIdOverride);
  }

  if (!Array.isArray(conversationsRaw) || conversationsRaw.length === 0) {
    return NextResponse.json(
      { error: "Select at least one conversation to import." },
      { status: 400 }
    );
  }

  if (conversationsRaw.length > IMPORT_MAX_CONVERSATIONS) {
    return NextResponse.json(
      {
        error: `Import up to ${IMPORT_MAX_CONVERSATIONS} conversations at a time.`,
      },
      { status: 400 }
    );
  }

  const conversations = conversationsRaw
    .map(parseImportedConversation)
    .filter((c): c is ImportedConversation => c !== null);

  if (conversations.length === 0) {
    return NextResponse.json(
      { error: "No valid conversations to import." },
      { status: 400 }
    );
  }

  let imported = 0;
  let duplicates = 0;
  let failed = 0;
  const chatIds: string[] = [];

  for (const conversation of conversations) {
    const { data: existing } = await supabase
      .from("vault_chats")
      .select("id")
      .eq("user_id", user.id)
      .eq("imported_from", conversation.source)
      .eq("external_id", conversation.externalId)
      .maybeSingle();

    if (existing?.id) {
      duplicates += 1;
      continue;
    }

    const { data: created, error: createError } = await supabase
      .from("vault_chats")
      .insert({
        user_id: user.id,
        profile_id: active.id,
        title: conversation.title,
        imported_from: conversation.source,
        external_id: conversation.externalId,
        created_at: conversation.createdAt,
        updated_at: conversation.updatedAt,
      })
      .select("id")
      .single();

    if (createError || !created?.id) {
      if (isMissingImportColumns(createError)) {
        return NextResponse.json(
          {
            error:
              "Chat import isn't set up yet. Run migration 0062_vault_chat_import.sql in Supabase.",
          },
          { status: 503 }
        );
      }
      failed += 1;
      continue;
    }

    const rows = conversation.messages.map((message) => ({
      chat_id: created.id,
      user_id: user.id,
      role: message.role,
      content: message.content,
      citations: [],
      created_at: message.createdAt,
    }));

    const { error: messagesError } = await supabase
      .from("vault_chat_messages")
      .insert(rows);

    if (messagesError) {
      await supabase.from("vault_chats").delete().eq("id", created.id);
      failed += 1;
      continue;
    }

    imported += 1;
    chatIds.push(created.id);
  }

  const chats = await listChats(supabase, user.id, active.id);

  return NextResponse.json({
    imported,
    duplicates,
    failed,
    chatIds,
    chats,
  });
}
