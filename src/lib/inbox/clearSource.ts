import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove synced rows for a Gmail source (disconnect or account switch). */
export async function clearInboxMessagesForSource(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string
): Promise<void> {
  const { error } = await supabase
    .from("inbox_messages")
    .delete()
    .eq("user_id", userId)
    .eq("source_id", sourceId);
  if (error) throw error;
}
