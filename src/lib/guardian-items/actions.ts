import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarDateInUserZone } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/timezone/server";
import { zonedDateTimeToIso } from "@/lib/reminders/time";
import { selectNearDuplicateSiblingIds } from "./dedupe";
import { logGuardianEvent } from "./log";

export type ItemActionResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

async function resolveNearDuplicateSiblings(
  supabase: SupabaseClient,
  item: {
    id: string;
    space_id: string;
    title: string;
    source_document_id: string | null;
  },
  status: "completed" | "dismissed"
): Promise<number> {
  // Only collapse paraphrases that came from the same source document.
  if (!item.source_document_id) return 0;

  const { data: candidates } = await supabase
    .from("guardian_items")
    .select("id, title")
    .eq("space_id", item.space_id)
    .eq("source_document_id", item.source_document_id)
    .eq("status", "active")
    .neq("id", item.id)
    .limit(50);

  const siblingIds = selectNearDuplicateSiblingIds(
    item.title,
    (candidates ?? []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
    }))
  );

  if (siblingIds.length === 0) return 0;

  const now = new Date().toISOString();
  const patch =
    status === "completed"
      ? { status, completed_at: now, updated_at: now }
      : { status, dismissed_at: now, updated_at: now };

  const { error } = await supabase
    .from("guardian_items")
    .update(patch)
    .in("id", siblingIds)
    .eq("status", "active");

  if (error) {
    console.error(
      "Failed to resolve near-duplicate guardian siblings:",
      error.message
    );
    return 0;
  }
  return siblingIds.length;
}

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
    .select("id, space_id, title, source_document_id")
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

  const siblings = await resolveNearDuplicateSiblings(
    supabase,
    {
      id: data.id,
      space_id: data.space_id,
      title: String(data.title ?? ""),
      source_document_id: data.source_document_id ?? null,
    },
    "completed"
  );

  logGuardianEvent("guardian_item_completed", {
    item_id: data.id,
    space_id: data.space_id,
    siblings_completed: siblings,
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
    .select("id, space_id, title, source_document_id")
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

  const siblings = await resolveNearDuplicateSiblings(
    supabase,
    {
      id: data.id,
      space_id: data.space_id,
      title: String(data.title ?? ""),
      source_document_id: data.source_document_id ?? null,
    },
    "dismissed"
  );

  logGuardianEvent("guardian_item_dismissed", {
    item_id: data.id,
    space_id: data.space_id,
    siblings_dismissed: siblings,
  });
  return { ok: true };
}

export async function snoozeGuardianItem(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  options: { days?: number } = {}
): Promise<ItemActionResult> {
  const days = options.days ?? 1;
  const timeZone = await getUserTimeZone(supabase, userId);
  const now = new Date();
  const today = calendarDateInUserZone(now, timeZone);
  const [y, m, d] = today.split("-").map(Number);
  const remindDate = new Date(Date.UTC(y!, m! - 1, d! + days, 12));
  const remindDateStr = remindDate.toISOString().slice(0, 10);
  const remindAt =
    zonedDateTimeToIso({
      date: remindDateStr,
      time: "09:00",
      timeZone,
    }) ?? now.toISOString();

  const { data, error } = await supabase
    .from("guardian_items")
    .update({
      remind_at: remindAt,
      updated_at: now.toISOString(),
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
    return { ok: false, error: "Couldn't snooze that item.", status: 502 };
  }
  if (!data) {
    return { ok: false, error: "Item not found or already updated.", status: 404 };
  }

  logGuardianEvent("guardian_item_snoozed", {
    item_id: data.id,
    space_id: data.space_id,
  });
  return { ok: true };
}
