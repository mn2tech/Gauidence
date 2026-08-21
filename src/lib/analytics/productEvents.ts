import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Persist a product funnel event. Prefer the caller's supabase client;
 * falls back to admin when RLS would block (e.g. server webhooks).
 */
export async function recordProductEvent(
  supabase: SupabaseClient | null,
  userId: string | null,
  eventName: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    const row = {
      user_id: userId,
      event_name: eventName,
      properties,
    };
    if (supabase && userId) {
      const { error } = await supabase.from("product_events").insert(row);
      if (!error) return;
      // Missing table / RLS — try admin once.
    }
    const admin = createAdminClient();
    if (admin) {
      await admin.from("product_events").insert(row);
    }
  } catch {
    /* non-fatal */
  }
}
