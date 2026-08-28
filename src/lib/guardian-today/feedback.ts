import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const FEEDBACK_ACTIONS = [
  "completed",
  "dismissed",
  "snoozed",
  "opened",
  "asked_gideon",
  "reviewed",
] as const;

export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

export async function recordIntelligenceFeedback(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  action: FeedbackAction
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("guardian_intelligence_feedback").insert({
    user_id: userId,
    item_id: itemId,
    action,
  });

  if (error) {
    if (error.message.includes("guardian_intelligence_feedback")) {
      return { ok: true };
    }
    return { ok: false, error: "Couldn't record feedback." };
  }
  return { ok: true };
}
