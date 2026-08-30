/**
 * Gideon Business Query Planner — classify business questions before retrieval.
 * Pure helpers (safe for unit tests). Plans are internal only.
 */

import type { BusinessQueryIntent, BusinessQueryPlan } from "./types";

const ENTITY_360 =
  /\b(everything we know about|tell me (everything )?about|show me (everything|all).{0,40}\babout|who is|what do we know about|entity.?360|full (picture|profile) (of|for))\b/i;

const RELATIONSHIP_QUERY =
  /\b(which clients? have|clients? .{0,60}(but|without|no) .{0,40}project|what relationships?|relationships? (do we|with)|connected to|linked to|who (do we|are we) (serve|work with)|proposals? but no)\b/i;

const PROPOSAL_ANALYSIS =
  /\b(what proposals?|proposals? (need|needing|require|for) follow[- ]?up|proposals? (are |that are )?(outstanding|open|stale|pending)|follow[- ]?up (on )?(proposals?|quotes?)|which proposals?)\b/i;

const PROJECT_ANALYSIS =
  /\b(what projects?|active projects?|projects? (for|with|associated)|project status)\b/i;

const COMMITMENT_ANALYSIS =
  /\b(what (did we |have we )?(promise|promised|commit|committed)|commitments?|obligations?|deliverables? (to|for) (each )?client|what are we responsible for)\b/i;

const EVIDENCE_REQUEST =
  /\b(where did you get|where (did|does) that (come|info)|what('s| is) (your |the )?source|which source supports|show (me )?(the )?evidence|cite (your |the )?sources?|how do you know|provenance)\b/i;

const KNOWLEDGE_GAP =
  /\b(what (information |info )?(is |are )?(missing|unavailable|not (currently )?available)|what (can'?t|cannot) .{0,24}answer|what document should i add|what('s| is) missing|what would .{0,40} tell us)\b/i;

const ADVISORY =
  /\b(what should i (focus|follow up|do|prioritize)|what needs (my )?attention|priorit(y|ies)|focus on next|what('s| is) (most )?important (next|now)|chief of staff)\b/i;

const BUSINESS_STATUS =
  /\b(business status|how is (the )?business|pipeline status|overview of (our )?clients)\b/i;

/** Stopwords / question scaffolding when extracting entity mentions. */
const ENTITY_STOP = new Set([
  "everything",
  "know",
  "about",
  "show",
  "me",
  "tell",
  "what",
  "which",
  "where",
  "when",
  "who",
  "how",
  "the",
  "our",
  "my",
  "a",
  "an",
  "we",
  "have",
  "has",
  "with",
  "from",
  "for",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "do",
  "does",
  "did",
  "are",
  "is",
  "was",
  "were",
  "clients",
  "client",
  "proposals",
  "proposal",
  "projects",
  "project",
  "contracts",
  "contract",
  "relationships",
  "relationship",
  "commitments",
  "commitment",
  "information",
  "focus",
  "next",
  "should",
  "follow",
  "up",
  "active",
  "each",
  "need",
  "needs",
  "attention",
  // Conversational / calendar noise (must not become Entity 360 mentions)
  "thanks",
  "thank",
  "please",
  "sorry",
  "hello",
  "hi",
  "hey",
  "yes",
  "yeah",
  "yep",
  "okay",
  "ok",
  "advice",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "today",
  "tomorrow",
  "tonight",
  "morning",
  "afternoon",
  "evening",
  "week",
  "weekend",
  "remind",
  "reminder",
  "ask",
  "asking",
  "will",
  "would",
  "could",
  "can",
  "just",
  "also",
  "still",
]);

/** Orgs we recognize even when typed lowercase (soft business cues). */
const KNOWN_ORG_TOKENS = ["onyx", "proxdose"] as const;

/** Reminder / action phrasing — never treat as Entity 360. */
const ACTION_OR_REMINDER =
  /\b(remind me|set a reminder|add a reminder|please remind|nudge me|alert me|draft (an? |the )?email|schedule (a |an )?(meeting|call|appointment)|save (this|that|it) (as |to )?(a )?daily log)\b/i;

function strategyFor(intent: BusinessQueryIntent): string {
  switch (intent) {
    case "ENTITY_360":
      return "ontology+structured+targeted_evidence";
    case "RELATIONSHIP_QUERY":
      return "ontology_first+optional_evidence";
    case "PROPOSAL_ANALYSIS":
      return "proposals_first+follow_up_scoring";
    case "PROJECT_ANALYSIS":
      return "ontology_projects+structured";
    case "COMMITMENT_ANALYSIS":
      return "commitments_by_client";
    case "EVIDENCE_REQUEST":
      return "prior_claims_only";
    case "KNOWLEDGE_GAP":
      return "gaps_from_entity_and_prior_claims";
    case "ADVISORY":
      return "business_state+priority_rank";
    case "BUSINESS_STATUS":
      return "structured_overview";
    case "GENERAL_KNOWLEDGE":
    default:
      return "hybrid_search";
  }
}

function flagsFor(intent: BusinessQueryIntent): Omit<
  BusinessQueryPlan,
  "intent" | "entities" | "strategy"
> {
  switch (intent) {
    case "ENTITY_360":
      return {
        requiresOntology: true,
        requiresStructuredData: true,
        // Ontology evidence + structured proposals are enough; broad search
        // floods the prompt with raw fact dumps (the failure mode V1.1 fixes).
        requiresSearch: false,
        requiresEvidence: true,
      };
    case "RELATIONSHIP_QUERY":
      return {
        requiresOntology: true,
        requiresStructuredData: true,
        requiresSearch: false,
        requiresEvidence: true,
      };
    case "PROPOSAL_ANALYSIS":
      return {
        requiresOntology: false,
        requiresStructuredData: true,
        requiresSearch: false,
        requiresEvidence: true,
      };
    case "PROJECT_ANALYSIS":
      return {
        requiresOntology: true,
        requiresStructuredData: true,
        requiresSearch: false,
        requiresEvidence: true,
      };
    case "COMMITMENT_ANALYSIS":
      return {
        requiresOntology: true,
        requiresStructuredData: true,
        requiresSearch: false,
        requiresEvidence: true,
      };
    case "EVIDENCE_REQUEST":
      return {
        requiresOntology: false,
        requiresStructuredData: false,
        requiresSearch: false,
        requiresEvidence: true,
      };
    case "KNOWLEDGE_GAP":
      return {
        requiresOntology: true,
        requiresStructuredData: true,
        requiresSearch: false,
        requiresEvidence: true,
      };
    case "ADVISORY":
      return {
        requiresOntology: true,
        requiresStructuredData: true,
        requiresSearch: false,
        requiresEvidence: true,
      };
    case "BUSINESS_STATUS":
      return {
        requiresOntology: true,
        requiresStructuredData: true,
        requiresSearch: false,
        requiresEvidence: false,
      };
    case "GENERAL_KNOWLEDGE":
    default:
      return {
        requiresOntology: true,
        requiresStructuredData: false,
        requiresSearch: true,
        requiresEvidence: true,
      };
  }
}

/**
 * Extract likely entity name mentions from a business question.
 * Conservative — prefers Proper-case / domain-like tokens.
 */
export function extractBusinessEntityMentions(question: string): string[] {
  const q = question.trim();
  const entities: string[] = [];

  const aboutMatch = q.match(
    /\b(?:about|with|for|regarding|re:)\s+([A-Z][A-Za-z0-9.&'-]*(?:\s+[A-Z][A-Za-z0-9.&'-]*){0,3})/
  );
  if (aboutMatch?.[1]) {
    entities.push(aboutMatch[1].replace(/[.,;:!?]+$/g, "").trim());
  }

  const domainMatch = q.match(/\b([a-z0-9][a-z0-9-]{1,40}\.(?:com|io|net|org|co))\b/i);
  if (domainMatch?.[1]) {
    entities.push(domainMatch[1]);
  }

  // Quoted names
  for (const m of q.matchAll(/["']([^"']{2,60})["']/g)) {
    if (m[1]) entities.push(m[1].trim());
  }

  // Known orgs even when lowercase ("ask onyx on Monday")
  for (const token of KNOWN_ORG_TOKENS) {
    if (new RegExp(`\\b${token}\\b`, "i").test(q)) {
      entities.push(token.charAt(0).toUpperCase() + token.slice(1));
    }
  }

  // Capitalized multi-word or single tokens that aren't stopwords
  for (const m of q.matchAll(/\b([A-Z][A-Za-z0-9.&'-]{1,40}(?:\s+[A-Z][A-Za-z0-9.&'-]{1,40}){0,3})\b/g)) {
    const name = m[1]?.replace(/[.,;:!?]+$/g, "").trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (ENTITY_STOP.has(lower)) continue;
    if (/^(what|which|where|when|who|how|show|tell|guardian)$/i.test(name)) {
      continue;
    }
    entities.push(name);
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  // Prefer known org tokens first so "Thanks … onyx" does not lead with Thanks.
  const ranked = [
    ...entities.filter((e) =>
      KNOWN_ORG_TOKENS.includes(
        e.toLowerCase() as (typeof KNOWN_ORG_TOKENS)[number]
      )
    ),
    ...entities.filter(
      (e) =>
        !KNOWN_ORG_TOKENS.includes(
          e.toLowerCase() as (typeof KNOWN_ORG_TOKENS)[number]
        )
    ),
  ];
  for (const e of ranked) {
    const key = e.toLowerCase();
    if (ENTITY_STOP.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(e);
    if (unique.length >= 5) break;
  }
  return unique;
}

export function detectBusinessQueryIntent(question: string): BusinessQueryIntent {
  const q = question.trim();
  if (!q) return "GENERAL_KNOWLEDGE";

  // "Please remind me on Monday" / thanks + remind — not Entity 360.
  if (ACTION_OR_REMINDER.test(q)) return "GENERAL_KNOWLEDGE";

  if (EVIDENCE_REQUEST.test(q)) return "EVIDENCE_REQUEST";
  if (KNOWLEDGE_GAP.test(q)) return "KNOWLEDGE_GAP";
  if (ADVISORY.test(q)) return "ADVISORY";
  if (COMMITMENT_ANALYSIS.test(q)) return "COMMITMENT_ANALYSIS";
  if (PROPOSAL_ANALYSIS.test(q)) return "PROPOSAL_ANALYSIS";
  if (RELATIONSHIP_QUERY.test(q)) return "RELATIONSHIP_QUERY";
  if (ENTITY_360.test(q)) return "ENTITY_360";
  if (PROJECT_ANALYSIS.test(q)) return "PROJECT_ANALYSIS";
  if (BUSINESS_STATUS.test(q)) return "BUSINESS_STATUS";

  // Soft business cues → still prefer structured path over raw dump
  if (
    /\b(client|clients|proposal|proposals|contract|contracts|onyx|proxdose)\b/i.test(
      q
    )
  ) {
    if (/\brelationship|connected|linked|serve|serves\b/i.test(q)) {
      return "RELATIONSHIP_QUERY";
    }
    if (extractBusinessEntityMentions(q).length) {
      return "ENTITY_360";
    }
  }

  return "GENERAL_KNOWLEDGE";
}

/** True when the question should use Business Pack BI retrieval. */
export function isBusinessIntelligenceQuestion(question: string): boolean {
  if (ACTION_OR_REMINDER.test(question)) return false;
  const intent = detectBusinessQueryIntent(question);
  if (intent !== "GENERAL_KNOWLEDGE") return true;
  return /\b(client|clients|proposal|proposals|contract|contracts|commitment|ontology|business)\b/i.test(
    question
  );
}

/**
 * Build an internal query plan for Gideon Business Intelligence.
 */
export function planBusinessQuery(question: string): BusinessQueryPlan {
  const intent = detectBusinessQueryIntent(question);
  const entities = extractBusinessEntityMentions(question);
  return {
    intent,
    entities,
    ...flagsFor(intent),
    strategy: strategyFor(intent),
  };
}
