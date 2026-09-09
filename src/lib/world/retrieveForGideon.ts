/**
 * Targeted My World retrieval for Gideon — never dump the full graph.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntityName } from "@/lib/semantic/normalize";
import { getWorldEntity, searchWorld } from "./api";
import type { WorldEntityDetail } from "./apiTypes";
import {
  extractWorldEntityQueryName,
  formatWorldEntityForGideon,
  wantsWorldEntityRetrieval,
} from "./retrieveFormat";

export {
  extractWorldEntityQueryName,
  formatWorldEntityForGideon,
  wantsWorldEntityRetrieval,
} from "./retrieveFormat";

export async function resolveWorldEntityForGideon(
  supabase: SupabaseClient,
  args: {
    userId: string;
    question: string;
    worldEntityId?: string | null;
  }
): Promise<{ detail: WorldEntityDetail; resolution: "id" | "search" } | null> {
  if (args.worldEntityId?.trim()) {
    const detail = await getWorldEntity(
      supabase,
      args.userId,
      args.worldEntityId.trim()
    );
    if (detail) return { detail, resolution: "id" };
  }

  const nameHint = extractWorldEntityQueryName(args.question);
  if (
    !args.worldEntityId?.trim() &&
    !wantsWorldEntityRetrieval(args.question) &&
    !nameHint
  ) {
    return null;
  }

  const name = nameHint ?? args.question.trim().slice(0, 80);
  if (!name || name.length < 2) return null;

  const hits = await searchWorld(supabase, args.userId, name, { limit: 8 });
  if (hits.length === 0) return null;

  const normalized = normalizeEntityName(name);
  const exact =
    hits.find((h) => normalizeEntityName(h.name) === normalized) ??
    hits.find((h) => normalizeEntityName(h.name).includes(normalized)) ??
    hits[0]!;

  const detail = await getWorldEntity(supabase, args.userId, exact.id);
  if (!detail) return null;
  return { detail, resolution: "search" };
}

export async function retrieveWorldContextForGideon(
  supabase: SupabaseClient,
  args: {
    userId: string;
    question: string;
    worldEntityId?: string | null;
  }
): Promise<string> {
  try {
    const resolved = await resolveWorldEntityForGideon(supabase, args);
    if (!resolved) return "(none)";
    return formatWorldEntityForGideon(resolved.detail);
  } catch {
    return "(none)";
  }
}
