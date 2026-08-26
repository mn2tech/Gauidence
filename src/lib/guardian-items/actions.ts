import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logGuardianEvent } from "./log";

export type ItemActionResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

export async function completeGuardianItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<ItemActionResult> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("guardian_items")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", itemId)
    .eq("status", "active")
    .select("id, space_id")
    .maybeSingle();

  if (error) {
    if (error.message.includes("row-level security")) {
      return {
        ok: false,
        error: "You don't have permission to update this item.",
        status: 403,
      };
    }
    return { ok: false, error: "Couldn't mark that done.", status: 502 };
  }
  if (!data) {
    return { ok: false, error: "Item not found or already updated.", status: 404 };
  }

  logGuardianEvent("guardian_item_completed", {
    item_id: data.id,
    space_id: data.space_id,
  });
  return { ok: true };
}

export async function dismissGuardianItem(
  supabase: SupabaseClient,
  itemId: string
): Promise<ItemActionResult> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("guardian_items")
    .update({
      status: "dismissed",
      dismissed_at: now,
      updated_at: now,
    })
    .eq("id", itemId)
    .eq("status", "active")
    .select("id, space_id")
    .maybeSingle();

  if (error) {
    if (error.message.includes("row-level security")) {
      return {
        ok: false,
        error: "You don't have permission to update this item.",
        status: 403,
      };
    }
    return { ok: false, error: "Couldn't dismiss that item.", status: 502 };
  }
  if (!data) {
    return { ok: false, error: "Item not found or already updated.", status: 404 };
  }

  logGuardianEvent("guardian_item_dismissed", {
    item_id: data.id,
    space_id: data.space_id,
  });
  return { ok: true };
}
