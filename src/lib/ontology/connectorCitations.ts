import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OntologyContext } from "./types";
import type { VaultChatCitation } from "@/lib/vault/vaultChatStream";
import {
  connectorCitationDocumentId,
  isConnectorCitationDocumentId,
  isLikelyChordChartFile,
} from "./connectorCitationIds";
import { entityMatchesSongTitle } from "./pipeline/chartTranscript";

export { connectorCitationDocumentId, isConnectorCitationDocumentId };

type SourceItemRow = {
  id: string;
  source_id: string;
  name: string | null;
  mime_type: string | null;
  processing_status?: string | null;
  metadata: unknown;
};

function citationFromItem(
  item: SourceItemRow,
  source: { id: string; source_type: string | null; status: string | null }
): VaultChatCitation {
  const fileName = String(item.name ?? "Connected file");
  const mimeType =
    typeof item.mime_type === "string" ? item.mime_type : null;
  const meta =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {};
  const cardName =
    typeof meta.cardName === "string" && meta.cardName.trim()
      ? meta.cardName.trim()
      : null;
  return {
    documentId: connectorCitationDocumentId(item.id as string),
    fileName,
    kind: "connector",
    sourceId: item.source_id as string,
    itemId: item.id as string,
    sourceType: String(source.source_type ?? ""),
    mimeType,
    isImage: Boolean(mimeType?.startsWith("image/")),
    cardName,
  };
}

function itemMatchesSongLabels(
  item: SourceItemRow,
  songLabels: string[]
): boolean {
  if (!songLabels.length) return false;
  const meta =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {};
  const cardName =
    typeof meta.cardName === "string" && meta.cardName.trim()
      ? meta.cardName.trim()
      : "";
  const fileName = String(item.name ?? "");
  const labels = [cardName, fileName].filter(Boolean);
  return songLabels.some((song) =>
    labels.some(
      (label) =>
        entityMatchesSongTitle(label, song) ||
        entityMatchesSongTitle(song, label)
    )
  );
}

/**
 * Resolve openable connected-source files from ontology matches
 * (Device Storage / Trello analyzed into ontology).
 *
 * Song entities often come from the board dump (source_id = board item), while
 * the openable chart is a sibling JPG/PNG/PDF attachment with metadata.cardName.
 * Always try to include those chart attachments when a song is matched.
 */
export async function resolveConnectorSourceCitations(
  supabase: SupabaseClient,
  ontology: OntologyContext,
  userId: string
): Promise<VaultChatCitation[]> {
  const itemIds = new Set<string>();
  const songLabels: string[] = [];
  const seenLabel = new Set<string>();

  for (const entity of ontology.matchedEntities) {
    if (entity.source_type === "connector" && entity.source_id) {
      itemIds.add(entity.source_id);
    }
    for (const label of [entity.name, entity.canonical_name]) {
      const t = typeof label === "string" ? label.trim() : "";
      if (t.length < 2) continue;
      const key = t.toLowerCase();
      if (seenLabel.has(key)) continue;
      seenLabel.add(key);
      songLabels.push(t);
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
    .select("id, source_id, name, mime_type, processing_status, metadata")
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

  const byItemId = new Map<string, SourceItemRow>();
  for (const item of items as SourceItemRow[]) {
    byItemId.set(item.id, item);
  }

  // Prefer openable chart attachments for matched songs (not only the board .txt).
  if (sourceIds.length && songLabels.length) {
    const { data: siblings } = await supabase
      .from("source_items")
      .select("id, source_id, name, mime_type, processing_status, metadata")
      .in("source_id", sourceIds)
      .eq("processing_status", "analyzed")
      .order("updated_at", { ascending: false })
      .limit(100);
    for (const item of (siblings ?? []) as SourceItemRow[]) {
      if (byItemId.has(item.id)) continue;
      const mimeType =
        typeof item.mime_type === "string" ? item.mime_type : null;
      const fileName = String(item.name ?? "");
      const meta =
        item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>)
          : {};
      const kind = String(meta.kind ?? "");
      const isChart =
        kind === "attachment" ||
        isLikelyChordChartFile(fileName, mimeType) ||
        Boolean(mimeType?.startsWith("image/"));
      if (!isChart) continue;
      if (!itemMatchesSongLabels(item, songLabels)) continue;
      byItemId.set(item.id, item);
      if (byItemId.size >= 16) break;
    }
  }

  const citations: VaultChatCitation[] = [];
  for (const item of byItemId.values()) {
    const source = sourceById.get(item.source_id as string);
    if (!source || source.status === "disconnected") continue;
    citations.push(citationFromItem(item, source));
  }

  return citations;
}
