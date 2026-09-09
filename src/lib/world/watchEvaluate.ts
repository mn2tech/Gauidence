/**
 * Pure World Watch candidate builders (no DB).
 */

export type WorldWatchEntity = {
  id: string;
  name: string;
  entity_type: string;
  importance_score?: number | null;
  status?: string | null;
  last_seen_at?: string | null;
};

export type WorldWatchFact = {
  id: string;
  subject_entity_id: string | null;
  predicate: string;
  value_text: string | null;
  value_date: string | null;
  confidence?: number | null;
};

export type WorldWatchTimeline = {
  id: string;
  title: string;
  summary: string | null;
  entry_type: string;
  primary_entity_id: string | null;
  space_id: string | null;
  occurred_at: string;
  importance_score?: number | null;
};

export type WorldWatchInbox = {
  id: string;
  type: string;
  title: string | null;
  space_id: string | null;
  payload?: Record<string, unknown> | null;
};

export type WorldWatchCandidate = {
  type: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "urgent";
  requiresAction: boolean;
  dueAt?: string | null;
  eventDate?: string | null;
  dedupeKey: string;
  semanticEntityIds?: string[];
  semanticFactIds?: string[];
  confidence: number;
  sourceExcerpt?: string;
  preferredSpaceId?: string | null;
};

const MS_DAY = 86_400_000;

function daysFrom(now: Date, iso: string): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (t - now.getTime()) / MS_DAY;
}

/** Open commitments on World entities → attention. */
export function candidatesFromOpenCommitments(
  facts: WorldWatchFact[],
  entitiesById: Map<string, WorldWatchEntity>
): WorldWatchCandidate[] {
  const out: WorldWatchCandidate[] = [];
  for (const fact of facts) {
    if (fact.predicate !== "open_commitment") continue;
    const text = fact.value_text?.trim();
    if (!text) continue;
    const entity = fact.subject_entity_id
      ? entitiesById.get(fact.subject_entity_id)
      : undefined;
    const who = entity?.name ? ` (${entity.name})` : "";
    out.push({
      type: "follow_up",
      title: `Open commitment${who}`.slice(0, 300),
      description: text.slice(0, 800),
      priority: "high",
      requiresAction: true,
      dueAt: fact.value_date,
      dedupeKey: `world:open_commitment:${fact.id}`,
      semanticEntityIds: fact.subject_entity_id
        ? [fact.subject_entity_id]
        : [],
      semanticFactIds: [fact.id],
      confidence: fact.confidence ?? 0.75,
      sourceExcerpt: text.slice(0, 400),
    });
  }
  return out;
}

/** Upcoming / recent high-signal timeline moments. */
export function candidatesFromTimeline(
  timeline: WorldWatchTimeline[],
  now: Date
): WorldWatchCandidate[] {
  const out: WorldWatchCandidate[] = [];
  for (const entry of timeline) {
    const importance = entry.importance_score ?? 0;
    if (importance < 0.55) continue;

    const delta = daysFrom(now, entry.occurred_at);
    const isDeadlineish = /deadline|commitment|contract|invoice|security/i.test(
      entry.entry_type
    );
    // Future within 21 days, or past 3 days for deadline-like types
    const relevant =
      (delta >= -0.5 && delta <= 21) ||
      (isDeadlineish && delta >= -3 && delta < 0);
    if (!relevant) continue;

    const priority: WorldWatchCandidate["priority"] =
      delta >= 0 && delta <= 3
        ? "urgent"
        : isDeadlineish
          ? "high"
          : "normal";

    out.push({
      type: isDeadlineish ? "deadline" : "event",
      title: entry.title.slice(0, 300),
      description: (entry.summary ?? entry.title).slice(0, 800),
      priority,
      requiresAction: isDeadlineish,
      dueAt: isDeadlineish ? entry.occurred_at : null,
      eventDate: entry.occurred_at,
      dedupeKey: `world:timeline:${entry.id}`,
      semanticEntityIds: entry.primary_entity_id
        ? [entry.primary_entity_id]
        : [],
      confidence: Math.min(0.95, 0.6 + importance * 0.3),
      sourceExcerpt: entry.summary?.slice(0, 400),
      preferredSpaceId: entry.space_id,
    });
  }
  return out;
}

/** Pending World Inbox items that need a human decision. */
export function candidatesFromInbox(
  inbox: WorldWatchInbox[]
): WorldWatchCandidate[] {
  const out: WorldWatchCandidate[] = [];
  for (const item of inbox) {
    if (!/ENTITY_MERGE|ENTITY_CONFIRMATION|AMBIGUOUS_FACT/i.test(item.type)) {
      continue;
    }
    const title =
      item.title?.trim() ||
      (item.type === "ENTITY_MERGE"
        ? "Confirm whether these are the same person"
        : "Confirm what Guardian noticed");
    out.push({
      type: "review",
      title: title.slice(0, 300),
      description:
        "My World needs a quick confirmation so Guardian keeps people and facts straight.",
      priority: item.type === "ENTITY_MERGE" ? "high" : "normal",
      requiresAction: true,
      dedupeKey: `world:inbox:${item.id}`,
      semanticEntityIds: [],
      confidence: 0.85,
      preferredSpaceId: item.space_id,
    });
  }
  return out;
}

/**
 * High-importance people/orgs recently seen with no other watch signal —
 * light "noticed" attention (capped).
 */
export function candidatesFromImportantEntities(
  entities: WorldWatchEntity[],
  now: Date,
  alreadyCoveredEntityIds: Set<string>
): WorldWatchCandidate[] {
  const out: WorldWatchCandidate[] = [];
  const ranked = entities
    .filter((e) => {
      if (e.status && e.status !== "active") return false;
      if ((e.importance_score ?? 0) < 0.75) return false;
      if (!/person|organization|client|agency|school/i.test(e.entity_type)) {
        return false;
      }
      if (alreadyCoveredEntityIds.has(e.id)) return false;
      if (!e.last_seen_at) return false;
      const age = -daysFrom(now, e.last_seen_at);
      return age >= 0 && age <= 7;
    })
    .sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))
    .slice(0, 3);

  for (const e of ranked) {
    out.push({
      type: "notice",
      title: `Keep an eye on ${e.name}`.slice(0, 300),
      description: `${e.name} showed up recently in your world and looks important.`,
      priority: "low",
      requiresAction: false,
      dedupeKey: `world:important:${e.id}`,
      semanticEntityIds: [e.id],
      confidence: 0.7,
    });
  }
  return out;
}

export function evaluateWorldWatchCandidates(args: {
  now: Date;
  entities: WorldWatchEntity[];
  facts: WorldWatchFact[];
  timeline: WorldWatchTimeline[];
  inbox: WorldWatchInbox[];
}): WorldWatchCandidate[] {
  const entitiesById = new Map(args.entities.map((e) => [e.id, e]));
  const fromFacts = candidatesFromOpenCommitments(args.facts, entitiesById);
  const fromTimeline = candidatesFromTimeline(args.timeline, args.now);
  const fromInbox = candidatesFromInbox(args.inbox);

  const covered = new Set<string>();
  for (const c of [...fromFacts, ...fromTimeline]) {
    for (const id of c.semanticEntityIds ?? []) covered.add(id);
  }

  const fromImportant = candidatesFromImportantEntities(
    args.entities,
    args.now,
    covered
  );

  return [...fromFacts, ...fromTimeline, ...fromInbox, ...fromImportant];
}
