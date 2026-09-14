import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove synced rows for a Gmail source (disconnect or account switch). */
export async function clearInboxMessagesForSource(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string
): Promise<void> {
  const { data: messages, error: loadError } = await supabase
    .from("inbox_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("source_id", sourceId)
    .limit(1000);
  if (loadError) throw loadError;

  const messageIds = (messages ?? []).map((message) => String(message.id));
  if (messageIds.length > 0) {
    const { error: itemError } = await supabase
      .from("guardian_items")
      .delete()
      .eq("user_id", userId)
      .eq("source_type", "gmail")
      .in("source_id", messageIds);
    if (itemError) throw itemError;
  }

  const { error } = await supabase
    .from("inbox_messages")
    .delete()
    .eq("user_id", userId)
    .eq("source_id", sourceId);
  if (error) throw error;
}
