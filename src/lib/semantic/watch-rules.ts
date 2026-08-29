import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  semanticDeadlineHorizonDays,
  semanticFollowUpQuietDays,
} from "@/lib/features/semantic-layer";
import { logSemanticEvent } from "./log";
import { isActionableCommitmentText } from "./commitment-filter";
import type { SemanticEntity, SemanticFact, SemanticRelationship } from "./types";
import {
  SEMANTIC_ENTITY_SELECT,
  SEMANTIC_FACT_SELECT,
  SEMANTIC_RELATIONSHIP_SELECT,
} from "./types";

export { isActionableCommitmentText } from "./commitment-filter";

export type SemanticWatchRuleCategory =
  | "opportunity"
  | "deadline"
  | "follow_up"
  | "commitment";

export type SemanticWatchContext = {
  supabase: SupabaseClient;
  userId: string;
  /** Preferred Space (e.g. document just processed). Not used to fan out. */
  preferredSpaceId?: string;
  now: Date;
  entities: SemanticEntity[];
  relationships: SemanticRelationship[];
  facts: SemanticFact[];
};

export type SemanticWatchCandidate = {
  type: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "urgent";
  requiresAction: boolean;
  dueAt?: string | null;
  eventDate?: string | null;
  dedupeKey: string;
  semanticEntityIds?: string[];
  semanticRelationshipIds?: string[];
  semanticFactIds?: string[];
  confidence: number;
  sourceExcerpt?: string;
};

export type SemanticWatchRule = {
  id: string;
  name: string;
  description: string;
  category: SemanticWatchRuleCategory;
  priority: number;
  evaluate(context: SemanticWatchContext): Promise<SemanticWatchCandidate[]>;
};

const EXPERIENCE_RELS = new Set([
  "supported",
  "supports",
  "works_with",
  "partner_of",
  "client_of",
  "awarded_to",
]);

function entityById(
  entities: SemanticEntity[],
  id: string
): SemanticEntity | undefined {
  return entities.find((e) => e.id === id);
}

function userOrgIds(entities: SemanticEntity[]): Set<string> {
  return new Set(
    entities.filter((e) => e.entity_type === "organization").map((e) => e.id)
  );
}

/** Opportunity matches prior agency/org experience. */
const existingRelationshipOpportunity: SemanticWatchRule = {
  id: "existing_relationship_opportunity",
  name: "Existing relationship opportunity",
  description:
    "Opportunity tied to an agency/org the user's organization has supported or worked with.",
  category: "opportunity",
  priority: 10,
  async evaluate(ctx) {
    const candidates: SemanticWatchCandidate[] = [];
    const orgs = userOrgIds(ctx.entities);
    const opportunities = ctx.entities.filter(
      (e) => e.entity_type === "opportunity"
    );

    for (const opp of opportunities) {
      const issuedBy = ctx.relationships.filter(
        (r) =>
          r.source_entity_id === opp.id &&
          (r.relationship_type === "issued_by" ||
            r.relationship_type === "associated_with" ||
            r.relationship_type === "related_to")
      );

      for (const link of issuedBy) {
        const agency = entityById(ctx.entities, link.target_entity_id);
        if (!agency) continue;
        if (
          agency.entity_type !== "agency" &&
          agency.entity_type !== "organization"
        ) {
          continue;
        }

        const prior = ctx.relationships.find(
          (r) =>
            EXPERIENCE_RELS.has(r.relationship_type) &&
            orgs.has(r.source_entity_id) &&
            r.target_entity_id === agency.id
        );
        if (!prior) continue;

        const userOrg = entityById(ctx.entities, prior.source_entity_id);
        candidates.push({
          type: "informational",
          title: "Opportunity matches your existing experience",
          description: `${userOrg?.canonical_name ?? "Your organization"} has prior ${agency.canonical_name} experience and ${opp.canonical_name} is associated with ${agency.canonical_name}.`,
          priority: "high",
          requiresAction: true,
          dedupeKey: `semantic:opp-experience:${opp.id}:${agency.id}`,
          semanticEntityIds: [opp.id, agency.id, prior.source_entity_id],
          semanticRelationshipIds: [link.id, prior.id],
          confidence: Math.min(
            opp.confidence ?? 0.8,
            prior.confidence ?? 0.8,
            link.confidence ?? 0.8
          ),
          sourceExcerpt: `Matched ${opp.canonical_name} with prior ${agency.canonical_name} relationship.`,
        });
      }
    }

    return candidates;
  },
};

/** Deadline within configurable horizon. */
const upcomingDeadline: SemanticWatchRule = {
  id: "upcoming_deadline",
  name: "Upcoming deadline",
  description: "Deadline entity within the configured horizon.",
  category: "deadline",
  priority: 20,
  async evaluate(ctx) {
    const candidates: SemanticWatchCandidate[] = [];
    const horizonDays = semanticDeadlineHorizonDays();
    const now = ctx.now.getTime();
    const horizonMs = horizonDays * 24 * 60 * 60 * 1000;

    const deadlines = ctx.entities.filter((e) => e.entity_type === "deadline");

    for (const deadline of deadlines) {
      const dueFact = ctx.facts.find(
        (f) =>
          f.subject_entity_id === deadline.id &&
          (f.predicate === "deadline_date" || f.predicate === "status") &&
          f.value_date
      );
      const dueOn = ctx.relationships.find(
        (r) =>
          r.relationship_type === "due_on" &&
          (r.target_entity_id === deadline.id ||
            r.source_entity_id === deadline.id)
      );

      let dueIso: string | null = dueFact?.value_date ?? null;
      if (!dueIso && deadline.attributes?.date) {
        dueIso = String(deadline.attributes.date);
      }
      if (!dueIso) {
        const parsed = Date.parse(deadline.canonical_name);
        if (Number.isFinite(parsed)) dueIso = new Date(parsed).toISOString();
      }

      if (!dueIso) continue;
      const dueMs = Date.parse(dueIso);
      if (!Number.isFinite(dueMs)) continue;
      const delta = dueMs - now;
      if (delta < 0 || delta > horizonMs) continue;

      const related =
        dueOn != null
          ? entityById(
              ctx.entities,
              dueOn.source_entity_id === deadline.id
                ? dueOn.target_entity_id
                : dueOn.source_entity_id
            )
          : null;

      candidates.push({
        type: "deadline",
        title: "Deadline approaching",
        description: related
          ? `${related.canonical_name} has a deadline on ${dueIso.slice(0, 10)}.`
          : `Deadline "${deadline.canonical_name}" is approaching (${dueIso.slice(0, 10)}).`,
        priority: delta < 3 * 24 * 60 * 60 * 1000 ? "urgent" : "high",
        requiresAction: true,
        dueAt: dueIso,
        eventDate: dueIso.slice(0, 10),
        dedupeKey: `semantic:deadline:${deadline.id}:${dueIso.slice(0, 10)}`,
        semanticEntityIds: [
          deadline.id,
          ...(related ? [related.id] : []),
        ],
        semanticRelationshipIds: dueOn ? [dueOn.id] : [],
        semanticFactIds: dueFact ? [dueFact.id] : [],
        confidence: deadline.confidence ?? 0.85,
      });
    }

    for (const fact of ctx.facts) {
      if (fact.predicate !== "deadline_date" || !fact.value_date) continue;
      if (!fact.subject_entity_id) continue;
      const subject = entityById(ctx.entities, fact.subject_entity_id);
      if (!subject) continue;
      if (
        subject.entity_type !== "opportunity" &&
        subject.entity_type !== "task" &&
        subject.entity_type !== "contract"
      ) {
        continue;
      }
      const dueMs = Date.parse(fact.value_date);
      if (!Number.isFinite(dueMs)) continue;
      const delta = dueMs - now;
      if (delta < 0 || delta > horizonMs) continue;

      candidates.push({
        type: "deadline",
        title: "Deadline approaching",
        description: `${subject.canonical_name} closes or is due ${fact.value_date.slice(0, 10)}.`,
        priority: delta < 3 * 24 * 60 * 60 * 1000 ? "urgent" : "high",
        requiresAction: true,
        dueAt: fact.value_date,
        eventDate: fact.value_date.slice(0, 10),
        dedupeKey: `semantic:deadline-fact:${subject.id}:${fact.value_date.slice(0, 10)}`,
        semanticEntityIds: [subject.id],
        semanticFactIds: [fact.id],
        confidence: fact.confidence ?? 0.85,
      });
    }

    return candidates;
  },
};

/** Conservative follow-up suggestion. */
const followUpRelationship: SemanticWatchRule = {
  id: "follow_up_relationship",
  name: "Follow-up relationship",
  description:
    "Conservative follow-up when a meaningful contact relationship has gone quiet.",
  category: "follow_up",
  priority: 40,
  async evaluate(ctx) {
    const candidates: SemanticWatchCandidate[] = [];
    const quietMs = semanticFollowUpQuietDays() * 24 * 60 * 60 * 1000;
    const now = ctx.now.getTime();

    const contactRels = ctx.relationships.filter((r) =>
      ["met_with", "introduced_to", "contact_for"].includes(r.relationship_type)
    );

    for (const rel of contactRels) {
      if ((rel.confidence ?? 0) < 0.92) continue;
      const lastSeen = rel.last_seen_at
        ? Date.parse(rel.last_seen_at)
        : Date.parse(rel.created_at);
      if (!Number.isFinite(lastSeen)) continue;
      if (now - lastSeen < quietMs) continue;

      const person =
        entityById(ctx.entities, rel.target_entity_id) ??
        entityById(ctx.entities, rel.source_entity_id);
      if (!person) continue;
      if (
        person.entity_type !== "person" &&
        person.entity_type !== "organization"
      ) {
        continue;
      }

      candidates.push({
        type: "follow_up",
        title: `Consider following up with ${person.canonical_name}`,
        description: `No newer interaction recorded for ${semanticFollowUpQuietDays()} days after a ${rel.relationship_type.replace(/_/g, " ")} relationship.`,
        priority: "low",
        requiresAction: false,
        dedupeKey: `semantic:followup:${person.id}:${rel.relationship_type}`,
        semanticEntityIds: [person.id],
        semanticRelationshipIds: [rel.id],
        confidence: Math.min(rel.confidence ?? 0.9, 0.85),
      });
    }

    return candidates;
  },
};

/** Open commitment from clear evidence — conservative. */
const openCommitment: SemanticWatchRule = {
  id: "open_commitment",
  name: "Open commitment",
  description: "Action promised/assigned/incomplete with clear evidence.",
  category: "commitment",
  priority: 15,
  async evaluate(ctx) {
    const candidates: SemanticWatchCandidate[] = [];
    const predicates = new Set([
      "open_commitment",
      "action_promised",
      "action_assigned",
      "task_incomplete",
    ]);

    for (const fact of ctx.facts) {
      if (!predicates.has(fact.predicate)) continue;
      if ((fact.confidence ?? 0) < 0.92) continue;
      if (!fact.value_text) continue;
      if (!isActionableCommitmentText(fact.value_text)) continue;

      candidates.push({
        type: "commitment",
        title: "You have an open commitment",
        description: fact.value_text.slice(0, 300),
        priority: "high",
        requiresAction: true,
        dedupeKey: `semantic:commitment:${fact.id}`,
        semanticEntityIds: fact.subject_entity_id
          ? [fact.subject_entity_id]
          : [],
        semanticFactIds: [fact.id],
        confidence: fact.confidence ?? 0.92,
        sourceExcerpt: fact.value_text.slice(0, 200),
      });
    }

    const assigned = ctx.relationships.filter(
      (r) => r.relationship_type === "assigned_to" && (r.confidence ?? 0) >= 0.92
    );
    for (const rel of assigned) {
      const task = entityById(ctx.entities, rel.source_entity_id);
      const assignee = entityById(ctx.entities, rel.target_entity_id);
      if (!task || task.entity_type !== "task") continue;
      if (!isActionableCommitmentText(task.canonical_name)) continue;

      candidates.push({
        type: "commitment",
        title: "You have an open commitment",
        description: `${task.canonical_name}${assignee ? ` assigned to ${assignee.canonical_name}` : ""}.`,
        priority: "high",
        requiresAction: true,
        dedupeKey: `semantic:assigned:${rel.id}`,
        semanticEntityIds: [task.id, ...(assignee ? [assignee.id] : [])],
        semanticRelationshipIds: [rel.id],
        confidence: rel.confidence ?? 0.92,
      });
    }

    return candidates;
  },
};

export const SEMANTIC_WATCH_RULES: SemanticWatchRule[] = [
  existingRelationshipOpportunity,
  upcomingDeadline,
  followUpRelationship,
  openCommitment,
];

async function loadSemanticContext(
  supabase: SupabaseClient,
  userId: string
): Promise<
  Omit<SemanticWatchContext, "supabase" | "userId" | "preferredSpaceId" | "now">
> {
  const [{ data: entities }, { data: relationships }, { data: facts }] =
    await Promise.all([
      supabase
        .from("semantic_entities")
        .select(SEMANTIC_ENTITY_SELECT)
        .eq("user_id", userId)
        .limit(500),
      supabase
        .from("semantic_relationships")
        .select(SEMANTIC_RELATIONSHIP_SELECT)
        .eq("user_id", userId)
        .limit(1000),
      supabase
        .from("semantic_facts")
        .select(SEMANTIC_FACT_SELECT)
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(500),
    ]);

  return {
    entities: (entities ?? []) as SemanticEntity[],
    relationships: (relationships ?? []) as SemanticRelationship[],
    facts: (facts ?? []) as SemanticFact[],
  };
}

/** Spaces that provided evidence for this semantic object. */
async function resolveEvidenceSpaceIds(
  supabase: SupabaseClient,
  userId: string,
  candidate: SemanticWatchCandidate
): Promise<string[]> {
  const objectIds: Array<{ type: string; id: string }> = [];
  for (const id of candidate.semanticFactIds ?? []) {
    objectIds.push({ type: "fact", id });
  }
  for (const id of candidate.semanticRelationshipIds ?? []) {
    objectIds.push({ type: "relationship", id });
  }
  for (const id of candidate.semanticEntityIds ?? []) {
    objectIds.push({ type: "entity", id });
  }
  if (objectIds.length === 0) return [];

  const spaceIds = new Set<string>();

  for (const obj of objectIds.slice(0, 8)) {
    const { data: links } = await supabase
      .from("semantic_evidence_links")
      .select("evidence_id")
      .eq("user_id", userId)
      .eq("semantic_object_type", obj.type)
      .eq("semantic_object_id", obj.id)
      .limit(10);

    const evidenceIds = (links ?? []).map((l) => l.evidence_id as string);
    if (evidenceIds.length === 0) continue;

    const { data: evidence } = await supabase
      .from("semantic_evidence")
      .select("space_id")
      .eq("user_id", userId)
      .in("id", evidenceIds);

    for (const row of evidence ?? []) {
      if (row.space_id) spaceIds.add(row.space_id as string);
    }
  }

  return [...spaceIds];
}

async function hasActiveDedupeAnywhere(
  supabase: SupabaseClient,
  userId: string,
  dedupeKey: string
): Promise<boolean> {
  const { data } = await supabase
    .from("guardian_items")
    .select("id")
    .eq("user_id", userId)
    .eq("dedupe_key", dedupeKey)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

/**
 * Collapse existing cross-Space semantic duplicates: keep oldest active item
 * per semantic dedupe_key, dismiss the rest. Also dismiss non-actionable
 * commitment false positives (e.g. school bus permissions).
 */
export async function collapseSemanticWatchDuplicates(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: rows } = await supabase
    .from("guardian_items")
    .select("id, dedupe_key, created_at, title, description")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("extraction_version", "semantic-v1")
    .like("dedupe_key", "semantic:%")
    .order("created_at", { ascending: true })
    .limit(500);

  if (!rows?.length) return 0;

  const seen = new Set<string>();
  const dismissIds: string[] = [];
  for (const row of rows) {
    const key = row.dedupe_key as string;
    const desc = String(row.description ?? "");
    const isCommitment =
      key.startsWith("semantic:commitment:") ||
      key.startsWith("semantic:assigned:");
    if (isCommitment && !isActionableCommitmentText(desc)) {
      dismissIds.push(row.id as string);
      continue;
    }
    if (seen.has(key)) {
      dismissIds.push(row.id as string);
    } else {
      seen.add(key);
    }
  }

  if (dismissIds.length === 0) return 0;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("guardian_items")
    .update({
      status: "dismissed",
      dismissed_at: now,
      updated_at: now,
    })
    .eq("user_id", userId)
    .in("id", dismissIds);

  if (error) {
    console.error("Failed to collapse semantic watch duplicates:", error.message);
    return 0;
  }
  return dismissIds.length;
}

async function persistCandidateOnce(
  supabase: SupabaseClient,
  userId: string,
  preferredSpaceId: string | undefined,
  candidate: SemanticWatchCandidate
): Promise<boolean> {
  if (await hasActiveDedupeAnywhere(supabase, userId, candidate.dedupeKey)) {
    return false;
  }

  const evidenceSpaces = await resolveEvidenceSpaceIds(
    supabase,
    userId,
    candidate
  );

  let spaceId: string | null = null;
  if (preferredSpaceId && evidenceSpaces.includes(preferredSpaceId)) {
    spaceId = preferredSpaceId;
  } else if (evidenceSpaces.length === 1) {
    spaceId = evidenceSpaces[0]!;
  } else if (evidenceSpaces.length > 1) {
    // Multiple evidence Spaces — still only one item; prefer preferred if any,
    // else first evidence Space.
    spaceId = preferredSpaceId && evidenceSpaces.includes(preferredSpaceId)
      ? preferredSpaceId
      : evidenceSpaces[0]!;
  } else if (preferredSpaceId) {
    // No evidence Space (e.g. lab without spaceId) — allow preferred once.
    spaceId = preferredSpaceId;
  } else {
    return false;
  }

  // If caller provided a preferred Space from a document job, only create when
  // that Space is the chosen target — prevents fan-out when rules re-run
  // for unrelated Spaces during backfill.
  if (preferredSpaceId && spaceId !== preferredSpaceId) {
    return false;
  }

  const metadata = {
    semantic_entity_ids: candidate.semanticEntityIds ?? [],
    semantic_relationship_ids: candidate.semanticRelationshipIds ?? [],
    semantic_fact_ids: candidate.semanticFactIds ?? [],
    semantic_rule: true,
  };

  const { error } = await supabase.from("guardian_items").insert({
    user_id: userId,
    space_id: spaceId,
    type: candidate.type,
    title: candidate.title.slice(0, 300),
    description: candidate.description,
    status: "active",
    priority: candidate.priority,
    requires_action: candidate.requiresAction,
    due_at: candidate.dueAt ?? null,
    event_date: candidate.eventDate ?? null,
    source_type: "manual",
    source_excerpt: candidate.sourceExcerpt?.slice(0, 800) ?? null,
    confidence: candidate.confidence,
    needs_review: candidate.confidence < 0.9,
    extraction_version: "semantic-v1",
    dedupe_key: candidate.dedupeKey,
    metadata,
  });

  if (error) {
    if (error.code === "23505") return false;
    console.error("Failed to persist semantic watch candidate:", error.message);
    return false;
  }
  return true;
}

/**
 * Evaluate semantic Watch rules and create at most one guardian_item per
 * semantic identity (global dedupe). Attaches to evidence Space when known.
 */
export async function evaluateSemanticWatchRules(
  supabase: SupabaseClient,
  userId: string,
  options: { spaceId?: string; now?: Date } = {}
): Promise<{ created: number; evaluated: number; duplicatesCollapsed: number }> {
  const duplicatesCollapsed = await collapseSemanticWatchDuplicates(
    supabase,
    userId
  );

  const loaded = await loadSemanticContext(supabase, userId);
  const ctx: SemanticWatchContext = {
    supabase,
    userId,
    preferredSpaceId: options.spaceId,
    now: options.now ?? new Date(),
    ...loaded,
  };

  let created = 0;
  let evaluated = 0;

  const sorted = [...SEMANTIC_WATCH_RULES].sort(
    (a, b) => a.priority - b.priority
  );

  for (const rule of sorted) {
    const candidates = await rule.evaluate(ctx);
    evaluated += candidates.length;
    for (const candidate of candidates) {
      const ok = await persistCandidateOnce(
        supabase,
        userId,
        options.spaceId,
        candidate
      );
      if (ok) {
        created += 1;
        logSemanticEvent("semantic_watch_rule_fired", {
          user_id: userId,
          rule_id: rule.id,
          space_id: options.spaceId ?? null,
          dedupe_key: candidate.dedupeKey,
        });
      }
    }
  }

  return { created, evaluated, duplicatesCollapsed };
}
