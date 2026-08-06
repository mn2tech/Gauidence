import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEntityName } from "./normalize";
import type { KnowledgeFactCandidate } from "./types";

const FACT_LIMIT = 12;

export type KnowledgeRetrievalResult = {
  facts: KnowledgeFactCandidate[];
  entities: { id: string; name: string; entityType: string }[];
  relationships: {
    subject: string;
    relationship: string;
    object: string;
    confidence: number;
  }[];
};

function detectEntityTokens(question: string): string[] {
  const tokens = question
    .replace(/[^\w\s@.-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  return [...new Set(tokens)];
}

function scoreFactMatch(
  fact: {
    subject_name: string;
    predicate: string;
    object_value: string | null;
    confidence: number;
    effective_date: string | null;
    expiration_date: string | null;
  },
  question: string,
  tokens: string[]
): number {
  const q = question.toLowerCase();
  const subject = fact.subject_name.toLowerCase();
  let entityMatch = 0;
  if (q.includes(subject)) entityMatch = 1;
  else if (tokens.some((t) => subject.includes(t.toLowerCase()))) entityMatch = 0.7;

  let predicateRelevance = 0.3;
  const predicates = [
    { pattern: /\b(pay|rate|salary|hour|compensation)\b/i, pred: "has_rate" },
    { pattern: /\b(expir|renew|due date)\b/i, pred: "expires_on" },
    { pattern: /\b(contract|agreement)\b/i, pred: "works_on" },
    { pattern: /\b(registration|plate|vehicle|car)\b/i, pred: "has_registration" },
    { pattern: /\b(insurance|policy)\b/i, pred: "has_policy" },
  ];
  for (const p of predicates) {
    if (p.pattern.test(question) && fact.predicate.includes(p.pred)) {
      predicateRelevance = 1;
      break;
    }
  }

  const freshness =
    fact.effective_date || fact.expiration_date ? 0.9 : 0.7;

  return (
    entityMatch * predicateRelevance * fact.confidence * freshness
  );
}

export async function retrieveStructuredKnowledge(
  supabase: SupabaseClient,
  args: {
    question: string;
    profileIds: string[];
  }
): Promise<KnowledgeRetrievalResult> {
  if (args.profileIds.length === 0) {
    return { facts: [], entities: [], relationships: [] };
  }

  const tokens = detectEntityTokens(args.question);
  const qNorm = normalizeEntityName(args.question);

  let entityQuery = supabase
    .from("guardian_knowledge_entities")
    .select("id, name, entity_type, normalized_name")
    .in("profile_id", args.profileIds)
    .in("review_status", ["confirmed", "suggested"])
    .limit(20);

  if (tokens.length > 0) {
    const orFilter = tokens
      .map((t) => `name.ilike.%${t.replace(/,/g, "")}%`)
      .join(",");
    entityQuery = entityQuery.or(orFilter);
  }

  const { data: entities } = await entityQuery;

  const entityNames = new Set((entities ?? []).map((e) => e.normalized_name));

  const { data: factRows } = await supabase
    .from("guardian_knowledge_facts")
    .select(
      "id, subject_name, predicate, object_value, unit, effective_date, expiration_date, confidence, review_status, source_document_id, source_chunk_id, source_excerpt, profile_id"
    )
    .in("profile_id", args.profileIds)
    .in("review_status", ["confirmed", "suggested"])
    .order("effective_date", { ascending: false, nullsFirst: false })
    .limit(40);

  const docIds = [
    ...new Set(
      (factRows ?? [])
        .map((f) => f.source_document_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const fileNames = new Map<string, string>();
  if (docIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_name")
      .in("id", docIds);
    for (const d of docs ?? []) {
      fileNames.set(d.id, d.file_name);
    }
  }

  const scoredFacts = (factRows ?? [])
    .map((row) => {
      const knowledgeScore = scoreFactMatch(row, args.question, tokens);
      const subjectNorm = normalizeEntityName(row.subject_name);
      if (entityNames.size > 0 && !entityNames.has(subjectNorm)) {
        const tokenHit = tokens.some((t) =>
          subjectNorm.includes(normalizeEntityName(t))
        );
        if (!tokenHit && !args.question.toLowerCase().includes(row.subject_name.toLowerCase())) {
          return null;
        }
      }
      return {
        id: row.id,
        subjectName: row.subject_name,
        predicate: row.predicate,
        objectValue: row.object_value,
        unit: row.unit,
        effectiveDate: row.effective_date,
        expirationDate: row.expiration_date,
        confidence: row.confidence ?? 0.5,
        reviewStatus: row.review_status as KnowledgeFactCandidate["reviewStatus"],
        sourceDocumentId: row.source_document_id,
        sourceChunkId: row.source_chunk_id,
        sourceExcerpt: row.source_excerpt,
        sourceFileName: row.source_document_id
          ? fileNames.get(row.source_document_id) ?? null
          : null,
        profileId: row.profile_id,
        knowledgeScore,
      };
    })
    .filter((f): f is KnowledgeFactCandidate => f !== null && f.knowledgeScore > 0.1)
    .sort((a, b) => b.knowledgeScore - a.knowledgeScore)
    .slice(0, FACT_LIMIT);

  const subjectNames = new Set(scoredFacts.map((f) => f.subjectName.toLowerCase()));
  const { data: relRows } = await supabase
    .from("guardian_knowledge_relationships")
    .select("subject, relationship, object, confidence")
    .in("profile_id", args.profileIds)
    .limit(20);

  const relationships = (relRows ?? []).filter((r) =>
    subjectNames.has(r.subject.toLowerCase()) ||
    tokens.some((t) => r.subject.toLowerCase().includes(t.toLowerCase()))
  );

  return {
    facts: scoredFacts,
    entities: (entities ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      entityType: e.entity_type,
    })),
    relationships,
  };
}
