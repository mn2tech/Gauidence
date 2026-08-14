import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OntologyContext } from "./types";
import type { VaultChatCitation } from "@/lib/vault/vaultChatStream";
import {
  connectorCitationDocumentId,
  isConnectorCitationDocumentId,
} from "./connectorCitationIds";

export { connectorCitationDocumentId, isConnectorCitationDocumentId };

/**
 * Resolve openable connected-source files from ontology matches
 * (Device Storage / Trello analyzed into ontology).
 */
export async function resolveConnectorSourceCitations(
  supabase: SupabaseClient,
  ontology: OntologyContext,
  userId: string
): Promise<VaultChatCitation[]> {
  const itemIds = new Set<string>();

  for (const entity of ontology.matchedEntities) {
    if (entity.source_type === "connector" && entity.source_id) {
      itemIds.add(entity.source_id);
    }
  }
  for (const ev of ontology.evidence) {
    if (ev.source_type === "connector" && ev.source_id) {
      itemIds.add(ev.source_id);
    }
  }

  if (!itemIds.size) return [];

  const ids = [...itemIds].slice(0, 8);
  const { data: items } = await supabase
    .from("source_items")
    .select("id, source_id, name, mime_type, processing_status")
    .in("id", ids);

  if (!items?.length) return [];

  const sourceIds = [
    ...new Set(items.map((i) => i.source_id as string).filter(Boolean)),
  ];
  const { data: sources } = await supabase
    .from("connected_sources")
    .select("id, source_type, user_id, status")
    .eq("user_id", userId)
    .in("id", sourceIds);

  const sourceById = new Map(
    (sources ?? []).map((s) => [s.id as string, s] as const)
  );

  const citations: VaultChatCitation[] = [];
  for (const item of items) {
    const source = sourceById.get(item.source_id as string);
    if (!source || source.status === "disconnected") continue;
    const fileName = String(item.name ?? "Connected file");
    const mimeType =
      typeof item.mime_type === "string" ? item.mime_type : null;
    citations.push({
      documentId: connectorCitationDocumentId(item.id as string),
      fileName,
      kind: "connector",
      sourceId: item.source_id as string,
      itemId: item.id as string,
      sourceType: String(source.source_type ?? ""),
      mimeType,
      isImage: Boolean(mimeType?.startsWith("image/")),
    });
  }

  return citations;
}
