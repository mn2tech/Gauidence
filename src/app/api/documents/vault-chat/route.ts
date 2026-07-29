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
import { embedQuery, isVaultEmbeddingConfigured } from "@/lib/vault/embeddings";
import {
  formatRetrievalContext,
  VAULT_CHAT_SYSTEM,
} from "@/lib/vault/indexDocument";
import { wantsShowPictures } from "@/lib/vault/images";
import { buildAskVaultInventory } from "@/lib/vault/askInventory";
import { ensureUserVaultIndexed } from "@/lib/vault/ensureIndexed";
import { retrieveAllAccessibleVaultChunks } from "@/lib/vault/rollup";
import {
  buildGideonSuggestions,
  buildGideonLogSuggestions,
  buildGideonVaultGuidance,
  buildGideonTodayNote,
  buildCurrentTimeAnswer,
  buildTodayDateAnswer,
  isSimpleCurrentTimeQuestion,
  isSimpleTodayDateQuestion,
  firstNameFrom,
  getVaultTemplate,
  gideonChatContextLabel,
  GIDEON_ATTACHED_DOCUMENT_NOTE,
  GIDEON_CROSS_VAULT_NOTE,
  GIDEON_TRANSCRIPTION_NOTE,
  buildVaultScopeNote,
  wantsTranscription,
  withVaultPersonality,
  type SuggestionProfileKind,
  type VaultDocHint,
} from "@/lib/vault/gideon";
import {
  loadAttachedVaultDocument,
} from "@/lib/vault/attachedDocument";
import { mergePinnedChunks } from "@/lib/vault/retrieve";
import {
  buildVaultChatRetrievalScopes,
  chatScopedProfilePayload,
} from "@/lib/vault/detectVaultScope";
import {
  listGuardianProfiles,
  getActiveGuardianProfile,
  requireAccessibleGuardianProfile,
} from "@/lib/profiles/server";
import type { GuardianProfile } from "@/lib/profiles/types";
import {
  askGideonContextLabel,
  canHaveLinkedEmployees,
  canHaveLinkedFamilyMembers,
  canHaveLinkedHobbies,
  canHaveLinkedHomes,
  canHaveLinkedVehicles,
  formatLinkedClientsForGideon,
  formatLinkedEmployeesForGideon,
  formatLinkedFamilyForGideon,
  formatLinkedHobbiesForGideon,
  formatLinkedVehiclesForGideon,
  type GuardianProfileType,
} from "@/lib/profiles/types";
import {
  formatDailyLogsForGideon,
  retrieveRelevantDailyLogs,
} from "@/lib/logs/retrieve";
import {
  formatAlertsForGideon,
  retrieveUpcomingAlertsForGideon,
} from "@/lib/reminders/retrieve";
import {
  parseProposedReminder,
  wantsReminderAgent,
  REMINDER_AGENT_SYSTEM_NOTE,
} from "@/lib/reminders/propose";
import { withLlmUsage } from "@/lib/usage/record";
import { assertBillingQuota, recordChatEvent } from "@/lib/billing/quota";
import { refreshUserAwards } from "@/lib/awards/grant";
import { formatWorkMemoryForGideon } from "@/lib/work-memory/context";
import {
  loadWorkMemoryForGideon,
  loadWorkMemoryProjectForGideon,
} from "@/lib/work-memory/server";
import { createVaultChatStreamResponse } from "@/lib/vault/vaultChatStream.server";
import { canAccessGuardianPayroll } from "@/lib/features/payroll";
import {
  answerPayrollGideonQuery,
  wantsPayrollQuery,
} from "@/lib/payroll/gideonChat";

async function loadLinkedOrgContext(
  supabase: SupabaseClient,
  userId: string,
  active: { id: string; display_name: string; profile_type: GuardianProfileType }
): Promise<string> {
  if (canHaveLinkedEmployees(active.profile_type)) {
    const [{ data: employees }, { data: clients }, { data: homes }] =
      await Promise.all([
        supabase
          .from("guardian_profiles")
          .select("display_name, job_title, department, description")
          .eq("owner_user_id", userId)
          .eq("parent_profile_id", active.id)
          .eq("profile_type", "employee")
          .order("display_name", { ascending: true }),
        supabase
          .from("guardian_profiles")
          .select("display_name, job_title, department, description")
          .eq("owner_user_id", userId)
          .eq("parent_profile_id", active.id)
          .eq("profile_type", "client")
          .order("display_name", { ascending: true }),
        canHaveLinkedHomes(active.profile_type)
          ? supabase
              .from("guardian_profiles")
              .select("display_name")
              .eq("owner_user_id", userId)
              .eq("parent_profile_id", active.id)
              .eq("profile_type", "home")
              .order("display_name", { ascending: true })
          : Promise.resolve({ data: [] as { display_name: string }[] }),
      ]);
    const parts = [
      formatLinkedEmployeesForGideon(active.display_name, employees ?? []),
      formatLinkedClientsForGideon(active.display_name, clients ?? []),
    ];
    if ((homes ?? []).length > 0) {
      parts.push(
        `Linked homes under this organization: ${(homes ?? [])
          .map((h) => h.display_name)
          .join(", ")}`
      );
    }
    if (canHaveLinkedVehicles(active.profile_type)) {
      const { data: vehicles } = await supabase
        .from("guardian_profiles")
        .select("display_name, description")
        .eq("owner_user_id", userId)
        .eq("parent_profile_id", active.id)
        .eq("profile_type", "vehicle")
        .order("display_name", { ascending: true });
      if ((vehicles ?? []).length > 0) {
        parts.push(
          formatLinkedVehiclesForGideon(active.display_name, vehicles ?? [])
        );
      }
    }
    return parts.join("\n\n");
  }

  if (canHaveLinkedFamilyMembers(active.profile_type)) {
    const types = [
      "child",
      "spouse_partner",
      "parent",
      "family_member",
      "student",
      "pet",
      "vehicle",
      "hobby",
      ...(canHaveLinkedHomes(active.profile_type) ? (["home"] as const) : []),
    ];
    const { data: members } = await supabase
      .from("guardian_profiles")
      .select("display_name, profile_type, relationship, description")
      .eq("owner_user_id", userId)
      .eq("parent_profile_id", active.id)
      .in("profile_type", types)
      .order("display_name", { ascending: true });
    const people = (members ?? []).filter(
      (m) =>
        m.profile_type !== "home" &&
        m.profile_type !== "pet" &&
        m.profile_type !== "vehicle" &&
        m.profile_type !== "hobby" &&
        m.profile_type !== "student"
    );
    const students = (members ?? []).filter((m) => m.profile_type === "student");
    const pets = (members ?? []).filter((m) => m.profile_type === "pet");
    const hobbies = (members ?? []).filter((m) => m.profile_type === "hobby");
    const homes = (members ?? []).filter((m) => m.profile_type === "home");
    const vehicles = (members ?? []).filter((m) => m.profile_type === "vehicle");
    const parts = [formatLinkedFamilyForGideon(active.display_name, people)];
    if (students.length > 0) {
      parts.push(
        `Linked student profiles under this family: ${students
          .map((s) => s.display_name)
          .join(", ")}`
      );
    }
    if (pets.length > 0) {
      parts.push(
        `Linked pets under this family: ${pets
          .map((p) => p.display_name)
          .join(", ")}`
      );
    }
    if (hobbies.length > 0) {
      parts.push(
        formatLinkedHobbiesForGideon(
          active.display_name,
          hobbies.map((h) => ({
            display_name: h.display_name,
            description: h.description ?? null,
          }))
        )
      );
    }
    if (homes.length > 0) {
      parts.push(
        `Linked homes under this family: ${homes
          .map((h) => h.display_name)
          .join(", ")}`
      );
    }
    if (vehicles.length > 0) {
      parts.push(
        formatLinkedVehiclesForGideon(
          active.display_name,
          vehicles.map((v) => ({
            display_name: v.display_name,
            description: v.description ?? null,
          }))
        )
      );
    }
    return parts.join("\n\n");
  }

  if (
    canHaveLinkedHobbies(active.profile_type) &&
    active.profile_type !== "family"
  ) {
    const { data: hobbies } = await supabase
      .from("guardian_profiles")
      .select("display_name, description")
      .eq("owner_user_id", userId)
      .eq("parent_profile_id", active.id)
      .eq("profile_type", "hobby")
      .order("display_name", { ascending: true });
    if ((hobbies ?? []).length === 0) return "";
    return formatLinkedHobbiesForGideon(active.display_name, hobbies ?? []);
  }

  if (active.profile_type === "vehicles") {
    const { data: vehicles } = await supabase
      .from("guardian_profiles")
      .select("display_name, description")
      .eq("owner_user_id", userId)
      .eq("parent_profile_id", active.id)
      .eq("profile_type", "vehicle")
      .order("display_name", { ascending: true });
    return formatLinkedVehiclesForGideon(active.display_name, vehicles ?? []);
  }

  return "";
}

function suggestionKindFrom(
  type: GuardianProfileType
): SuggestionProfileKind {
  if (type === "child" || type === "student") return type;
  if (type === "teacher") return type;
  if (
    type === "business" ||
    type === "non_profit" ||
    type === "employee" ||
    type === "client"
  ) {
    return type === "non_profit" ? "non_profit" : type;
  }
  if (type === "vehicle" || type === "home" || type === "pet" || type === "hobby") {
    return type;
  }
  if (
    type === "spouse_partner" ||
    type === "parent" ||
    type === "family_member"
  ) {
    return "family";
  }
  if (type === "family" || type === "vehicles") {
    return type === "family" ? "family" : "other";
  }
  if (type === "personal") return "personal";
  return "other";
}

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

async function askGideonScopeMeta(
  supabase: SupabaseClient,
  userId: string,
  active: { id: string; display_name: string; profile_type: GuardianProfileType },
  options?: {
    chatHomeProfileId?: string;
    chatScopedProfileId?: string | null;
  }
) {
  const profileKind = suggestionKindFrom(active.profile_type);
  const accessibleProfiles = await listGuardianProfiles(supabase, userId);
  const chatHomeProfileId = options?.chatHomeProfileId ?? active.id;
  const retrievalScopes = buildVaultChatRetrievalScopes({
    accessibleProfiles: accessibleProfiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      profile_type: p.profile_type,
    })),
    chatHomeProfileId,
    scopedProfileId: options?.chatScopedProfileId,
  });
  const scopedProfile =
    typeof options?.chatScopedProfileId === "string"
      ? accessibleProfiles.find((p) => p.id === options.chatScopedProfileId) ??
        null
      : null;
  return {
    profileKind,
    chatContextLabel: gideonChatContextLabel(profileKind, active.display_name),
    vaultScopeNote: buildVaultScopeNote({
      displayName: active.display_name,
      profileKind,
      allVaultNames: accessibleProfiles.map((p) => p.display_name),
      searchVaultNames: retrievalScopes.map((p) => p.display_name),
      chatScopedProfileName: scopedProfile?.display_name,
    }),
  };
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
    .select("id, title, profile_id, scoped_profile_id")
    .eq("id", chatId)
    .maybeSingle();

  if (!scoped.error) {
    if (!scoped.data) return { ok: false, reason: "not_found" };
    return { ok: true, chat: scoped.data as VaultChatRow };
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
      chat: { ...base.data, scoped_profile_id: null },
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

async function updateVaultChatRow(
  supabase: SupabaseClient,
  chatId: string,
  updates: {
    updated_at: string;
    title?: string;
    scoped_profile_id?: string | null;
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
        templateLabel: template.label,
        templateBadge: template.badge,
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
  try {
    const body = await request.json();
    chatIdRaw = body.chatId;
    clearScopedProfile = body.clearScopedProfile === true;
    setScopedProfileRaw = body.setScopedProfile;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const chatId =
    typeof chatIdRaw === "string" && chatIdRaw.trim() ? chatIdRaw.trim() : null;
  const setScopedProfile =
    typeof setScopedProfileRaw === "string" && setScopedProfileRaw.trim()
      ? setScopedProfileRaw.trim()
      : null;

  if (!chatId || (!clearScopedProfile && !setScopedProfile)) {
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

  if (!process.env.ANTHROPIC_API_KEY) {
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
  let workProjectIdRaw: unknown;
  let attachmentDocumentIdRaw: unknown;
  let regenerateAssistantIdRaw: unknown;
  let clearScopedProfile = false;
  let setScopedProfileRaw: unknown;
  let profileIdRaw: unknown;
  try {
    const body = await request.json();
    questionRaw = body.question;
    chatIdRaw = body.chatId;
    workProjectIdRaw = body.workProjectId;
    attachmentDocumentIdRaw = body.attachmentDocumentId;
    regenerateAssistantIdRaw = body.regenerateAssistantId;
    clearScopedProfile = body.clearScopedProfile === true;
    setScopedProfileRaw = body.setScopedProfile;
    profileIdRaw = body.profileId;
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

  const { error: eventError } = await recordChatEvent(supabase, user.id, "chat");
  if (eventError) {
    return NextResponse.json(
      { error: "We couldn't start vault chat. Please try again." },
      { status: 502 }
    );
  }

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

  const accessibleProfiles = await listGuardianProfiles(supabase, user.id);
  const scopeCandidates = accessibleProfiles.map((p) => ({
    id: p.id,
    display_name: p.display_name,
  }));

  let chatId: string;
  let isNewChat = false;
  let chatHomeProfileId = active.id;
  let chatScopedProfileId: string | null = null;
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
  } else {
    if (!initialQuestion) {
      return NextResponse.json(
        { error: "Enter a question." },
        { status: 400 }
      );
    }
    const { data: created, error: chatError } = await supabase
      .from("vault_chats")
      .insert({
        user_id: user.id,
        profile_id: active.id,
        title: titleFromQuestion(initialQuestion),
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

  const retrievalScopes = buildVaultChatRetrievalScopes({
    accessibleProfiles: accessibleProfiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      profile_type: p.profile_type,
    })),
    chatHomeProfileId,
    scopedProfileId: chatScopedProfileId,
  });
  const accessibleProfileIds = accessibleProfiles.map((p) => p.id);
  const profileNames = Object.fromEntries(
    retrievalScopes.map((s) => [s.id, s.display_name])
  );
  const allSearchIds = retrievalScopes.map((s) => s.id);

  try {
    await Promise.all(
      retrievalScopes.map((scope) =>
        ensureUserVaultIndexed(supabase, user.id, scope.id).catch((err) => {
          console.error(
            "Vault ensure index failed:",
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
    .slice(-Math.min(CHAT_HISTORY_MAX_TURNS, 6) * 2)
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
  }[] = [];
  let answer: string;
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

  if (isSimpleTodayDateQuestion(question) && !attachmentDocumentId) {
    answer = buildTodayDateAnswer(userTz);
  } else if (isSimpleCurrentTimeQuestion(question) && !attachmentDocumentId) {
    answer = buildCurrentTimeAnswer(userTz);
  } else if (
    !attachmentDocumentId &&
    canAccessGuardianPayroll({ email: user.email }) &&
    wantsPayrollQuery(question) &&
    (canHaveLinkedEmployees(active.profile_type) ||
      (active.profile_type === "employee" && active.parent_profile_id))
  ) {
    const payrollProfileId =
      active.profile_type === "employee" && active.parent_profile_id
        ? active.parent_profile_id
        : active.id;
    const payrollAnswer = await answerPayrollGideonQuery(supabase, {
      query: question,
      profileId: payrollProfileId,
    });
    let payrollText = payrollAnswer?.message ?? "Open Payroll for more options.";
    if (payrollAnswer?.href) {
      payrollText += `\n\n→ ${payrollAnswer.href}`;
    }
    if (payrollAnswer?.requiresConfirmation) {
      payrollText +=
        "\n\nI cannot approve or share payroll without your explicit confirmation on the Payroll report page.";
    }
    answer = payrollText;
  } else {
  try {
    const showPictures = wantsShowPictures(question);
    const attachedDoc = attachmentDocumentId
      ? await loadAttachedVaultDocument(supabase, {
          userId: user.id,
          documentId: attachmentDocumentId,
          allowedProfileIds: accessibleProfileIds,
          profileNames,
        })
      : null;
    attachedFileName = attachedDoc?.fileName;

    const queryEmbedding =
      (chunkCount ?? 0) > 0 ? await embedQuery(question) : null;
    const matchCount = showPictures ? 10 : 8;
    const retrievedChunks = queryEmbedding
      ? await retrieveAllAccessibleVaultChunks(
          supabase,
          queryEmbedding,
          retrievalScopes,
          matchCount
        )
      : [];
    const chunks = mergePinnedChunks(
      attachedDoc?.chunks ?? [],
      retrievedChunks
    );
    const formatted = formatRetrievalContext(chunks);
    const dailyLogs = await retrieveRelevantDailyLogs(supabase, {
      profileId: active.id,
      profileIds: allSearchIds,
      profileNames,
      question,
      limit: retrievalScopes.length > 1 ? 6 : 4,
    });
    const logContext = formatDailyLogsForGideon(dailyLogs, profileNames);
    const upcomingAlerts = await retrieveUpcomingAlertsForGideon(supabase, {
      profileIds: allSearchIds,
      profileNames,
      question,
      timeZone: userTz,
      limit: retrievalScopes.length > 1 ? 12 : 10,
    });
    const scheduleContext = formatAlertsForGideon(upcomingAlerts, {
      profileNames,
      timeZone: userTz,
    });
    const linkedContext = await loadLinkedOrgContext(
      supabase,
      user.id,
      active
    );
    const workProjectId =
      typeof workProjectIdRaw === "string" ? workProjectIdRaw.trim() : "";
    const focusedWorkMemory = workProjectId
      ? await loadWorkMemoryProjectForGideon(supabase, user.id, workProjectId)
      : null;
    const workMemoryBundle =
      focusedWorkMemory ??
      (await loadWorkMemoryForGideon(supabase, user.id));
    const workMemoryBody = formatWorkMemoryForGideon(
      workMemoryBundle.projects,
      workMemoryBundle.sessionsByProject
    );
    const workMemoryContext = focusedWorkMemory
      ? `The user clicked "Continue with Gideon" to resume this project. Prioritize this project's mission, step, blockers, and recent sessions.\n\n${workMemoryBody}`
      : workMemoryBody;

    const allVaultsNote =
      retrievalScopes.length > 1
        ? `${GIDEON_CROSS_VAULT_NOTE}

Active vault in the UI: ${active.display_name}. Document search includes all ${retrievalScopes.length} vaults you can access (${retrievalScopes.map((s) => s.display_name).join(", ")}).`
        : "Search this vault's documents, Daily Logs, and upcoming schedule; use GENERAL KNOWLEDGE when the vault does not contain the answer.";
    const pictureNote = showPictures
      ? `The user wants to see pictures. Prefer naming image file names from the retrieved excerpts (jpg/png/webp/etc.) so the UI can display them. If no image files were retrieved, say so clearly.`
      : "";
    const reminderAgent = wantsReminderAgent(question);
    const transcriptionMode = wantsTranscription(question);
    const attachedTextLimit = transcriptionMode ? 30_000 : 12_000;
    const attachedContext = attachedDoc
      ? [
          `File: ${attachedDoc.fileName}`,
          attachedDoc.sourceText
            ? `Document text (OCR/native):\n${attachedDoc.sourceText.slice(0, attachedTextLimit)}`
            : "(no extracted text — use the attached image if present)",
        ].join("\n\n")
      : "";
    const vaultEmptyNote =
      !formatted.context.trim() &&
      !attachedContext.trim() &&
      !logContext.trim() &&
      !scheduleContext.trim() &&
      !linkedContext.trim()
        ? "No vault excerpts, Daily Logs, upcoming schedule items, or linked profile structure matched this question (or the vault is empty). Do not invent vault facts. Use ## GENERAL KNOWLEDGE for general questions, and ## GIDEON'S SUGGESTION to upload documents when that would help."
        : "";

    const reminderNote = reminderAgent ? REMINDER_AGENT_SYSTEM_NOTE : "";
    const transcriptionNote = transcriptionMode ? GIDEON_TRANSCRIPTION_NOTE : "";
    const attachedNote = attachedDoc ? GIDEON_ATTACHED_DOCUMENT_NOTE : "";

    const profileKind = suggestionKindFrom(active.profile_type);
    const system = `${withVaultPersonality(VAULT_CHAT_SYSTEM, profileKind)}

Active profile: ${active.display_name} (${active.profile_type}).
${buildGideonTodayNote(new Date(), userTz)}
${allVaultsNote}
${pictureNote}
${vaultEmptyNote}
${reminderNote}
${transcriptionNote}
${attachedNote}

--- RETRIEVED EXCERPTS ---
${formatted.context.trim() || "(none)"}
--- END EXCERPTS ---

--- ATTACHED DOCUMENT (user sent with this message) ---
${attachedContext.trim() || "(none)"}
--- END ATTACHED DOCUMENT ---

--- RETRIEVED DAILY LOGS (user-entered notes; vault owner labeled when linked) ---
${logContext.trim() || "(none)"}
--- END DAILY LOGS ---

--- UPCOMING SCHEDULE (saved reminders and document deadlines; vault owner labeled when linked) ---
${scheduleContext.trim() || "(none)"}
--- END UPCOMING SCHEDULE ---

--- LINKED PROFILE STRUCTURE ---
${linkedContext.trim() || "(none)"}
--- END LINKED PROFILE STRUCTURE ---

--- WORK MEMORY (user's active projects and recent sessions) ---
${workMemoryContext.trim() || "(none — user has no active work projects)"}
--- END WORK MEMORY ---`;

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
      maxTokens: reminderAgent ? 1100 : transcriptionMode ? 1200 : 900,
      chunks,
      attachedDoc,
      showPictures,
      accessibleProfiles: scopeCandidates,
      isFirstExchange,
      attachedFileName,
      userTz,
      listChats,
      updateVaultChatRow,
    });
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
  });
}
