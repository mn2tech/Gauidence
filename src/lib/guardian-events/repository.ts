/**
 * Guardian Events repository — create / list / get / update / associate.
 * Enforces membership before querying; RLS is defense in depth.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canWriteGuardianEventSpace,
  filterReadableGuardianEvents,
  resolveAuthorizedSpaceIds,
  resolveEditableSpaceIds,
} from "./auth";
import type {
  CreateGuardianEventInput,
  GuardianEvent,
  GuardianEventMetadata,
  GuardianEventStatus,
  GuardianEventType,
  ListGuardianEventsFilter,
} from "./types";
import { isGuardianEventStatus, isGuardianEventType } from "./types";
import { sortGuardianEventsByOccurredAt } from "./sort";

const EVENT_SELECT = `
  id, user_id, space_id, event_type, title, summary,
  occurred_at, created_at, updated_at,
  source_type, source_id, dedupe_key,
  importance_score, action_required, status,
  metadata, created_by, confidence_score
`;

export type GuardianEventResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

function asMetadata(raw: unknown): GuardianEventMetadata {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as GuardianEventMetadata;
  }
  return {};
}

export function rowToGuardianEvent(row: Record<string, unknown>): GuardianEvent {
  const eventType = isGuardianEventType(row.event_type)
    ? row.event_type
    : "note";
  const status = isGuardianEventStatus(row.status) ? row.status : "open";
  const createdBy =
    row.created_by === "system" ||
    row.created_by === "gideon" ||
    row.created_by === "backfill" ||
    row.created_by === "watch"
      ? row.created_by
      : "user";

  return {
    id: String(row.id),
    user_id: String(row.user_id),
    space_id: row.space_id == null ? null : String(row.space_id),
    event_type: eventType,
    title: String(row.title ?? ""),
    summary: row.summary == null ? null : String(row.summary),
    occurred_at: String(row.occurred_at ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    source_type: String(row.source_type ?? "manual"),
    source_id: row.source_id == null ? null : String(row.source_id),
    dedupe_key: row.dedupe_key == null ? null : String(row.dedupe_key),
    importance_score:
      typeof row.importance_score === "number" ? row.importance_score : 0.5,
    action_required: Boolean(row.action_required),
    status,
    metadata: asMetadata(row.metadata),
    created_by: createdBy,
    confidence_score:
      typeof row.confidence_score === "number" ? row.confidence_score : null,
  };
}

function clampTitle(title: string): string {
  const t = title.trim();
  if (!t) return "Untitled";
  return t.length > 300 ? t.slice(0, 300) : t;
}

function clampSummary(summary: string | null | undefined): string | null {
  if (summary == null) return null;
  const t = summary.trim();
  if (!t) return null;
  return t.length > 8000 ? t.slice(0, 8000) : t;
}

/**
 * Create a guardian event. Rejects unauthorized space_id.
 * Allows space_id null (global / unclassified).
 */
export async function createGuardianEvent(
  supabase: SupabaseClient,
  input: CreateGuardianEventInput
): Promise<GuardianEventResult<GuardianEvent>> {
  const spaceId = input.spaceId ?? null;
  const editable = await resolveEditableSpaceIds(supabase, input.userId);

  if (
    !canWriteGuardianEventSpace(spaceId, {
      userId: input.userId,
      editableSpaceIds: editable,
    })
  ) {
    return {
      ok: false,
      error: "You don't have permission to add events in that space.",
      status: 403,
    };
  }

  const now = new Date().toISOString();
  const row = {
    user_id: input.userId,
    space_id: spaceId,
    event_type: input.eventType,
    title: clampTitle(input.title),
    summary: clampSummary(input.summary),
    occurred_at: input.occurredAt ?? now,
    source_type: input.sourceType ?? "manual",
    source_id: input.sourceId ?? null,
    dedupe_key: input.dedupeKey ?? null,
    importance_score:
      input.importanceScore == null
        ? 0.5
        : Math.min(1, Math.max(0, input.importanceScore)),
    action_required: Boolean(input.actionRequired),
    status: input.status ?? "open",
    metadata: input.metadata ?? {},
    created_by: input.createdBy ?? "user",
    confidence_score: input.confidenceScore ?? null,
  };

  // Idempotent create when source + dedupe provided
  if (row.source_id && row.dedupe_key) {
    const { data: existing } = await supabase
      .from("guardian_events")
      .select(EVENT_SELECT)
      .eq("user_id", input.userId)
      .eq("source_type", row.source_type)
      .eq("source_id", row.source_id)
      .eq("dedupe_key", row.dedupe_key)
      .maybeSingle();
    if (existing) {
      return { ok: true, data: rowToGuardianEvent(existing as Record<string, unknown>) };
    }
  }

  const { data, error } = await supabase
    .from("guardian_events")
    .insert(row)
    .select(EVENT_SELECT)
    .single();

  if (error) {
    // Unique race: treat as idempotent hit
    if (/duplicate|unique/i.test(error.message) && row.source_id && row.dedupe_key) {
      const { data: raced } = await supabase
        .from("guardian_events")
        .select(EVENT_SELECT)
        .eq("user_id", input.userId)
        .eq("source_type", row.source_type)
        .eq("source_id", row.source_id)
        .eq("dedupe_key", row.dedupe_key)
        .maybeSingle();
      if (raced) {
        return {
          ok: true,
          data: rowToGuardianEvent(raced as Record<string, unknown>),
        };
      }
    }
    if (/row-level security|permission/i.test(error.message)) {
      return {
        ok: false,
        error: "You don't have permission to create that event.",
        status: 403,
      };
    }
    return {
      ok: false,
      error: error.message.slice(0, 200) || "Couldn't create event.",
      status: 502,
    };
  }

  return {
    ok: true,
    data: rowToGuardianEvent(data as Record<string, unknown>),
  };
}

/**
 * List events visible to the user across authorized spaces (+ optional unscoped).
 * Sorted by occurred_at desc (History default).
 */
export async function listGuardianEvents(
  supabase: SupabaseClient,
  filter: ListGuardianEventsFilter
): Promise<GuardianEventResult<GuardianEvent[]>> {
  const authorized = await resolveAuthorizedSpaceIds(supabase, filter.userId, {
    spaceIds: filter.spaceIds,
  });
  const includeUnscoped = filter.includeUnscoped !== false;
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  if (!authorized.length && !includeUnscoped) {
    return { ok: true, data: [] };
  }

  async function runScopedQuery(spaceIds: string[] | null, unscopedOnly: boolean) {
    let query = supabase
      .from("guardian_events")
      .select(EVENT_SELECT)
      .order("occurred_at", { ascending: false })
      .limit(limit + offset);

    if (unscopedOnly) {
      query = query.is("space_id", null).eq("user_id", filter.userId);
    } else if (spaceIds) {
      query = query.in("space_id", spaceIds);
    }

    if (filter.eventTypes?.length) {
      query = query.in("event_type", filter.eventTypes);
    }
    if (filter.statuses?.length) {
      query = query.in("status", filter.statuses);
    }
    if (filter.actionRequired != null) {
      query = query.eq("action_required", filter.actionRequired);
    }
    if (filter.sourceType) {
      query = query.eq("source_type", filter.sourceType);
    }
    if (filter.sourceId) {
      query = query.eq("source_id", filter.sourceId);
    }
    if (filter.occurredFrom) {
      query = query.gte("occurred_at", filter.occurredFrom);
    }
    if (filter.occurredTo) {
      query = query.lte("occurred_at", filter.occurredTo);
    }

    return query;
  }

  const batches: GuardianEvent[] = [];

  if (authorized.length) {
    const { data, error } = await runScopedQuery(authorized, false);
    if (error) {
      return {
        ok: false,
        error: error.message.slice(0, 200) || "Couldn't load events.",
        status: 502,
      };
    }
    batches.push(
      ...(data ?? []).map((r) => rowToGuardianEvent(r as Record<string, unknown>))
    );
  }

  if (includeUnscoped) {
    const { data, error } = await runScopedQuery(null, true);
    if (error) {
      return {
        ok: false,
        error: error.message.slice(0, 200) || "Couldn't load events.",
        status: 502,
      };
    }
    batches.push(
      ...(data ?? []).map((r) => rowToGuardianEvent(r as Record<string, unknown>))
    );
  }

  const byId = new Map<string, GuardianEvent>();
  for (const event of batches) byId.set(event.id, event);

  const visible = filterReadableGuardianEvents([...byId.values()], {
    userId: filter.userId,
    authorizedSpaceIds: authorized,
  });

  const sorted = sortGuardianEventsByOccurredAt(visible, false);
  return { ok: true, data: sorted.slice(offset, offset + limit) };
}

export async function getGuardianEvent(
  supabase: SupabaseClient,
  args: { userId: string; eventId: string }
): Promise<GuardianEventResult<GuardianEvent | null>> {
  const { data, error } = await supabase
    .from("guardian_events")
    .select(EVENT_SELECT)
    .eq("id", args.eventId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: error.message.slice(0, 200) || "Couldn't load event.",
      status: 502,
    };
  }
  if (!data) return { ok: true, data: null };

  const event = rowToGuardianEvent(data as Record<string, unknown>);
  const authorized = await resolveAuthorizedSpaceIds(supabase, args.userId);
  if (
    !filterReadableGuardianEvents([event], {
      userId: args.userId,
      authorizedSpaceIds: authorized,
    }).length
  ) {
    return { ok: true, data: null };
  }
  return { ok: true, data: event };
}

export async function updateGuardianEventStatus(
  supabase: SupabaseClient,
  args: {
    userId: string;
    eventId: string;
    status: GuardianEventStatus;
  }
): Promise<GuardianEventResult<GuardianEvent>> {
  const existing = await getGuardianEvent(supabase, {
    userId: args.userId,
    eventId: args.eventId,
  });
  if (!existing.ok) return existing;
  if (!existing.data) {
    return { ok: false, error: "Event not found.", status: 404 };
  }

  const editable = await resolveEditableSpaceIds(supabase, args.userId);
  if (
    !canWriteGuardianEventSpace(existing.data.space_id, {
      userId: args.userId,
      editableSpaceIds: editable,
    }) ||
    (existing.data.space_id == null && existing.data.user_id !== args.userId)
  ) {
    return {
      ok: false,
      error: "You don't have permission to update that event.",
      status: 403,
    };
  }

  const { data, error } = await supabase
    .from("guardian_events")
    .update({ status: args.status })
    .eq("id", args.eventId)
    .select(EVENT_SELECT)
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 200) || "Couldn't update event.",
      status: 502,
    };
  }
  return {
    ok: true,
    data: rowToGuardianEvent(data as Record<string, unknown>),
  };
}

/**
 * Associate an unscoped (or reclassified) event with a Space.
 * Requires edit access on the target space and ownership of unscoped events.
 */
export async function associateGuardianEventSpace(
  supabase: SupabaseClient,
  args: {
    userId: string;
    eventId: string;
    spaceId: string;
    confidenceScore?: number | null;
  }
): Promise<GuardianEventResult<GuardianEvent>> {
  const existing = await getGuardianEvent(supabase, {
    userId: args.userId,
    eventId: args.eventId,
  });
  if (!existing.ok) return existing;
  if (!existing.data) {
    return { ok: false, error: "Event not found.", status: 404 };
  }

  const editable = await resolveEditableSpaceIds(supabase, args.userId);
  if (!editable.includes(args.spaceId)) {
    return {
      ok: false,
      error: "You don't have permission to place events in that space.",
      status: 403,
    };
  }

  if (
    existing.data.space_id == null &&
    existing.data.user_id !== args.userId
  ) {
    return {
      ok: false,
      error: "You don't have permission to update that event.",
      status: 403,
    };
  }

  if (
    existing.data.space_id != null &&
    !editable.includes(existing.data.space_id)
  ) {
    return {
      ok: false,
      error: "You don't have permission to move that event.",
      status: 403,
    };
  }

  const patch: Record<string, unknown> = { space_id: args.spaceId };
  if (args.confidenceScore !== undefined) {
    patch.confidence_score = args.confidenceScore;
  }

  const { data, error } = await supabase
    .from("guardian_events")
    .update(patch)
    .eq("id", args.eventId)
    .select(EVENT_SELECT)
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message.slice(0, 200) || "Couldn't update event space.",
      status: 502,
    };
  }
  return {
    ok: true,
    data: rowToGuardianEvent(data as Record<string, unknown>),
  };
}

/** Sort helper for History (occurred_at desc, then created_at desc). */
export {
  sortGuardianEventsByOccurredAt,
  groupGuardianEventsByDate,
} from "./sort";

export type { GuardianEventType };
