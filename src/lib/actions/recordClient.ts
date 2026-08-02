"use client";

import { createClient } from "@/lib/supabase/client";
import type { ActionEventPhase } from "./types";

/** Record an action event from the client (RLS: own rows only). */
export async function recordClientActionEvent(args: {
  actionId: string;
  label: string;
  phase: ActionEventPhase;
  profileId?: string | null;
  chatId?: string | null;
  message?: string | null;
}): Promise<void> {
  const supabase = createClient();
  if (!supabase) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from("guardian_action_events").insert({
    owner_user_id: user.id,
    profile_id: args.profileId ?? null,
    chat_id: args.chatId ?? null,
    action_id: args.actionId,
    label: args.label,
    phase: args.phase,
    message: args.message ?? null,
  });

  if (error && error.code !== "42P01") {
    console.warn("guardian_action_events client insert failed:", error.message);
  }
}
