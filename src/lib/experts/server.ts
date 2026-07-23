import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { canAccessGuardianExperts } from "@/lib/features/experts";
import { requireAccessibleGuardianProfile } from "@/lib/profiles/server";
import type {
  ExpertActivityType,
  UserExpert,
} from "@/lib/experts/expert-types";

export const USER_EXPERT_SELECT =
  "id, user_id, profile_id, expert_id, expert_version, status, installed_at, last_opened_at, preferences, created_at, updated_at";

export type ExpertAuthed = {
  supabase: SupabaseClient;
  user: User;
};

export async function requireExpertUser(): Promise<ExpertAuthed | NextResponse> {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Guardian isn't configured yet." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  if (!canAccessGuardianExperts({ email: user.email })) {
    return NextResponse.json(
      { error: "Guardian Experts is not available for your account." },
      { status: 403 }
    );
  }

  return { supabase, user };
}

export function isExpertAuthed(v: ExpertAuthed | NextResponse): v is ExpertAuthed {
  return !(v instanceof NextResponse);
}

export async function getUserExpertById(
  supabase: SupabaseClient,
  userId: string,
  userExpertId: string
): Promise<UserExpert | null> {
  const { data, error } = await supabase
    .from("user_experts")
    .select(USER_EXPERT_SELECT)
    .eq("id", userExpertId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getUserExpertById:", error.message);
    return null;
  }
  return (data as UserExpert | null) ?? null;
}

export async function requireOwnedUserExpert(
  supabase: SupabaseClient,
  userId: string,
  userExpertId: string
): Promise<UserExpert | null> {
  const row = await getUserExpertById(supabase, userId, userExpertId);
  if (!row) return null;

  const profile = await requireAccessibleGuardianProfile(
    supabase,
    userId,
    row.profile_id
  );
  if (!profile) return null;
  return row;
}

export async function listUserExpertsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<UserExpert[]> {
  const { data, error } = await supabase
    .from("user_experts")
    .select(USER_EXPERT_SELECT)
    .eq("user_id", userId)
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .order("installed_at", { ascending: false });

  if (error) {
    console.error("listUserExpertsForUser:", error.message);
    return [];
  }
  return (data ?? []) as UserExpert[];
}

export async function listUserExpertsByExpertId(
  supabase: SupabaseClient,
  userId: string,
  expertId: string
): Promise<UserExpert[]> {
  const { data, error } = await supabase
    .from("user_experts")
    .select(USER_EXPERT_SELECT)
    .eq("user_id", userId)
    .eq("expert_id", expertId);

  if (error) {
    console.error("listUserExpertsByExpertId:", error.message);
    return [];
  }
  return (data ?? []) as UserExpert[];
}

export async function recordExpertActivity(
  supabase: SupabaseClient,
  params: {
    userId: string;
    userExpertId: string;
    activityType: ExpertActivityType;
    contentId?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("expert_activity").insert({
    user_id: params.userId,
    user_expert_id: params.userExpertId,
    activity_type: params.activityType,
    content_id: params.contentId ?? null,
    metadata: params.metadata ?? {},
  });
  if (error) {
    console.error("recordExpertActivity:", error.message);
  }
}

export async function touchUserExpertOpened(
  supabase: SupabaseClient,
  userId: string,
  userExpertId: string
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("user_experts")
    .update({ last_opened_at: now, updated_at: now })
    .eq("id", userExpertId)
    .eq("user_id", userId);
}

export function getConversationFromPreferences(
  preferences: Record<string, unknown>,
  conversationId: string
): { messages: { role: "user" | "assistant"; content: string }[] } | null {
  const conversations = preferences.conversations;
  if (!conversations || typeof conversations !== "object") return null;
  const thread = (conversations as Record<string, unknown>)[conversationId];
  if (!thread || typeof thread !== "object") return null;
  const messages = (thread as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return null;
  const parsed = messages
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        !!m &&
        typeof m === "object" &&
        ((m as { role?: string }).role === "user" ||
          (m as { role?: string }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string"
    )
    .map((m) => ({ role: m.role, content: m.content }));
  return { messages: parsed };
}

export function appendConversationToPreferences(
  preferences: Record<string, unknown>,
  conversationId: string,
  userMessage: string,
  assistantMessage: string
): Record<string, unknown> {
  const conversations =
    preferences.conversations && typeof preferences.conversations === "object"
      ? { ...(preferences.conversations as Record<string, unknown>) }
      : {};

  const existing = conversations[conversationId];
  const priorMessages =
    existing &&
    typeof existing === "object" &&
    Array.isArray((existing as { messages?: unknown }).messages)
      ? ((existing as { messages: { role: "user" | "assistant"; content: string }[] })
          .messages ?? [])
      : [];

  conversations[conversationId] = {
    updated_at: new Date().toISOString(),
    messages: [
      ...priorMessages,
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage },
    ].slice(-40),
  };

  return { ...preferences, conversations };
}
