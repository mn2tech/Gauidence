import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function logOrganizationEvent(
  supabase: SupabaseClient,
  params: {
    userId: string;
    documentId: string;
    suggestionId?: string | null;
    eventType: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("organization_audit_log").insert({
    user_id: params.userId,
    document_id: params.documentId,
    suggestion_id: params.suggestionId ?? null,
    event_type: params.eventType,
    payload: params.payload ?? {},
  });
  if (error) {
    console.error("organization_audit_log insert failed:", error.message);
  }
}
