/**
 * In-memory guardian_events store for unit tests (no Supabase).
 * Enforces the same auth rules as the production repository.
 */

import {
  canReadGuardianEvent,
  canWriteGuardianEventSpace,
  filterReadableGuardianEvents,
} from "./auth";
import { buildGuardianEventDedupeKey } from "./dedupe";
import type {
  CreateGuardianEventInput,
  GuardianEvent,
  GuardianEventStatus,
  ListGuardianEventsFilter,
} from "./types";
import { sortGuardianEventsByOccurredAt } from "./sort";

export type MemoryEventAuth = {
  /** space_id → userIds who can access (viewer+) */
  accessibleBySpace: Map<string, Set<string>>;
  /** space_id → userIds who can edit (owner|editor) */
  editableBySpace: Map<string, Set<string>>;
};

function clampTitle(title: string): string {
  const t = title.trim();
  if (!t) return "Untitled";
  return t.length > 300 ? t.slice(0, 300) : t;
}

export function createMemoryGuardianEventStore(
  auth: MemoryEventAuth = {
    accessibleBySpace: new Map(),
    editableBySpace: new Map(),
  }
) {
  const rows = new Map<string, GuardianEvent>();
  let seq = 0;

  function authorizedSpaceIds(userId: string): string[] {
    const ids: string[] = [];
    for (const [spaceId, users] of auth.accessibleBySpace) {
      if (users.has(userId)) ids.push(spaceId);
    }
    return ids;
  }

  function editableSpaceIds(userId: string): string[] {
    const ids: string[] = [];
    for (const [spaceId, users] of auth.editableBySpace) {
      if (users.has(userId)) ids.push(spaceId);
    }
    return ids;
  }

  function grantAccess(
    spaceId: string,
    userId: string,
    role: "viewer" | "editor" | "owner" = "editor"
  ) {
    const access = auth.accessibleBySpace.get(spaceId) ?? new Set();
    access.add(userId);
    auth.accessibleBySpace.set(spaceId, access);
    if (role === "editor" || role === "owner") {
      const edit = auth.editableBySpace.get(spaceId) ?? new Set();
      edit.add(userId);
      auth.editableBySpace.set(spaceId, edit);
    }
  }

  function create(input: CreateGuardianEventInput): {
    ok: true;
    data: GuardianEvent;
    created: boolean;
  } | { ok: false; error: string; status: number } {
    const spaceId = input.spaceId ?? null;
    if (
      !canWriteGuardianEventSpace(spaceId, {
        userId: input.userId,
        editableSpaceIds: editableSpaceIds(input.userId),
      })
    ) {
      return {
        ok: false,
        error: "You don't have permission to add events in that space.",
        status: 403,
      };
    }

    const sourceType = input.sourceType ?? "manual";
    const sourceId = input.sourceId ?? null;
    const dedupeKey =
      input.dedupeKey ??
      (sourceId
        ? buildGuardianEventDedupeKey({
            eventType: input.eventType,
            title: input.title,
          })
        : null);

    if (dedupeKey) {
      for (const row of rows.values()) {
        if (
          row.user_id === input.userId &&
          row.source_type === sourceType &&
          row.dedupe_key === dedupeKey &&
          row.source_id === sourceId
        ) {
          return { ok: true, data: row, created: false };
        }
      }
    }

    const now = new Date().toISOString();
    seq += 1;
    const event: GuardianEvent = {
      id: `evt-${seq}`,
      user_id: input.userId,
      space_id: spaceId,
      event_type: input.eventType,
      title: clampTitle(input.title),
      summary: input.summary?.trim() || null,
      occurred_at: input.occurredAt ?? now,
      created_at: now,
      updated_at: now,
      source_type: sourceType,
      source_id: sourceId,
      dedupe_key: dedupeKey,
      importance_score: input.importanceScore ?? 0.5,
      action_required: Boolean(input.actionRequired),
      status: input.status ?? "open",
      metadata: input.metadata ?? {},
      created_by: input.createdBy ?? "user",
      confidence_score: input.confidenceScore ?? null,
    };
    rows.set(event.id, event);
    return { ok: true, data: event, created: true };
  }

  function list(filter: ListGuardianEventsFilter): GuardianEvent[] {
    const authorized = filter.spaceIds?.length
      ? authorizedSpaceIds(filter.userId).filter((id) =>
          filter.spaceIds!.includes(id)
        )
      : authorizedSpaceIds(filter.userId);
    const includeUnscoped = filter.includeUnscoped !== false;

    let events = filterReadableGuardianEvents([...rows.values()], {
      userId: filter.userId,
      authorizedSpaceIds: authorized,
    });

    if (!includeUnscoped) {
      events = events.filter((e) => e.space_id != null);
    }

    if (filter.eventTypes?.length) {
      const set = new Set(filter.eventTypes);
      events = events.filter((e) => set.has(e.event_type));
    }
    if (filter.statuses?.length) {
      const set = new Set(filter.statuses);
      events = events.filter((e) => set.has(e.status));
    }
    if (filter.actionRequired != null) {
      events = events.filter(
        (e) => e.action_required === filter.actionRequired
      );
    }
    if (filter.sourceType) {
      events = events.filter((e) => e.source_type === filter.sourceType);
    }
    if (filter.sourceId) {
      events = events.filter((e) => e.source_id === filter.sourceId);
    }

    events = sortGuardianEventsByOccurredAt(events, false);
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    return events.slice(offset, offset + limit);
  }

  function get(userId: string, eventId: string): GuardianEvent | null {
    const event = rows.get(eventId);
    if (!event) return null;
    if (
      !canReadGuardianEvent(event, {
        userId,
        authorizedSpaceIds: authorizedSpaceIds(userId),
      })
    ) {
      return null;
    }
    return event;
  }

  function associateSpace(
    userId: string,
    eventId: string,
    spaceId: string,
    confidenceScore?: number | null
  ):
    | { ok: true; data: GuardianEvent }
    | { ok: false; error: string; status: number } {
    const event = get(userId, eventId);
    if (!event) {
      return { ok: false, error: "Event not found.", status: 404 };
    }
    if (!editableSpaceIds(userId).includes(spaceId)) {
      return {
        ok: false,
        error: "You don't have permission to place events in that space.",
        status: 403,
      };
    }
    if (event.space_id == null && event.user_id !== userId) {
      return {
        ok: false,
        error: "You don't have permission to update that event.",
        status: 403,
      };
    }
    const updated: GuardianEvent = {
      ...event,
      space_id: spaceId,
      confidence_score:
        confidenceScore !== undefined
          ? confidenceScore
          : event.confidence_score,
      updated_at: new Date().toISOString(),
    };
    rows.set(eventId, updated);
    return { ok: true, data: updated };
  }

  function setStatus(
    userId: string,
    eventId: string,
    status: GuardianEventStatus
  ):
    | { ok: true; data: GuardianEvent }
    | { ok: false; error: string; status: number } {
    const event = get(userId, eventId);
    if (!event) {
      return { ok: false, error: "Event not found.", status: 404 };
    }
    if (
      !canWriteGuardianEventSpace(event.space_id, {
        userId,
        editableSpaceIds: editableSpaceIds(userId),
      }) ||
      (event.space_id == null && event.user_id !== userId)
    ) {
      return {
        ok: false,
        error: "You don't have permission to update that event.",
        status: 403,
      };
    }
    const updated = {
      ...event,
      status,
      updated_at: new Date().toISOString(),
    };
    rows.set(eventId, updated);
    return { ok: true, data: updated };
  }

  /** Test helper: snapshot of raw rows (including other users). */
  function unsafeAll(): GuardianEvent[] {
    return [...rows.values()];
  }

  return {
    grantAccess,
    create,
    list,
    get,
    associateSpace,
    setStatus,
    unsafeAll,
  };
}

export type MemoryGuardianEventStore = ReturnType<
  typeof createMemoryGuardianEventStore
>;
