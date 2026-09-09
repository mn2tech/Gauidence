/**
 * Resolve My World entity ids for Guardian Today cards (Ask Gideon → extract topic).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const TYPE_RANK: Record<string, number> = {
  topic: 100,
  person: 90,
  organization: 80,
  school: 80,
  agency: 75,
  client: 75,
  project: 70,
  event: 60,
  deadline: 55,
  document: 40,
};

export function readSemanticEntityIdsFromMetadata(
  metadata: unknown
): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as Record<string, unknown>).semantic_entity_ids;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export function pickPreferredWorldEntityId(
  entities: Array<{ id: string; entity_type: string; canonical_name: string }>,
  titleHint?: string | null
): string | null {
  if (entities.length === 0) return null;
  const hint = (titleHint ?? "").toLowerCase().trim();
  const scored = entities.map((e) => {
    let score = TYPE_RANK[e.entity_type] ?? 20;
    const name = e.canonical_name.toLowerCase();
    if (hint && (name.includes(hint) || hint.includes(name))) score += 50;
    return { id: e.id, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? null;
}

/**
 * Map guardian item id → preferred World entity id.
 * Prefers metadata.semantic_entity_ids; otherwise entities evidenced by the source document.
 */
export async function loadWorldEntityIdsForItems(
  supabase: SupabaseClient,
  userId: string,
  items: Array<{
    id: string;
    title: string;
    metadata: unknown;
    source_document_id: string | null;
  }>
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const needDocLookup: typeof items = [];

  for (const item of items) {
    const fromMeta = readSemanticEntityIdsFromMetadata(item.metadata);
    if (fromMeta[0]) {
      out[item.id] = fromMeta[0]!;
      continue;
    }
    if (item.source_document_id) needDocLookup.push(item);
  }

  if (needDocLookup.length === 0) return out;

  const docIds = [
    ...new Set(
      needDocLookup
        .map((i) => i.source_document_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const { data: evidence } = await supabase
    .from("semantic_evidence")
    .select("id, source_id")
    .eq("user_id", userId)
    .eq("source_type", "document")
    .in("source_id", docIds)
    .limit(200);

  if (!evidence?.length) return out;

  const evidenceIds = evidence.map((e) => e.id as string);
  const docByEvidence = new Map(
    evidence.map((e) => [e.id as string, e.source_id as string])
  );

  const { data: links } = await supabase
    .from("semantic_evidence_links")
    .select("evidence_id, semantic_object_id")
    .eq("user_id", userId)
    .eq("object_type", "entity")
    .in("evidence_id", evidenceIds)
    .limit(400);

  if (!links?.length) return out;

  const entityIds = [
    ...new Set(links.map((l) => l.semantic_object_id as string)),
  ];
  const { data: entities } = await supabase
    .from("semantic_entities")
    .select("id, entity_type, canonical_name")
    .eq("user_id", userId)
    .in("id", entityIds)
    .limit(200);

  if (!entities?.length) return out;

  const entityById = new Map(
    entities.map((e) => [
      e.id as string,
      {
        id: e.id as string,
        entity_type: String(e.entity_type ?? "thing"),
        canonical_name: String(e.canonical_name ?? ""),
      },
    ])
  );

  const entitiesByDoc = new Map<
    string,
    Array<{ id: string; entity_type: string; canonical_name: string }>
  >();
  for (const link of links) {
    const docId = docByEvidence.get(link.evidence_id as string);
    const entity = entityById.get(link.semantic_object_id as string);
    if (!docId || !entity) continue;
    const list = entitiesByDoc.get(docId) ?? [];
    if (!list.some((x) => x.id === entity.id)) list.push(entity);
    entitiesByDoc.set(docId, list);
  }

  for (const item of needDocLookup) {
    const docId = item.source_document_id;
    if (!docId) continue;
    const preferred = pickPreferredWorldEntityId(
      entitiesByDoc.get(docId) ?? [],
      item.title
    );
    if (preferred) out[item.id] = preferred;
  }

  return out;
}
