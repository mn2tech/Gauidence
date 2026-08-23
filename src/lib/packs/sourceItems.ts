import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAnalyzeSupportedMime } from "@/lib/connectors/content/types";
import { connectorAnalysisVersion } from "@/lib/ontology/pipeline/analysisVersion";
import type { AnalyzeKnowledgeSelection } from "./types";

/** Keep Pack↔Connections analyze responsive (OCR-heavy). */
export const PACK_SOURCE_ITEM_BATCH_SIZE = 12;

export type PackSourceItemRef = {
  id: string;
  name: string;
  sourceId: string;
  sourceType: string;
  /** True when content can be fetched server-side (Trello). */
  remote: boolean;
  processingStatus: string;
  mimeType: string | null;
  sourceUri: string;
  externalId: string;
  metadata: Record<string, unknown>;
  analysisVersion: string | null;
  analysisError: string | null;
};

function itemNeedsAnalyze(item: {
  processingStatus: string;
  analysisVersion: string | null;
  mimeType: string | null;
  name: string;
}): boolean {
  if (item.processingStatus === "unavailable") return false;
  if (!isAnalyzeSupportedMime(item.mimeType, item.name)) return false;
  const version = connectorAnalysisVersion();
  if (
    item.processingStatus === "discovered" ||
    item.processingStatus === "analysis_failed" ||
    item.processingStatus === "analyzing"
  ) {
    return true;
  }
  if (
    item.processingStatus === "analyzed" &&
    item.analysisVersion !== version
  ) {
    return true;
  }
  return false;
}

/**
 * Discover connected source items for Pack Analyze that still need ontology.
 * Prefer Trello (remote) items; device-storage items are listed but analyzed
 * only from the browser when the user can grant folder access.
 */
export async function discoverPackSourceItems(
  supabase: SupabaseClient,
  args: {
    userId: string;
    profileId: string;
    spaceIds: string[];
    selection: AnalyzeKnowledgeSelection;
  }
): Promise<{
  needing: PackSourceItemRef[];
  totalInScope: number;
  remoteNeeding: number;
  deviceNeeding: number;
}> {
  const { selection } = args;
  const include =
    selection.includeAllSourceItems === true ||
    (selection.sourceItemIds?.length ?? 0) > 0 ||
    // When analyzing all docs, also pull connections bound to those Spaces.
    selection.includeAllDocuments === true;

  if (!include && !selection.sourceItemIds?.length) {
    return { needing: [], totalInScope: 0, remoteNeeding: 0, deviceNeeding: 0 };
  }

  let sourceQuery = supabase
    .from("connected_sources")
    .select("id, source_type, profile_id, status")
    .eq("status", "connected")
    .in("profile_id", args.spaceIds);

  const { data: sources } = await sourceQuery;
  const sourceRows = sources ?? [];
  if (!sourceRows.length && !selection.sourceItemIds?.length) {
    return { needing: [], totalInScope: 0, remoteNeeding: 0, deviceNeeding: 0 };
  }

  const sourceTypeById = new Map(
    sourceRows.map((s) => [String(s.id), String(s.source_type)])
  );
  const sourceIds = sourceRows.map((s) => String(s.id));

  let itemsQuery = supabase
    .from("source_items")
    .select(
      "id, source_id, external_id, name, mime_type, source_uri, metadata, processing_status, analysis_version, analysis_error"
    )
    .limit(800);

  if (selection.sourceItemIds?.length) {
    itemsQuery = itemsQuery.in("id", selection.sourceItemIds);
  } else if (sourceIds.length) {
    itemsQuery = itemsQuery.in("source_id", sourceIds);
  } else {
    return { needing: [], totalInScope: 0, remoteNeeding: 0, deviceNeeding: 0 };
  }

  const { data: rows } = await itemsQuery;
  const mapped: PackSourceItemRef[] = (rows ?? []).map((row) => {
    const sourceId = String(row.source_id);
    const sourceType = sourceTypeById.get(sourceId) ?? "unknown";
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    return {
      id: String(row.id),
      name: String(row.name ?? "Item"),
      sourceId,
      sourceType,
      remote:
        sourceType === "trello" ||
        sourceType === "google_drive" ||
        metadata.provider === "trello" ||
        metadata.provider === "google_drive",
      processingStatus: String(row.processing_status ?? "discovered"),
      mimeType: (row.mime_type as string | null) ?? null,
      sourceUri: String(row.source_uri ?? ""),
      externalId: String(row.external_id ?? row.id),
      metadata,
      analysisVersion: (row.analysis_version as string | null) ?? null,
      analysisError: (row.analysis_error as string | null) ?? null,
    };
  });

  // If explicit IDs were requested, fill missing source types.
  if (selection.sourceItemIds?.length) {
    const missing = mapped.filter((m) => !sourceTypeById.has(m.sourceId));
    if (missing.length) {
      const { data: extra } = await supabase
        .from("connected_sources")
        .select("id, source_type")
        .in(
          "id",
          Array.from(new Set(missing.map((m) => m.sourceId)))
        );
      for (const s of extra ?? []) {
        sourceTypeById.set(String(s.id), String(s.source_type));
      }
      for (const m of mapped) {
        const t = sourceTypeById.get(m.sourceId);
        if (t) {
          m.sourceType = t;
          m.remote =
            t === "trello" ||
            t === "google_drive" ||
            m.metadata.provider === "trello" ||
            m.metadata.provider === "google_drive";
        }
      }
    }
  }

  const needingAll = mapped.filter((m) =>
    itemNeedsAnalyze({
      processingStatus: m.processingStatus,
      analysisVersion: m.analysisVersion,
      mimeType: m.mimeType,
      name: m.name,
    })
  );

  // Prefer remote (Trello) first so Pack Analyze can run without folder pickers.
  needingAll.sort((a, b) => {
    if (a.remote !== b.remote) return a.remote ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const remoteNeeding = needingAll.filter((m) => m.remote).length;
  const deviceNeeding = needingAll.filter((m) => !m.remote).length;
  // Pack Analyze only auto-runs remote items; device files stay in Connections.
  const needing = needingAll
    .filter((m) => m.remote)
    .slice(0, PACK_SOURCE_ITEM_BATCH_SIZE);

  return {
    needing,
    totalInScope: mapped.length,
    remoteNeeding,
    deviceNeeding,
  };
}
