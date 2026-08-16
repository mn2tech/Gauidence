/**
 * Business knowledge filter — keep system/process metadata out of client facts.
 * Combines deterministic safeguards with lightweight semantic heuristics.
 * Not a phrase blacklist alone: category scoring + structural signals.
 */

import {
  BUSINESS_FACING_CATEGORIES,
  type KnowledgeCategory,
} from "./types";

export type KnowledgeClassification = {
  category: KnowledgeCategory;
  confidence: number;
  reasons: string[];
};

type Signal = {
  category: KnowledgeCategory;
  weight: number;
  reason: string;
  pattern?: RegExp;
  test?: (text: string) => boolean;
};

const SYSTEM_PROCESS_SIGNALS: Signal[] = [
  {
    category: "PROCESS_METADATA",
    weight: 0.95,
    reason: "queued_documents",
    pattern:
      /\b(review|process|monitor).{0,40}\b\d+\s+queued\s+documents?\b|\bqueued\s+documents?\b/i,
  },
  {
    category: "PROCESS_METADATA",
    weight: 0.95,
    reason: "async_extraction",
    pattern:
      /\b(wait for|monitor|asynchronous|async).{0,40}\b(ontology\s+)?extraction\b|\basynchronous\s+processing\b|\bontology\s+extraction\b/i,
  },
  {
    category: "PROCESS_METADATA",
    weight: 0.9,
    reason: "processing_job",
    pattern:
      /\b(analysis job started|processing document|retry extraction|job (started|queued|failed)|ocr (pending|running))\b/i,
  },
  {
    category: "SYSTEM_METADATA",
    weight: 0.9,
    reason: "configure_settings",
    pattern:
      /\b(configure additional settings|guardian (admin|settings)|feature flag|pack engine)\b/i,
  },
  {
    category: "SYSTEM_METADATA",
    weight: 0.9,
    reason: "legal_disclaimer_template",
    pattern:
      /\b(consider reviewing this clause with a qualified professional|materially affects your rights or obligations)\b/i,
  },
  {
    category: "SYSTEM_METADATA",
    weight: 0.85,
    reason: "verify_internal_count",
    pattern: /\bverify the (four|\d+) proposals?\b/i,
  },
  {
    category: "PROCESS_METADATA",
    weight: 0.85,
    reason: "needs_verification_deadline_boilerplate",
    pattern: /\bneeds verification\b/i,
  },
  {
    category: "PROCESS_METADATA",
    weight: 0.8,
    reason: "internal_workflow_verb",
    pattern:
      /\b(backfill ontology|re[- ]?index|embedding(s)? (pending|failed)|chunk(s)? (indexed|missing))\b/i,
  },
  {
    category: "LOW_VALUE",
    weight: 0.7,
    reason: "generic_infra_label",
    pattern:
      /\b(database|postgres|aurora|downloads|desktop|supporting databases)\b/i,
  },
];

const BUSINESS_SIGNALS: Signal[] = [
  {
    category: "BUSINESS_RISK",
    weight: 0.75,
    reason: "security_risk",
    pattern:
      /\b(security (finding|findings|assessment|risk)|unsupported php|remediation|vulnerability|cve)\b/i,
  },
  {
    category: "BUSINESS_COMMITMENT",
    weight: 0.7,
    reason: "deliverable_language",
    pattern:
      /\b(deliver|provide|complete|perform|schedule).{0,40}\b(assessment|documentation|remediation|redesign|follow[- ]?up)\b/i,
  },
  {
    category: "BUSINESS_OPPORTUNITY",
    weight: 0.65,
    reason: "commercial",
    pattern:
      /\b(\$\s*[\d,]+|proposal|quote|estimate|engagement|sprint|contract|sow)\b/i,
  },
  {
    category: "BUSINESS_RELATIONSHIP",
    weight: 0.6,
    reason: "relationship",
    pattern:
      /\b(client|prospect|serves|works with|contact for|vendor|partner)\b/i,
  },
  {
    category: "BUSINESS_EVENT",
    weight: 0.55,
    reason: "dated_event",
    pattern:
      /\b(assessed|assessment dated|on (january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/-]\d{1,2}))\b/i,
  },
  {
    category: "BUSINESS_FACT",
    weight: 0.5,
    reason: "org_identity",
    pattern:
      /\b([a-z0-9-]+\.(com|io|org|net)|llc|inc\.?|ltd\.?|owner and management)\b/i,
  },
];

function scoreSignals(text: string, signals: Signal[]): {
  best: KnowledgeCategory | null;
  score: number;
  reasons: string[];
} {
  let best: KnowledgeCategory | null = null;
  let score = 0;
  const reasons: string[] = [];
  for (const signal of signals) {
    const hit = signal.pattern
      ? signal.pattern.test(text)
      : signal.test?.(text) ?? false;
    if (!hit) continue;
    reasons.push(signal.reason);
    if (signal.weight > score) {
      score = signal.weight;
      best = signal.category;
    }
  }
  return { best, score, reasons };
}

/**
 * Classify a candidate knowledge string (entity name, description, evidence, etc.).
 */
export function classifyBusinessKnowledge(
  text: string,
  hints?: { entityType?: string; relationshipType?: string }
): KnowledgeClassification {
  const trimmed = (text ?? "").trim();
  if (!trimmed) {
    return { category: "LOW_VALUE", confidence: 0.9, reasons: ["empty"] };
  }

  const system = scoreSignals(trimmed, SYSTEM_PROCESS_SIGNALS);
  if (system.best && system.score >= 0.75) {
    return {
      category: system.best,
      confidence: system.score,
      reasons: system.reasons,
    };
  }

  if (hints?.relationshipType) {
    return {
      category: "BUSINESS_RELATIONSHIP",
      confidence: 0.7,
      reasons: ["relationship_type"],
    };
  }

  const business = scoreSignals(trimmed, BUSINESS_SIGNALS);
  if (business.best && business.score >= 0.5) {
    // System signal still present but weaker — prefer business if stronger.
    if (system.best && system.score > business.score) {
      return {
        category: system.best,
        confidence: system.score,
        reasons: system.reasons,
      };
    }
    return {
      category: business.best,
      confidence: business.score,
      reasons: business.reasons,
    };
  }

  if (system.best) {
    return {
      category: system.best,
      confidence: system.score,
      reasons: system.reasons,
    };
  }

  const type = (hints?.entityType ?? "").toLowerCase();
  if (
    ["client", "organization", "person", "contact", "proposal", "project", "contract", "task"].includes(
      type
    )
  ) {
    return {
      category: "BUSINESS_FACT",
      confidence: 0.45,
      reasons: ["entity_type_default"],
    };
  }

  return {
    category: "LOW_VALUE",
    confidence: 0.4,
    reasons: ["unclassified"],
  };
}

export function isBusinessFacingKnowledge(
  classification: KnowledgeClassification
): boolean {
  return BUSINESS_FACING_CATEGORIES.has(classification.category);
}

/** Filter strings that should not appear as client/org business facts. */
export function filterBusinessFacingTexts(
  items: string[]
): { kept: string[]; filteredCount: number } {
  const kept: string[] = [];
  let filteredCount = 0;
  for (const item of items) {
    const classification = classifyBusinessKnowledge(item);
    if (isBusinessFacingKnowledge(classification)) {
      kept.push(item);
    } else {
      filteredCount += 1;
    }
  }
  return { kept, filteredCount };
}

/**
 * True when an extracted ontology entity should not become normal business knowledge.
 * Used at persist time and when formatting Entity 360.
 */
export function shouldExcludeFromBusinessOntology(args: {
  name: string;
  description?: string | null;
  entityType?: string;
}): boolean {
  const blob = `${args.name}\n${args.description ?? ""}`;
  const classification = classifyBusinessKnowledge(blob, {
    entityType: args.entityType,
  });
  return (
    classification.category === "SYSTEM_METADATA" ||
    classification.category === "PROCESS_METADATA"
  );
}
