import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  semanticDeadlineHorizonDays,
  semanticFollowUpQuietDays,
} from "@/lib/features/semantic-layer";
import { logSemanticEvent } from "./log";
import type { SemanticEntity, SemanticFact, SemanticRelationship } from "./types";
import {
  SEMANTIC_ENTITY_SELECT,
  SEMANTIC_FACT_SELECT,
  SEMANTIC_RELATIONSHIP_SELECT,
} from "./types";

export type SemanticWatchRuleCategory =
  | "opportunity"
  | "deadline"
  | "follow_up"
  | "commitment";

export type SemanticWatchContext = {
  supabase: SupabaseClient;
  userId: string;
  spaceId?: string;
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
  // Heuristic: organizations the user "owns" are those appearing as source of
  // supported/works_with/partner relationships most often — Phase 1: all orgs.
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
      // Try parsing date from canonical name (e.g. "September 15")
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

    // Also check opportunity/task facts with deadline_date
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
      ["met_with", "introduced_to", "contact_for", "works_with"].includes(
        r.relationship_type
      )
    );

    for (const rel of contactRels) {
      if ((rel.confidence ?? 0) < 0.9) continue;
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

/** Open commitment from clear evidence. */
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
      if ((fact.confidence ?? 0) < 0.85) continue;
      if (!fact.value_text) continue;

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
        confidence: fact.confidence ?? 0.85,
        sourceExcerpt: fact.value_text.slice(0, 200),
      });
    }

    const assigned = ctx.relationships.filter(
      (r) => r.relationship_type === "assigned_to" && (r.confidence ?? 0) >= 0.9
    );
    for (const rel of assigned) {
      const task = entityById(ctx.entities, rel.source_entity_id);
      const assignee = entityById(ctx.entities, rel.target_entity_id);
      if (!task || task.entity_type !== "task") continue;

      candidates.push({
        type: "commitment",
        title: "You have an open commitment",
        description: `${task.canonical_name}${assignee ? ` assigned to ${assignee.canonical_name}` : ""}.`,
        priority: "high",
        requiresAction: true,
        dedupeKey: `semantic:assigned:${rel.id}`,
        semanticEntityIds: [task.id, ...(assignee ? [assignee.id] : [])],
        semanticRelationshipIds: [rel.id],
        confidence: rel.confidence ?? 0.9,
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
): Promise<Omit<SemanticWatchContext, "supabase" | "userId" | "spaceId" | "now">> {
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

async function persistCandidate(
  supabase: SupabaseClient,
  userId: string,
  spaceId: string,
  candidate: SemanticWatchCandidate
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("guardian_items")
    .select("id")
    .eq("space_id", spaceId)
    .eq("dedupe_key", candidate.dedupeKey)
    .eq("status", "active")
    .maybeSingle();

  if (existing?.id) return false;

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
 * Evaluate semantic Watch rules and create guardian_items when warranted.
 * Avoids duplicates via dedupe_key. Non-destructive to existing Watch logic.
 */
export async function evaluateSemanticWatchRules(
  supabase: SupabaseClient,
  userId: string,
  options: { spaceId?: string; now?: Date } = {}
): Promise<{ created: number; evaluated: number }> {
  const spaceId = options.spaceId;
  if (!spaceId) {
    return { created: 0, evaluated: 0 };
  }

  const loaded = await loadSemanticContext(supabase, userId);
  const ctx: SemanticWatchContext = {
    supabase,
    userId,
    spaceId,
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
      const ok = await persistCandidate(supabase, userId, spaceId, candidate);
      if (ok) {
        created += 1;
        logSemanticEvent("semantic_watch_rule_fired", {
          user_id: userId,
          rule_id: rule.id,
          space_id: spaceId,
          dedupe_key: candidate.dedupeKey,
        });
      }
    }
  }

  return { created, evaluated };
}
