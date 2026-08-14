import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getUserTimeZone } from "@/lib/timezone/server";
import {
  sanitizeChatQuestion,
  CHAT_HISTORY_MAX_TURNS,
} from "@/lib/chat/context";
import { generateVaultChatTitle } from "@/lib/chat/generateVaultChatTitle";
import { shouldGenerateVaultChatTitle } from "@/lib/chat/vaultChatTitle";
import { isVaultEmbeddingConfigured } from "@/lib/vault/embeddings";
import { buildAskVaultInventory, buildInventoryQuestionAnswer, wantsVaultFileInventory } from "@/lib/vault/askInventory";
import { enqueueMissingVaultIndexing } from "@/lib/vault/ensureIndexed";
import {
  buildGideonSuggestions,
  buildGideonLogSuggestions,
  buildGideonVaultGuidance,
  buildCurrentTimeAnswer,
  buildTodayDateAnswer,
  isSimpleCurrentTimeQuestion,
  isSimpleTodayDateQuestion,
  getVaultTemplate,
  firstNameFrom,
  wantsTranscription,
  type VaultDocHint,
} from "@/lib/vault/gideon";
import { loadAttachedVaultDocument } from "@/lib/vault/attachedDocument";
import { wantsShowPictures } from "@/lib/vault/images";
import { chatScopedProfilePayload } from "@/lib/vault/detectVaultScope";
import {
  listGuardianProfiles,
  getActiveGuardianProfile,
  requireAccessibleGuardianProfile,
} from "@/lib/profiles/server";
import type { GuardianProfile } from "@/lib/profiles/types";
import { askGideonContextLabel } from "@/lib/profiles/types";
import { parseProposedReminder } from "@/lib/reminders/propose";
import { withLlmUsage } from "@/lib/usage/record";
import { assertBillingQuota, recordChatEvent } from "@/lib/billing/quota";
import { refreshUserAwards } from "@/lib/awards/grant";
import { createVaultChatStreamResponse } from "@/lib/vault/vaultChatStream.server";
import { formatVaultChatError } from "@/lib/vault/vaultChatErrors";
import { isChatLlmConfigured } from "@/lib/analysis/chatProvider";
import { runDirectAction } from "@/lib/actions/runner.server";
import { getMatchingActions } from "@/lib/actions/registry";
import { buildGideonThinkingSteps } from "@/lib/actions/thinkingSteps";
import {
  listActionTimeline,
  recordActionEvent,
  startOfUtcDay,
} from "@/lib/actions/events";
import type { ActionContext } from "@/lib/actions/types";
import { isKnowledgeEngineEnabled } from "@/lib/features/knowledge-engine";
import {
  listProactiveSuggestions,
  listWorkspaceTimeline,
} from "@/lib/knowledge/queries";
import {
  askGideonScopeMeta,
  buildGideonSystemPrompt,
  gideonMaxTokens,
  loadWorkspaceContext,
  parseSearchScope,
  isSearchScopeMode,
  resolveWorkspaceScopes,
  suggestionKindFrom,
  type SearchScopeMode,
} from "@/lib/workspace-context";
import {
  loadCalendarPromptNote,
  resolveGideonLoad,
  routeGideonRequest,
} from "@/lib/gideon/orchestrator";
import {
  buildFocusRemainingAnswer,
  formatFocusBlockPromptNote,
  isFocusRemainingQuestion,
  isValidFocusBlock,
  parseFocusBlockStart,
  type GideonFocusBlock,
} from "@/lib/gideon/focusBlock";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: {
    documentId: string;
    fileName: string;
    profileName?: string;
    isImage?: boolean;
    kind?: "vault" | "connector";
    sourceId?: string;
    itemId?: string;
    sourceType?: string;
    mimeType?: string | null;
  }[];
  vaultScope?: {
    profileId: string;
    profileName: string;
    activeProfileName: string;
  } | null;
  created_at: string;
};

type ChatSummary = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
};

type VaultChatRow = {
  id: string;
  title: string;
  profile_id: string;
  scoped_profile_id?: string | null;
  search_scope?: string | null;
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
    .select("id, title, updated_at, created_at, imported_from")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []) as ChatSummary[];
}

function isMissingSearchScopeColumn(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message ?? "";
  return /search_scope/i.test(msg) && /does not exist|unknown|schema cache/i.test(msg);
}

function isMissingScopedProfileColumn(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const msg = error.message ?? "";
  return /scoped_profile_id/i.test(msg) && /does not exist|unknown|schema cache/i.test(msg);
}

/** Load a chat row by id; RLS enforces owner + vault access. */
async function loadVaultChatById(
  supabase: SupabaseClient,
  chatId: string
): Promise<
  | { ok: true; chat: VaultChatRow }
  | { ok: false; reason: "not_found" | "query_error"; detail?: string }
> {
  const scoped = await supabase
    .from("vault_chats")
    .select("id, title, profile_id, scoped_profile_id, search_scope")
    .eq("id", chatId)
    .maybeSingle();

  if (!scoped.error) {
    if (!scoped.data) return { ok: false, reason: "not_found" };
    return {
      ok: true,
      chat: {
        ...(scoped.data as VaultChatRow),
        search_scope: parseSearchScope(scoped.data.search_scope),
      },
    };
  }

  if (isMissingSearchScopeColumn(scoped.error)) {
    const withoutScope = await supabase
      .from("vault_chats")
      .select("id, title, profile_id, scoped_profile_id")
      .eq("id", chatId)
      .maybeSingle();
    if (!withoutScope.error) {
      if (!withoutScope.data) return { ok: false, reason: "not_found" };
      return {
        ok: true,
        chat: {
          ...(withoutScope.data as VaultChatRow),
          search_scope: "workspace",
        },
      };
    }
  }

  if (isMissingScopedProfileColumn(scoped.error)) {
    const base = await supabase
      .from("vault_chats")
      .select("id, title, profile_id")
      .eq("id", chatId)
      .maybeSingle();
    if (base.error) {
      console.error(
        "vault_chats load failed:",
        base.error.code,
        base.error.message
      );
      return { ok: false, reason: "query_error", detail: base.error.message };
    }
    if (!base.data) return { ok: false, reason: "not_found" };
    return {
      ok: true,
      chat: { ...base.data, scoped_profile_id: null, search_scope: "workspace" },
    };
  }

  console.error(
    "vault_chats load failed:",
    scoped.error.code,
    scoped.error.message
  );
  return { ok: false, reason: "query_error", detail: scoped.error.message };
}

async function clearVaultChatScopedProfile(
  supabase: SupabaseClient,
  chatId: string
): Promise<void> {
  const { error } = await supabase
    .from("vault_chats")
    .update({ scoped_profile_id: null })
    .eq("id", chatId);
  if (error && !isMissingScopedProfileColumn(error)) {
    console.error(
      "vault_chats scoped_profile clear failed:",
      error.code,
      error.message
    );
  }
}

async function setVaultChatScopedProfile(
  supabase: SupabaseClient,
  chatId: string,
  profileId: string
): Promise<void> {
  const { error } = await supabase
    .from("vault_chats")
    .update({
      scoped_profile_id: profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chatId);
  if (error && !isMissingScopedProfileColumn(error)) {
    console.error(
      "vault_chats scoped_profile set failed:",
      error.code,
      error.message
    );
  }
}

async function setVaultChatSearchScope(
  supabase: SupabaseClient,
  chatId: string,
  searchScope: SearchScopeMode
): Promise<void> {
  const { error } = await supabase
    .from("vault_chats")
    .update({
      search_scope: searchScope,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chatId);
  if (error && !isMissingSearchScopeColumn(error)) {
    console.error(
      "vault_chats search_scope set failed:",
      error.code,
      error.message
    );
  }
}

async function updateVaultChatRow(
  supabase: SupabaseClient,
  chatId: string,
  updates: {
    updated_at: string;
    title?: string;
    scoped_profile_id?: string | null;
    search_scope?: SearchScopeMode;
  }
): Promise<void> {
  const { error } = await supabase
    .from("vault_chats")
    .update(updates)
    .eq("id", chatId);
  if (!error) return;

  if (
    isMissingScopedProfileColumn(error) &&
    "scoped_profile_id" in updates
  ) {
    const { scoped_profile_id: _ignored, ...rest } = updates;
    const retry = await supabase.from("vault_chats").update(rest).eq("id", chatId);
    if (retry.error) {
      console.error(
        "vault_chats update failed:",
        retry.error.code,
        retry.error.message
      );
    }
    return;
  }

  if (isMissingSearchScopeColumn(error) && "search_scope" in updates) {
    const { search_scope: _ignored, ...rest } = updates;
    const retry = await supabase.from("vault_chats").update(rest).eq("id", chatId);
    if (retry.error) {
      console.error(
        "vault_chats update failed:",
        retry.error.code,
        retry.error.message
      );
    }
    return;
  }

  console.error("vault_chats update failed:", error.code, error.message);
}

async function loadAskVaultInventory(
  supabase: SupabaseClient,
  profileId: string
) {
  const [{ data: docs }, { data: logs }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, file_name, mime_type")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false }),
    supabase
      .from("daily_logs")
      .select("title, log_date, content")
      .eq("profile_id", profileId)
      .order("log_date", { ascending: false })
      .limit(40),
  ]);

  return {
    docs: docs ?? [],
    inventory: buildAskVaultInventory(docs ?? [], logs ?? []),
  };
}

/** List threads, or load one thread's messages. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  const chatIdRaw = url.searchParams.get("chatId");
  const chatId = chatIdRaw?.trim() ? chatIdRaw.trim() : null;

  if (chatId) {
    const accessibleProfiles = await listGuardianProfiles(supabase, user.id);

    const loaded = await loadVaultChatById(supabase, chatId);
    if (!loaded.ok) {
      if (loaded.reason === "query_error") {
        return NextResponse.json(
          { error: "Couldn't load vault chat history." },
          { status: 502 }
        );
      }
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
    const chat = loaded.chat;

    const chatProfile = await requireAccessibleGuardianProfile(
      supabase,
      user.id,
      String(chat.profile_id)
    );
    if (!chatProfile) {
      return NextResponse.json(
        { error: "Vault not found or not accessible." },
        { status: 403 }
      );
    }

    const threadChats = await listChats(supabase, user.id, chatProfile.id);

    const scopedProfile =
      typeof chat.scoped_profile_id === "string"
        ? accessibleProfiles.find((p) => p.id === chat.scoped_profile_id) ??
          null
        : null;

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

    const profileKind = suggestionKindFrom(chatProfile.profile_type);
    const template = getVaultTemplate(profileKind);
    const scopeMeta = await askGideonScopeMeta(supabase, user.id, chatProfile, {
      chatHomeProfileId: chatProfile.id,
      chatScopedProfileId: chat.scoped_profile_id,
      searchScope: parseSearchScope(chat.search_scope),
      accessibleProfiles,
    });

    return NextResponse.json({
      chats: threadChats,
      chatId: chat.id,
      title: chat.title,
      messages: (messages ?? []) as ChatMessageRow[],
      meta: {
        profileId: chatProfile.id,
        profileName: chatProfile.display_name,
        profileType: chatProfile.profile_type,
        askContextLabel: askGideonContextLabel(chatProfile),
        chatContextLabel: scopeMeta.chatContextLabel,
        vaultScopeNote: scopeMeta.vaultScopeNote,
        searchScope: parseSearchScope(chat.search_scope),
        templateLabel: template.label,
        templateBadge: template.badge,
        chatScopedProfile: scopedProfile
          ? {
              profileId: scopedProfile.id,
              profileName: scopedProfile.display_name,
            }
          : null,
        ...(await loadAskVaultInventory(supabase, chatProfile.id))
          .inventory,
      },
    });
  }

  const profileIdParam = url.searchParams.get("profileId");
  const active = await resolveVaultChatProfile(supabase, user, profileIdParam);
  if (!active) {
    return vaultProfileNotFoundResponse(profileIdParam);
  }
  const chats = await listChats(supabase, user.id, active.id);

  {
    const { docs, inventory } = await loadAskVaultInventory(
      supabase,
      active.id
    );

    const docCount = inventory.documentCount + inventory.photoCount;
    const logCount = inventory.logCount;

    let suggestions: string[] = [];
    let guidance = null;
    const profileKind = suggestionKindFrom(active.profile_type);

    if (docCount > 0) {
      const { data: extracted } = await supabase
        .from("extracted_data")
        .select("document_id, document_type, guardian_status, title")
        .eq("profile_id", active.id);
      const nameById = new Map(docs.map((d) => [d.id, d.file_name]));
      const hints: VaultDocHint[] = (extracted ?? []).map((row) => ({
        documentType: row.document_type,
        guardianStatus: row.guardian_status,
        title: row.title,
        fileName: nameById.get(row.document_id) ?? null,
      }));
      if (hints.length === 0) {
        hints.push(
          ...(docs.map((d) => ({ fileName: d.file_name })) as VaultDocHint[])
        );
      }
      suggestions = buildGideonSuggestions(
        hints,
        profileKind
      );
    } else if (logCount > 0) {
      suggestions = buildGideonLogSuggestions(profileKind);
    } else {
      const guide = buildGideonVaultGuidance(profileKind, active.display_name);
      guidance = {
        headline: guide.headline,
        intro: guide.intro,
        tips: guide.tips,
        badge: guide.badge,
        label: guide.label,
        suggestedUploads: guide.suggestedUploads,
      };
      suggestions = guide.suggestions;
    }

    const template = getVaultTemplate(profileKind);
    // Non-empty vaults still need template chrome (badge / context) on welcome.
    if (!guidance) {
      guidance = {
        headline: template.welcomeTitle,
        intro: template.description,
        tips: template.suggestedUploads,
        badge: template.badge,
        label: template.label,
        suggestedUploads: template.suggestedUploads,
      };
    }

    const scopeMeta = await askGideonScopeMeta(supabase, user.id, active);

    const actionTimeline = await listActionTimeline(supabase, user.id, {
      since: startOfUtcDay(),
      limit: 12,
      profileId: active.id,
    });

    const intelligenceEnabled = isKnowledgeEngineEnabled();
    const [proactiveSuggestions, workspaceTimeline] = intelligenceEnabled
      ? await Promise.all([
          listProactiveSuggestions(supabase, user.id, {
            profileId: active.id,
            limit: 5,
          }),
          listWorkspaceTimeline(supabase, user.id, {
            profileId: active.id,
            limit: 6,
          }),
        ])
      : [[], []];

    const { data: account } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      chats,
      meta: {
        // Greet the account owner — profiles are vault contexts, not the user.
        firstName: firstNameFrom(
          account?.full_name ??
            user.user_metadata?.full_name ??
            user.user_metadata?.name ??
            user.email
        ),
        documentCount: inventory.documentCount,
        photoCount: inventory.photoCount,
        logCount: inventory.logCount,
        documentNames: inventory.documentNames,
        photoNames: inventory.photoNames,
        logNames: inventory.logNames,
        documentNamesMore: inventory.documentNamesMore,
        photoNamesMore: inventory.photoNamesMore,
        logNamesMore: inventory.logNamesMore,
        suggestions,
        guidance,
        profileId: active.id,
        profileName: active.display_name,
        profileType: active.profile_type,
        askContextLabel: askGideonContextLabel(active),
        chatContextLabel: scopeMeta.chatContextLabel,
        vaultScopeNote: scopeMeta.vaultScopeNote,
        searchScope: "workspace" as const,
        templateLabel: template.label,
        templateBadge: template.badge,
        actionTimeline,
        proactiveSuggestions: intelligenceEnabled ? proactiveSuggestions : undefined,
        workspaceTimeline: intelligenceEnabled ? workspaceTimeline : undefined,
      },
    });
  }
}

/** Clear temporary cross-vault scope on a chat thread. */
export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let chatIdRaw: unknown;
  let clearScopedProfile = false;
  let setScopedProfileRaw: unknown;
  let setSearchScopeRaw: unknown;
  try {
    const body = await request.json();
    chatIdRaw = body.chatId;
    clearScopedProfile = body.clearScopedProfile === true;
    setScopedProfileRaw = body.setScopedProfile;
    setSearchScopeRaw = body.setSearchScope;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const chatId =
    typeof chatIdRaw === "string" && chatIdRaw.trim() ? chatIdRaw.trim() : null;
  const setScopedProfile =
    typeof setScopedProfileRaw === "string" && setScopedProfileRaw.trim()
      ? setScopedProfileRaw.trim()
      : null;
  const setSearchScope = isSearchScopeMode(setSearchScopeRaw)
    ? setSearchScopeRaw
    : null;

  if (
    !chatId ||
    (!clearScopedProfile && !setScopedProfile && !setSearchScope)
  ) {
    return NextResponse.json({ error: "Missing chatId or action." }, { status: 400 });
  }

  const loaded = await loadVaultChatById(supabase, chatId);
  if (!loaded.ok) {
    if (loaded.reason === "query_error") {
      return NextResponse.json(
        { error: "Couldn't update chat scope." },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: "Chat not found." }, { status: 404 });
  }
  const chatProfile = await requireAccessibleGuardianProfile(
    supabase,
    user.id,
    String(loaded.chat.profile_id)
  );
  if (!chatProfile) {
    return NextResponse.json(
      { error: "Vault not found or not accessible." },
      { status: 403 }
    );
  }

  if (clearScopedProfile) {
    await clearVaultChatScopedProfile(supabase, chatId);
    return NextResponse.json({ ok: true, chatScopedProfile: null });
  }

  const accessibleProfiles = await listGuardianProfiles(supabase, user.id);

  if (setSearchScope) {
    await setVaultChatSearchScope(supabase, chatId, setSearchScope);
    const scopeMeta = await askGideonScopeMeta(supabase, user.id, chatProfile, {
      chatHomeProfileId: chatProfile.id,
      chatScopedProfileId: loaded.chat.scoped_profile_id,
      searchScope: setSearchScope,
      accessibleProfiles,
    });
    return NextResponse.json({
      ok: true,
      searchScope: setSearchScope,
      vaultScopeNote: scopeMeta.vaultScopeNote,
    });
  }

  const scopedMatch = accessibleProfiles.find((p) => p.id === setScopedProfile);
  if (!scopedMatch) {
    return NextResponse.json(
      { error: "Vault not found or not accessible." },
      { status: 403 }
    );
  }

  await setVaultChatScopedProfile(supabase, chatId, scopedMatch.id);

  const chatScopedProfile = chatScopedProfilePayload({
    scopedProfileId: scopedMatch.id,
    accessibleProfiles,
    chatHomeProfileId: String(loaded.chat.profile_id),
  });

  return NextResponse.json({ ok: true, chatScopedProfile });
}

/** Create a blank thread (New chat). */
export async function PUT(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const profileIdParam = new URL(request.url).searchParams.get("profileId");
  const active = await resolveVaultChatProfile(supabase, user, profileIdParam);
  if (!active) {
    return vaultProfileNotFoundResponse(profileIdParam);
  }

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
  const url = new URL(request.url);
  const profileIdParam = url.searchParams.get("profileId");
  const active = await resolveVaultChatProfile(supabase, user, profileIdParam);
  if (!active) {
    return vaultProfileNotFoundResponse(profileIdParam);
  }

  const chatId = url.searchParams.get("chatId");
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

  if (!isChatLlmConfigured()) {
    return NextResponse.json(
      {
        error:
          "AI chat isn't set up yet. Add ANTHROPIC_API_KEY or DEEPSEEK_API_KEY on this deployment.",
        code: "missing_api_key",
      },
      { status: 503 }
    );
  }

  let questionRaw: unknown;
  let chatIdRaw: unknown;
  let workProjectIdRaw: unknown;
  let attachmentDocumentIdRaw: unknown;
  let regenerateAssistantIdRaw: unknown;
  let clearScopedProfile = false;
  let setScopedProfileRaw: unknown;
  let setSearchScopeRaw: unknown;
  let profileIdRaw: unknown;
  let agentMode = false;
  let focusBlockRaw: unknown;
  try {
    const body = await request.json();
    questionRaw = body.question;
    chatIdRaw = body.chatId;
    workProjectIdRaw = body.workProjectId;
    attachmentDocumentIdRaw = body.attachmentDocumentId;
    regenerateAssistantIdRaw = body.regenerateAssistantId;
    clearScopedProfile = body.clearScopedProfile === true;
    setScopedProfileRaw = body.setScopedProfile;
    setSearchScopeRaw = body.searchScope;
    profileIdRaw = body.profileId;
    agentMode = body.agentMode === true;
    focusBlockRaw = body.focusBlock;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const regenerateAssistantId =
    typeof regenerateAssistantIdRaw === "string" &&
    regenerateAssistantIdRaw.trim()
      ? regenerateAssistantIdRaw.trim()
      : null;

  let question = sanitizeChatQuestion(questionRaw);
  const initialQuestion = question;
  if (!question && !regenerateAssistantId) {
    return NextResponse.json(
      { error: "Enter a question." },
      { status: 400 }
    );
  }

  const quota = await assertBillingQuota(supabase, user.id, "chat", user.email);
  if (!quota.ok) return quota.response;

  const profileIdOverride =
    typeof profileIdRaw === "string" && profileIdRaw.trim()
      ? profileIdRaw.trim()
      : null;
  const active = await resolveVaultChatProfile(
    supabase,
    user,
    profileIdOverride
  );
  if (!active) {
    return vaultProfileNotFoundResponse(profileIdOverride);
  }

  const userTz = await getUserTimeZone(supabase, user.id);
  const clientFocusBlock: GideonFocusBlock | null = isValidFocusBlock(
    focusBlockRaw
  )
    ? focusBlockRaw
    : null;

  const accessibleProfiles = await listGuardianProfiles(supabase, user.id);
  const scopeCandidates = accessibleProfiles.map((p) => ({
    id: p.id,
    display_name: p.display_name,
  }));

  let chatId: string;
  let isNewChat = false;
  let chatHomeProfileId = active.id;
  let chatScopedProfileId: string | null = null;
  let chatSearchScope: SearchScopeMode = "workspace";
  const requestedId =
    typeof chatIdRaw === "string" && chatIdRaw.trim() ? chatIdRaw.trim() : null;

  if (regenerateAssistantId && !requestedId) {
    return NextResponse.json({ error: "Chat not found." }, { status: 400 });
  }

  if (requestedId) {
    const loaded = await loadVaultChatById(supabase, requestedId);
    if (!loaded.ok) {
      if (loaded.reason === "query_error") {
        return NextResponse.json(
          { error: "We couldn't start vault chat. Please try again." },
          { status: 502 }
        );
      }
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
    const existingChat = loaded.chat;
    const chatOwnerProfile = await requireAccessibleGuardianProfile(
      supabase,
      user.id,
      String(existingChat.profile_id)
    );
    if (!chatOwnerProfile) {
      return NextResponse.json(
        { error: "Vault not found or not accessible." },
        { status: 403 }
      );
    }
    chatId = existingChat.id;
    chatHomeProfileId = String(existingChat.profile_id);
    chatScopedProfileId =
      typeof existingChat.scoped_profile_id === "string"
        ? existingChat.scoped_profile_id
        : null;
    chatSearchScope = parseSearchScope(existingChat.search_scope);
  } else {
    if (!initialQuestion) {
      return NextResponse.json(
        { error: "Enter a question." },
        { status: 400 }
      );
    }
    const initialSearchScope = isSearchScopeMode(setSearchScopeRaw)
      ? setSearchScopeRaw
      : "workspace";
    const { data: created, error: chatError } = await supabase
      .from("vault_chats")
      .insert({
        user_id: user.id,
        profile_id: active.id,
        title: titleFromQuestion(initialQuestion),
        search_scope: initialSearchScope,
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
    chatHomeProfileId = active.id;
    chatSearchScope = initialSearchScope;
  }

  const setScopedProfile =
    typeof setScopedProfileRaw === "string" && setScopedProfileRaw.trim()
      ? setScopedProfileRaw.trim()
      : null;

  if (clearScopedProfile) {
    await clearVaultChatScopedProfile(supabase, chatId);
    chatScopedProfileId = null;
  } else if (setScopedProfile) {
    const scopedMatch = accessibleProfiles.find((p) => p.id === setScopedProfile);
    if (!scopedMatch) {
      return NextResponse.json(
        { error: "Vault not found or not accessible." },
        { status: 403 }
      );
    }
    await setVaultChatScopedProfile(supabase, chatId, scopedMatch.id);
    chatScopedProfileId = scopedMatch.id;
  }

  const requestedSearchScope = isSearchScopeMode(setSearchScopeRaw)
    ? setSearchScopeRaw
    : null;
  if (requestedSearchScope && requestedSearchScope !== chatSearchScope) {
    await setVaultChatSearchScope(supabase, chatId, requestedSearchScope);
    chatSearchScope = requestedSearchScope;
  }

  const workspaceMeta = resolveWorkspaceScopes({
    accessibleProfiles,
    activeProfile: active,
    chatHomeProfileId,
    chatScopedProfileId,
    searchScope: chatSearchScope,
  });
  const { retrievalScopes, searchProfileIds: allSearchIds, profileNames } =
    workspaceMeta;
  const accessibleProfileIds = accessibleProfiles.map((p) => p.id);

  try {
    await Promise.all(
      retrievalScopes.map((scope) =>
        enqueueMissingVaultIndexing(supabase, user.id, scope.id).catch((err) => {
          console.error(
            "Vault index enqueue failed:",
            err instanceof Error ? err.message : "error"
          );
        })
      )
    );
  } catch {
    /* already logged per profile */
  }

  const { count: chunkCount } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .in("profile_id", allSearchIds);

  const { count: logCount } = await supabase
    .from("daily_logs")
    .select("id", { count: "exact", head: true })
    .in("profile_id", allSearchIds);

  // Document RAG needs embeddings; empty vault / Daily Log-only / general
  // knowledge questions do not.
  if ((chunkCount ?? 0) > 0 && !isVaultEmbeddingConfigured()) {
    return NextResponse.json(
      {
        error:
          "I couldn't complete that request right now. Please try again.",
      },
      { status: 503 }
    );
  }

  const { data: priorRows } = await supabase
    .from("vault_chat_messages")
    .select("id, role, content, citations, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  let priorMessages = priorRows ?? [];
  let userMsg: ChatMessageRow | null = null;

  if (regenerateAssistantId) {
    const assistantIdx = priorMessages.findIndex(
      (row) => row.id === regenerateAssistantId
    );
    if (assistantIdx < 0) {
      return NextResponse.json({ error: "Message not found." }, { status: 404 });
    }
    const assistantRow = priorMessages[assistantIdx];
    if (assistantRow.role !== "assistant") {
      return NextResponse.json({ error: "Invalid message." }, { status: 400 });
    }
    const userRow = assistantIdx > 0 ? priorMessages[assistantIdx - 1] : null;
    if (!userRow || userRow.role !== "user") {
      return NextResponse.json(
        { error: "Couldn't find the question to regenerate." },
        { status: 400 }
      );
    }
    const { error: deleteError } = await supabase
      .from("vault_chat_messages")
      .delete()
      .eq("id", regenerateAssistantId)
      .eq("chat_id", chatId)
      .eq("user_id", user.id);
    if (deleteError) {
      return NextResponse.json(
        { error: "Couldn't regenerate response." },
        { status: 502 }
      );
    }
    question = String(userRow.content);
    userMsg = {
      id: userRow.id,
      role: "user",
      content: question,
      citations:
        (userRow.citations as ChatMessageRow["citations"] | null) ?? [],
      created_at: userRow.created_at,
    };
    priorMessages = priorMessages.filter(
      (row) => row.id !== regenerateAssistantId
    );
  }

  if (!question) {
    return NextResponse.json(
      { error: "Enter a question." },
      { status: 400 }
    );
  }

  const regenerateUserMsg = userMsg;
  const historySource =
    regenerateAssistantId && regenerateUserMsg
      ? priorMessages.filter((row) => row.id !== regenerateUserMsg.id)
      : priorMessages;

  const history = historySource
    .filter((m) => m.role === "user" || m.role === "assistant")
    // Keep recent turns only — long history dominates token cost.
    .slice(-Math.min(CHAT_HISTORY_MAX_TURNS, 8) * 2)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, 1200),
    }));
  const isFirstExchange =
    !regenerateAssistantId && (priorRows ?? []).length === 0;

  if (!isNewChat && history.length === 0 && !regenerateAssistantId) {
    await supabase
      .from("vault_chats")
      .update({ title: titleFromQuestion(question) })
      .eq("id", chatId)
      .eq("user_id", user.id)
      .eq("profile_id", active.id);
  }

  if (!userMsg) {
    const { data: insertedUserMsg, error: userMsgError } = await supabase
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

    if (userMsgError || !insertedUserMsg) {
      return NextResponse.json(
        { error: "Couldn't save your question." },
        { status: 502 }
      );
    }
    userMsg = insertedUserMsg as ChatMessageRow;
  }

  let citations: {
    documentId: string;
    fileName: string;
    profileName?: string;
    isImage?: boolean;
    kind?: "vault" | "connector";
    sourceId?: string;
    itemId?: string;
    sourceType?: string;
    mimeType?: string | null;
  }[] = [];
  let answer: string | undefined;
  let attachedFileName: string | undefined;
  let responseVaultScope: ChatMessageRow["vaultScope"] = null;
  let writeProfile = {
    profileId: active.id,
    profileName: active.display_name,
  };

  const attachmentDocumentId =
    typeof attachmentDocumentIdRaw === "string"
      ? attachmentDocumentIdRaw.trim()
      : "";

  const workProjectIdForAction =
    typeof workProjectIdRaw === "string" ? workProjectIdRaw.trim() : "";

  const actionCtx: ActionContext = {
    question,
    userId: user.id,
    userEmail: user.email,
    workProjectId: workProjectIdForAction || null,
    activeProfile: {
      id: active.id,
      display_name: active.display_name,
      profile_type: active.profile_type,
      parent_profile_id: active.parent_profile_id,
    },
    supabase,
    chatHistory: history,
  };

  const lastAssistant = [...history]
    .reverse()
    .find((turn) => turn.role === "assistant")?.content;
  const startedFocusBlock = parseFocusBlockStart(
    question,
    new Date(),
    userTz,
    lastAssistant
  );
  const activeFocusBlock = startedFocusBlock ?? clientFocusBlock;
  const focusBlockNote = formatFocusBlockPromptNote(
    activeFocusBlock,
    new Date(),
    userTz
  );

  if (isSimpleTodayDateQuestion(question) && !attachmentDocumentId) {
    answer = buildTodayDateAnswer(userTz);
  } else if (isSimpleCurrentTimeQuestion(question) && !attachmentDocumentId) {
    answer = buildCurrentTimeAnswer(userTz);
  } else if (
    isFocusRemainingQuestion(question) &&
    activeFocusBlock &&
    !attachmentDocumentId
  ) {
    answer = buildFocusRemainingAnswer(activeFocusBlock, userTz);
  } else if (!attachmentDocumentId) {
    const directAnswer = await runDirectAction(actionCtx);
    if (directAnswer) {
      answer = directAnswer.message;
      const matched = getMatchingActions(actionCtx);
      for (const action of matched) {
        await recordActionEvent(supabase, {
          userId: user.id,
          profileId: active.id,
          chatId,
          actionId: action.id,
          label: action.label,
          phase: "executed",
          message: directAnswer.message.slice(0, 500),
        });
      }
    }
  }

  if (!answer) {
    try {
      const workProjectId =
        typeof workProjectIdRaw === "string" ? workProjectIdRaw.trim() : "";
      const attachedDoc = attachmentDocumentId
        ? await loadAttachedVaultDocument(supabase, {
            userId: user.id,
            documentId: attachmentDocumentId,
            allowedProfileIds: accessibleProfileIds,
            profileNames,
          })
        : null;
      attachedFileName = attachedDoc?.fileName;

      const gideonRoute = routeGideonRequest({
        question,
        history,
        hasAttachment: Boolean(attachedDoc),
        forceKnowledge:
          wantsVaultFileInventory(question) ||
          wantsTranscription(question) ||
          wantsShowPictures(question),
      });
      const loadFlags = resolveGideonLoad(gideonRoute);
      const calendarNote = await loadCalendarPromptNote({
        route: gideonRoute,
        timeZone: userTz,
      });

      const { chunks, context: workspaceContext, explicitSpaceName, connectorCitations } =
        await loadWorkspaceContext({
        supabase,
        user,
        meta: workspaceMeta,
        question,
        timeZone: userTz,
        workProjectId,
        attachedDoc,
        chunkCount: chunkCount ?? 0,
        chatHistory: history,
        load: loadFlags,
        intent: gideonRoute.intent,
        calendarNote,
        focusBlockNote,
        confirmationRequired: gideonRoute.confirmationRequired,
      });

      workspaceContext.promptOptions.agentMode = agentMode;

      const system = buildGideonSystemPrompt(workspaceContext, actionCtx);
      const showPictures = workspaceContext.promptOptions.showPictures;
      const thinkingSteps = buildGideonThinkingSteps({
        actionCtx,
        meta: workspaceMeta,
        route: gideonRoute,
      });
      const detectedActions = getMatchingActions(actionCtx).map((action) => ({
        id: action.id,
        label: action.label,
      }));

      const inventoryAnswer =
        wantsVaultFileInventory(question) && explicitSpaceName
          ? buildInventoryQuestionAnswer({
              question,
              spaceDisplayName: explicitSpaceName,
              fileInventoryText: workspaceContext.blocks.fileInventory,
              dailyLogsText: workspaceContext.blocks.dailyLogs,
            })
          : null;

      if (inventoryAnswer) {
        answer = inventoryAnswer;
        if (connectorCitations?.length) {
          citations = connectorCitations;
        }
      } else {
        return createVaultChatStreamResponse({
          supabase,
          userId: user.id,
          chatId,
          active: { id: active.id, display_name: active.display_name },
          chatHomeProfileId,
          chatScopedProfileId,
          userMsg: userMsg as ChatMessageRow,
          question,
          history,
          system,
          maxTokens: gideonMaxTokens(workspaceContext),
          chunks,
          attachedDoc,
          showPictures,
          accessibleProfiles: scopeCandidates,
          isFirstExchange,
          attachedFileName,
          userTz,
          listChats,
          updateVaultChatRow,
          thinkingSteps,
          detectedActions,
          explicitSpaceName,
          ontologyBlock: workspaceContext.blocks.ontology,
          connectorCitations,
        });
      }
    } catch (err) {
      const { error, code, status } = formatVaultChatError(err);
      console.error("Vault chat failed:", error);
      return NextResponse.json({ error, code }, { status });
    }
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

  await recordChatEvent(supabase, user.id, "chat");

  const chatUpdates: {
    updated_at: string;
    title?: string;
    scoped_profile_id?: string | null;
  } = {
    updated_at: new Date().toISOString(),
  };
  if (
    shouldGenerateVaultChatTitle({ isFirstExchange, question })
  ) {
    try {
      const generatedTitle = await withLlmUsage(
        { userId: user.id, feature: "vault_chat" },
        () =>
          generateVaultChatTitle({
            question,
            answer,
            attachmentFileName: attachedFileName,
          })
      );
      if (generatedTitle) {
        chatUpdates.title = generatedTitle;
      }
    } catch (err) {
      console.error(
        "Vault chat title generation failed:",
        err instanceof Error ? err.message : "error"
      );
    }
  }

  await updateVaultChatRow(supabase, chatId, chatUpdates);

  const chats = await listChats(supabase, user.id, active.id);
  const proposedReminder = parseProposedReminder(answer, Date.now(), userTz);
  const newlyGranted = await refreshUserAwards(user.id, supabase);
  const persistedChatScopedProfile = chatScopedProfilePayload({
    scopedProfileId: chatScopedProfileId,
    accessibleProfiles: scopeCandidates,
    chatHomeProfileId,
  });

  return NextResponse.json({
    chatId,
    chats,
    messages: [
      userMsg,
      { ...assistantMsg, vaultScope: responseVaultScope },
    ] as ChatMessageRow[],
    proposedReminder,
    newlyGranted,
    vaultScope: responseVaultScope,
    writeProfile,
    chatScopedProfile: persistedChatScopedProfile,
    searchScope: chatSearchScope,
    vaultScopeNote: workspaceMeta.vaultScopeNote,
  });
}
