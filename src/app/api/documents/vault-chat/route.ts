import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  CHAT_MODEL,
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
  selectImageCitationsFromChunks,
  markImageCitations,
  VAULT_CHAT_SYSTEM,
} from "@/lib/vault/indexDocument";
import { wantsShowPictures } from "@/lib/vault/images";
import { buildAskVaultInventory } from "@/lib/vault/askInventory";
import { ensureUserVaultIndexed } from "@/lib/vault/ensureIndexed";
import {
  canRollupLinkedVaultSearch,
  listLinkedProfilesForVaultRollup,
  retrieveVaultChunksAcrossProfiles,
} from "@/lib/vault/rollup";
import {
  buildGideonSuggestions,
  buildGideonLogSuggestions,
  firstNameFrom,
  type SuggestionProfileKind,
  type VaultDocHint,
} from "@/lib/vault/gideon";
import { getActiveGuardianProfile } from "@/lib/profiles/server";
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
    return type === "non_profit" ? "business" : type;
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

async function loadAskVaultInventory(
  supabase: SupabaseClient,
  userId: string,
  profileId: string
) {
  const [{ data: docs }, { data: logs }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, file_name, mime_type")
      .eq("user_id", userId)
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false }),
    supabase
      .from("daily_logs")
      .select("title, log_date, content")
      .eq("owner_user_id", userId)
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

  const active = await getActiveGuardianProfile(supabase, user);
  if (!active) {
    return NextResponse.json(
      {
        error:
          "Create a person or space first — open the dashboard and choose who you're helping.",
      },
      { status: 400 }
    );
  }
  const chatId = new URL(request.url).searchParams.get("chatId");
  const chats = await listChats(supabase, user.id, active.id);

  if (!chatId) {
    const { docs, inventory } = await loadAskVaultInventory(
      supabase,
      user.id,
      active.id
    );

    const docCount = inventory.documentCount + inventory.photoCount;
    const logCount = inventory.logCount;

    let suggestions: string[] = [];
    if (docCount > 0) {
      const { data: extracted } = await supabase
        .from("extracted_data")
        .select("document_id, document_type, guardian_status, title")
        .eq("user_id", user.id)
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
        suggestionKindFrom(active.profile_type)
      );
    } else if (logCount > 0) {
      suggestions = buildGideonLogSuggestions(
        suggestionKindFrom(active.profile_type)
      );
    }

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
      ...(await loadAskVaultInventory(supabase, user.id, active.id)).inventory,
    },
  });
}

/** Create a blank thread (New chat). */
export async function PUT() {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;
  const active = await getActiveGuardianProfile(supabase, user);
  if (!active) {
    return NextResponse.json(
      {
        error:
          "Create a person or space first — open the dashboard and choose who you're helping.",
      },
      { status: 400 }
    );
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
  const active = await getActiveGuardianProfile(supabase, user);
  if (!active) {
    return NextResponse.json(
      {
        error:
          "Create a person or space first — open the dashboard and choose who you're helping.",
      },
      { status: 400 }
    );
  }

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

  let questionRaw: unknown;
  let chatIdRaw: unknown;
  let workProjectIdRaw: unknown;
  try {
    const body = await request.json();
    questionRaw = body.question;
    chatIdRaw = body.chatId;
    workProjectIdRaw = body.workProjectId;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = sanitizeChatQuestion(questionRaw);
  if (!question) {
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

  const active = await getActiveGuardianProfile(supabase, user);
  if (!active) {
    return NextResponse.json(
      {
        error:
          "Create a person or space first — open the dashboard and choose who you're helping.",
      },
      { status: 400 }
    );
  }

  const linkedProfiles = canRollupLinkedVaultSearch(active.profile_type)
    ? await listLinkedProfilesForVaultRollup(supabase, user.id, active)
    : [];
  const searchScopes = [
    {
      id: active.id,
      display_name: active.display_name,
      profile_type: active.profile_type,
    },
    ...linkedProfiles,
  ];
  const searchIds = searchScopes.map((s) => s.id);
  const profileNames = Object.fromEntries(
    searchScopes.map((s) => [s.id, s.display_name])
  );

  try {
    await Promise.all(
      searchScopes.slice(0, 8).map((scope) =>
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
    .eq("user_id", user.id)
    .in("profile_id", searchIds);

  const { count: logCount } = await supabase
    .from("daily_logs")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .in("profile_id", searchIds);

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
    // Keep recent turns only — long history dominates token cost.
    .slice(-Math.min(CHAT_HISTORY_MAX_TURNS, 6) * 2)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, 1200),
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

  let citations: {
    documentId: string;
    fileName: string;
    profileName?: string;
    isImage?: boolean;
  }[] = [];
  let answer: string;

  try {
    const showPictures = wantsShowPictures(question);
    const queryEmbedding =
      (chunkCount ?? 0) > 0 ? await embedQuery(question) : null;
    const chunks = queryEmbedding
      ? linkedProfiles.length > 0
        ? await retrieveVaultChunksAcrossProfiles(
            supabase,
            queryEmbedding,
            searchScopes,
            showPictures ? 8 : 5
          )
        : (
            await retrieveVaultChunks(
              supabase,
              queryEmbedding,
              active.id,
              showPictures ? 6 : 4
            )
          ).map((c) => ({
            ...c,
            profile_id: active.id,
            profile_name: active.display_name,
          }))
      : [];
    const formatted = formatRetrievalContext(chunks);
    const dailyLogs = await retrieveRelevantDailyLogs(supabase, {
      userId: user.id,
      profileId: active.id,
      profileIds: searchIds,
      profileNames,
      question,
      limit: linkedProfiles.length > 0 ? 4 : 3,
    });
    const logContext = formatDailyLogsForGideon(dailyLogs, profileNames);
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

    const client = createLlmClient();
    const rollupNote =
      linkedProfiles.length > 0
        ? `This is a container profile. Search includes this vault plus linked member vaults (${linkedProfiles
            .map((p) => p.display_name)
            .join(", ")}). Attribute facts to the vault owner named in each source. Do not invent links across unrelated people.`
        : "Search this profile's vault and Daily Logs first; use GENERAL KNOWLEDGE when the vault does not contain the answer.";
    const pictureNote = showPictures
      ? `The user wants to see pictures. Prefer naming image file names from the retrieved excerpts (jpg/png/webp/etc.) so the UI can display them. If no image files were retrieved, say so clearly.`
      : "";
    const vaultEmptyNote =
      !formatted.context.trim() &&
      !logContext.trim() &&
      !linkedContext.trim()
        ? "No vault excerpts, Daily Logs, or linked profile structure matched this question (or the vault is empty). Do not invent vault facts. Use ## GENERAL KNOWLEDGE for general questions, and ## GIDEON'S SUGGESTION to upload documents when that would help."
        : "";

    const reminderAgent = wantsReminderAgent(question);
    const reminderNote = reminderAgent ? REMINDER_AGENT_SYSTEM_NOTE : "";

    const system = `${VAULT_CHAT_SYSTEM}

Active profile: ${active.display_name} (${active.profile_type}).
${rollupNote}
${pictureNote}
${vaultEmptyNote}
${reminderNote}

--- RETRIEVED EXCERPTS ---
${formatted.context.trim() || "(none)"}
--- END EXCERPTS ---

--- RETRIEVED DAILY LOGS (user-entered notes; vault owner labeled when linked) ---
${logContext.trim() || "(none)"}
--- END DAILY LOGS ---

--- LINKED PROFILE STRUCTURE ---
${linkedContext.trim() || "(none)"}
--- END LINKED PROFILE STRUCTURE ---

--- WORK MEMORY (user's active projects and recent sessions) ---
${workMemoryContext.trim() || "(none — user has no active work projects)"}
--- END WORK MEMORY ---`;

    answer = await withLlmUsage(
      { userId: user.id, feature: "vault_chat" },
      () =>
        runChatCompletion(client, {
          system,
          model: CHAT_MODEL,
          maxTokens: reminderAgent ? 1100 : 900,
          messages: [...history, { role: "user", content: question }],
        })
    );
    if (!answer) {
      answer =
        "I found potentially relevant information, but it needs verification before I can give you a reliable answer.";
    }
    let selected = selectCitationsForAnswer(answer, chunks);
    if (showPictures) {
      const imageOnes = selectImageCitationsFromChunks(chunks, 4);
      const seen = new Set(selected.map((c) => c.documentId));
      for (const img of imageOnes) {
        if (seen.has(img.documentId)) continue;
        selected.push(img);
        seen.add(img.documentId);
      }
      if (selected.length === 0 && imageOnes.length > 0) {
        selected = imageOnes;
      }
    }
    citations = markImageCitations(selected);
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
  const proposedReminder = parseProposedReminder(answer);
  const newlyGranted = await refreshUserAwards(user.id, supabase);

  return NextResponse.json({
    chatId,
    chats,
    messages: [userMsg, assistantMsg] as ChatMessageRow[],
    proposedReminder,
    newlyGranted,
  });
}
