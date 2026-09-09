/**
 * Pure timeline inference (no DB / no server-only).
 */

import type { SemanticExtractionResult } from "@/lib/semantic/types";
import type { WorldTimelineEntryType } from "./types";
import {
  scoreTimelineImportance,
  shouldEmitTimelineEntry,
} from "./importance";

export type TimelineCandidate = {
  entryType: WorldTimelineEntryType;
  title: string;
  summary?: string;
  occurredAt?: string;
  confidence?: number;
  primaryEntityId?: string | null;
  relatedEntityIds?: string[];
  dedupeKey: string;
  metadata?: Record<string, unknown>;
};

function truncateTitle(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  return t.length <= 300 ? t : `${t.slice(0, 297)}...`;
}

/**
 * Infer sparse timeline candidates from extraction (no LLM).
 * Avoids one entry per tiny document change.
 */
export function inferTimelineEntriesFromExtraction(args: {
  extraction: SemanticExtractionResult;
  sourceId: string;
  sourceTitle?: string;
  tempToEntityId: Map<string, string>;
}): TimelineCandidate[] {
  const out: TimelineCandidate[] = [];
  const { extraction, sourceId, tempToEntityId } = args;

  for (const fact of extraction.facts) {
    const pred = fact.predicate.toLowerCase();
    const text = `${fact.valueText ?? ""} ${fact.evidence ?? ""}`.toLowerCase();
    let entryType: WorldTimelineEntryType | null = null;

    if (
      /security|breach|incident|compromis/.test(text) ||
      pred === "security_incident"
    ) {
      entryType = "security_incident";
    } else if (/signed|executed/.test(text) && /contract|agreement/.test(text)) {
      entryType = "contract_signed";
    } else if (/proposal|bid|rfp/.test(text) && /sent|submitted/.test(text)) {
      entryType = "proposal_sent";
    } else if (/invoice|payment due/.test(text)) {
      entryType = "invoice_received";
    } else if (pred === "deadline_date" || pred.includes("deadline")) {
      entryType = "deadline_created";
    } else if (/school|teacher|principal|pta/.test(text)) {
      entryType = "school_communication";
    } else if (
      pred === "open_commitment" ||
      pred === "action_promised" ||
      pred === "action_assigned"
    ) {
      entryType = "commitment_created";
    }

    if (!entryType) continue;

    const primary =
      fact.subject && tempToEntityId.has(fact.subject)
        ? tempToEntityId.get(fact.subject)!
        : null;

    out.push({
      entryType,
      title: truncateTitle(
        fact.valueText ?? fact.evidence ?? `${entryType.replace(/_/g, " ")}`
      ),
      summary: fact.evidence ?? fact.valueText,
      occurredAt: fact.valueDate,
      confidence: fact.confidence,
      primaryEntityId: primary,
      relatedEntityIds: primary ? [primary] : [],
      dedupeKey: `fact:${sourceId}:${pred}:${fact.valueText ?? fact.valueDate ?? ""}`.slice(
        0,
        200
      ),
    });
  }

  for (const entity of extraction.entities) {
    if (entity.type === "event" && entity.confidence >= 0.8) {
      const id = tempToEntityId.get(entity.temporaryId);
      out.push({
        entryType: "meeting_occurred",
        title: truncateTitle(entity.name),
        summary: entity.description,
        confidence: entity.confidence,
        primaryEntityId: id ?? null,
        relatedEntityIds: id ? [id] : [],
        dedupeKey: `event:${sourceId}:${entity.name}`.slice(0, 200),
      });
    }
    if (entity.type === "contract" && entity.confidence >= 0.85) {
      const id = tempToEntityId.get(entity.temporaryId);
      out.push({
        entryType: "contract_signed",
        title: truncateTitle(entity.name),
        summary: entity.description,
        confidence: entity.confidence,
        primaryEntityId: id ?? null,
        relatedEntityIds: id ? [id] : [],
        dedupeKey: `contract:${sourceId}:${entity.name}`.slice(0, 200),
      });
    }
  }

  for (const rel of extraction.relationships) {
    if (
      ["works_at", "client_of", "partner_of", "awarded_to"].includes(rel.type) &&
      rel.confidence >= 0.85
    ) {
      const source = tempToEntityId.get(rel.source);
      const target = tempToEntityId.get(rel.target);
      out.push({
        entryType: "relationship_change",
        title: truncateTitle(
          `${rel.type.replace(/_/g, " ")}: ${rel.source} → ${rel.target}`
        ),
        summary: rel.evidence,
        confidence: rel.confidence,
        primaryEntityId: source ?? target ?? null,
        relatedEntityIds: [source, target].filter(Boolean) as string[],
        dedupeKey: `rel:${sourceId}:${rel.type}:${rel.source}:${rel.target}`.slice(
          0,
          200
        ),
      });
    }
  }

  return out;
}

/** Filter candidates that pass the importance gate (idempotent key set for dedupe tests). */
export function filterTimelineCandidatesForEmit(
  candidates: TimelineCandidate[]
): TimelineCandidate[] {
  return candidates.filter((c) => {
    const importance = scoreTimelineImportance(c.entryType, c.confidence);
    return shouldEmitTimelineEntry(importance, c.entryType);
  });
}
