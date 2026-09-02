import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SummitPriority, SummitPrivateCaptureRow } from "./types";
import { SUMMIT_SLUG } from "./constants";

export const DEFAULT_PRIVATE_PRIORITIES: {
  organization_name: string;
  priority: SummitPriority;
}[] = [
  { organization_name: "SAIC", priority: "HIGH" },
  { organization_name: "NTT DATA", priority: "HIGH" },
  { organization_name: "SOS International (SOSI)", priority: "HIGH" },
  { organization_name: "APEX Accelerator", priority: "MEDIUM" },
  { organization_name: "The Boeing Company", priority: "MEDIUM" },
];

/**
 * Ensure default private capture rows exist for a summit space.
 * Uses service-role client — never call from public endpoints.
 */
export async function ensureSummitPrivateCapture(
  supabase: SupabaseClient,
  summitSlug: string = SUMMIT_SLUG
): Promise<void> {
  for (const row of DEFAULT_PRIVATE_PRIORITIES) {
    await supabase.from("summit_private_capture").upsert(
      {
        summit_slug: summitSlug,
        organization_name: row.organization_name,
        priority: row.priority,
      },
      { onConflict: "summit_slug,organization_name" }
    );
  }
}

export async function loadPrivateCapture(
  supabase: SupabaseClient,
  summitSlug: string
): Promise<SummitPrivateCaptureRow[]> {
  const { data } = await supabase
    .from("summit_private_capture")
    .select("*")
    .eq("summit_slug", summitSlug)
    .order("priority", { ascending: true });

  return (data ?? []) as SummitPrivateCaptureRow[];
}

export async function updatePrivateCapture(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<
    Pick<
      SummitPrivateCaptureRow,
      | "priority"
      | "relationship_strength"
      | "opportunity_fit"
      | "capabilities_to_pitch"
      | "next_action"
      | "follow_up_date"
      | "notes"
    >
  >
): Promise<SummitPrivateCaptureRow | null> {
  const { data } = await supabase
    .from("summit_private_capture")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  return (data as SummitPrivateCaptureRow) ?? null;
}

/**
 * Strip any private capture data from a public knowledge payload.
 * Defense-in-depth: private table has no public RLS, but this ensures
 * no accidental leakage through composed responses.
 */
export function stripPrivateFields<T extends Record<string, unknown>>(
  payload: T
): Omit<T, "priority" | "notes" | "relationship_strength" | "opportunity_fit" | "capabilities_to_pitch" | "next_action" | "follow_up_date"> {
  const {
    priority: _p,
    notes: _n,
    relationship_strength: _r,
    opportunity_fit: _o,
    capabilities_to_pitch: _c,
    next_action: _a,
    follow_up_date: _f,
    ...safe
  } = payload as T & Record<string, unknown>;
  return safe as Omit<T, "priority" | "notes" | "relationship_strength" | "opportunity_fit" | "capabilities_to_pitch" | "next_action" | "follow_up_date">;
}
