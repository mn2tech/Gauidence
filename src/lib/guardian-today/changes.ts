import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuardianItemType } from "@/lib/guardian-items/types";
import type { WhatChangedEntry } from "./types";

const CHANGE_LABELS: Partial<Record<GuardianItemType, string>> = {
  deadline: "New deadline detected",
  expiration: "New expiration detected",
  renewal: "Renewal date detected",
  commitment: "New commitment detected",
  follow_up: "Follow-up needed",
  task: "New task detected",
  payment: "Payment due detected",
  document_requirement: "New requirement detected",
};

function changeLabel(type: GuardianItemType, createdAt: string, updatedAt: string): string {
  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();
  const isNew = Math.abs(updated - created) < 60_000;
  const base = CHANGE_LABELS[type] ?? "New item detected";
  if (isNew) return base;
  if (type === "task" || type === "commitment") return "Status changed";
  return "Information updated";
}

function relativeWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Meaningful recent intelligence changes — not a noisy activity feed.
 */
export async function getWhatChanged(
  supabase: SupabaseClient,
  spaceIds: string[],
  options: { sinceDays?: number; limit?: number } = {}
): Promise<WhatChangedEntry[]> {
  if (spaceIds.length === 0) return [];

  const sinceDays = options.sinceDays ?? 7;
  const limit = options.limit ?? 6;
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const { data, error } = await supabase
    .from("guardian_items")
    .select("id, space_id, type, title, created_at, updated_at")
    .in("space_id", spaceIds)
    .in("status", ["active", "completed"])
    .gte("updated_at", since.toISOString())
    .order("updated_at", { ascending: false })
    .limit(limit * 2);

  if (error || !data?.length) return [];

  const spaceIdsInResults = [...new Set(data.map((r) => r.space_id as string))];
  const nameMap: Record<string, string> = {};
  const { data: profiles } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .in("id", spaceIdsInResults);
  for (const p of profiles ?? []) {
    nameMap[p.id] = p.display_name;
  }

  const meaningfulTypes = new Set<GuardianItemType>([
    "deadline",
    "expiration",
    "renewal",
    "commitment",
    "follow_up",
    "task",
    "payment",
    "document_requirement",
  ]);

  return data
    .filter((row) => meaningfulTypes.has(row.type as GuardianItemType))
    .slice(0, limit)
    .map((row) => ({
      id: `${row.id}-${row.updated_at}`,
      itemId: row.id as string,
      spaceId: row.space_id as string,
      spaceName: nameMap[row.space_id as string] ?? null,
      label: `${changeLabel(
        row.type as GuardianItemType,
        row.created_at as string,
        row.updated_at as string
      )} ${relativeWhen(row.updated_at as string)}`,
      occurredAt: row.updated_at as string,
    }));
}
