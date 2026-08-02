import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionEventPhase } from "./types";

export type GuardianActionEventRow = {
  id: string;
  owner_user_id: string;
  profile_id: string | null;
  chat_id: string | null;
  action_id: string;
  label: string;
  phase: ActionEventPhase;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type RecordActionEventArgs = {
  userId: string;
  profileId?: string | null;
  chatId?: string | null;
  actionId: string;
  label: string;
  phase: ActionEventPhase;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function recordActionEvent(
  supabase: SupabaseClient,
  args: RecordActionEventArgs
): Promise<GuardianActionEventRow | null> {
  const { data, error } = await supabase
    .from("guardian_action_events")
    .insert({
      owner_user_id: args.userId,
      profile_id: args.profileId ?? null,
      chat_id: args.chatId ?? null,
      action_id: args.actionId,
      label: args.label,
      phase: args.phase,
      message: args.message ?? null,
      metadata: args.metadata ?? null,
    })
    .select(
      "id, owner_user_id, profile_id, chat_id, action_id, label, phase, message, metadata, created_at"
    )
    .single();

  if (error) {
    console.error(
      "guardian_action_events insert failed:",
      error.code,
      error.message
    );
    return null;
  }

  return data as GuardianActionEventRow;
}

export async function recordDetectedActions(
  supabase: SupabaseClient,
  args: {
    userId: string;
    profileId?: string | null;
    chatId?: string | null;
    actions: { id: string; label: string }[];
    question: string;
  }
): Promise<void> {
  await Promise.all(
    args.actions.map((action) =>
      recordActionEvent(supabase, {
        userId: args.userId,
        profileId: args.profileId,
        chatId: args.chatId,
        actionId: action.id,
        label: action.label,
        phase: "detected",
        message: args.question.slice(0, 500),
      })
    )
  );
}

export type ActionTimelineEntry = {
  id: string;
  actionId: string;
  label: string;
  phase: ActionEventPhase;
  message: string | null;
  createdAt: string;
};

export async function listActionTimeline(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    limit?: number;
    since?: Date;
    profileId?: string | null;
    phases?: ActionEventPhase[];
  }
): Promise<ActionTimelineEntry[]> {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const phases = options?.phases ?? ["executed", "failed"];
  let query = supabase
    .from("guardian_action_events")
    .select("id, action_id, label, phase, message, created_at")
    .eq("owner_user_id", userId)
    .in("phase", phases)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.since) {
    query = query.gte("created_at", options.since.toISOString());
  }
  if (options?.profileId) {
    query = query.eq("profile_id", options.profileId);
  }

  const { data, error } = await query;
  if (error) {
    if (error.code === "42P01") return [];
    console.error(
      "guardian_action_events list failed:",
      error.code,
      error.message
    );
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    actionId: row.action_id,
    label: row.label,
    phase: row.phase as ActionEventPhase,
    message: row.message,
    createdAt: row.created_at,
  }));
}

/** Start of the user's local calendar day in UTC for timeline filtering. */
export function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}
