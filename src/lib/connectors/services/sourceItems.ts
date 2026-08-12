import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileScan, type ExistingSourceItemRow } from "../reconcile";
import type { ScanResultSummary, SourceItem } from "../types";
import { connectorLog } from "../log";

type SourceItemRow = {
  id: string;
  source_id: string;
  external_id: string;
  name: string;
  mime_type: string | null;
  source_uri: string | null;
  size_bytes: number | null;
  modified_at: string | null;
  metadata: Record<string, unknown> | null;
  processing_status: "discovered" | "unavailable";
  created_at: string;
  updated_at: string;
};

export function mapSourceItem(row: SourceItemRow): SourceItem & { id: string } {
  return {
    id: row.id,
    sourceId: row.source_id,
    externalId: row.external_id,
    name: row.name,
    mimeType: row.mime_type ?? undefined,
    sourceUri: row.source_uri ?? "",
    sizeBytes: row.size_bytes ?? undefined,
    modifiedAt: row.modified_at ?? undefined,
    metadata: row.metadata ?? {},
    processingStatus: row.processing_status,
  };
}

export async function listSourceItems(
  supabase: SupabaseClient,
  sourceId: string,
  options?: {
    search?: string;
    status?: string;
    limit?: number;
  }
): Promise<Array<SourceItem & { id: string }>> {
  let query = supabase
    .from("source_items")
    .select("*")
    .eq("source_id", sourceId)
    .order("name", { ascending: true })
    .limit(options?.limit ?? 2000);

  if (options?.status && options.status !== "all") {
    query = query.eq("processing_status", options.status);
  }

  if (options?.search?.trim()) {
    query = query.ilike("name", `%${options.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as SourceItemRow[] | null)?.map(mapSourceItem) ?? [];
}

export async function getSourceItem(
  supabase: SupabaseClient,
  sourceId: string,
  itemId: string
): Promise<(SourceItem & { id: string }) | null> {
  const { data, error } = await supabase
    .from("source_items")
    .select("*")
    .eq("source_id", sourceId)
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapSourceItem(data as SourceItemRow) : null;
}

export async function upsertScanResults(
  supabase: SupabaseClient,
  sourceId: string,
  scanned: SourceItem[]
): Promise<ScanResultSummary> {
  const { data: existingRows, error: listError } = await supabase
    .from("source_items")
    .select(
      "external_id, name, mime_type, source_uri, size_bytes, modified_at, processing_status"
    )
    .eq("source_id", sourceId);

  if (listError) throw listError;

  const existing: ExistingSourceItemRow[] = (
    (existingRows as Array<{
      external_id: string;
      name: string;
      mime_type: string | null;
      source_uri: string | null;
      size_bytes: number | null;
      modified_at: string | null;
      processing_status: string;
    }> | null) ?? []
  ).map((row) => ({
    externalId: row.external_id,
    name: row.name,
    mimeType: row.mime_type,
    sourceUri: row.source_uri,
    sizeBytes: row.size_bytes,
    modifiedAt: row.modified_at,
    processingStatus: row.processing_status,
  }));

  const { toUpsert, toMarkUnavailable, summary } = reconcileScan(
    existing,
    scanned.map((item) => ({ ...item, sourceId }))
  );

  if (toUpsert.length > 0) {
    const rows = toUpsert.map((item) => ({
      source_id: sourceId,
      external_id: item.externalId,
      name: item.name,
      mime_type: item.mimeType ?? null,
      source_uri: item.sourceUri,
      size_bytes: item.sizeBytes ?? null,
      modified_at: item.modifiedAt ?? null,
      metadata: item.metadata ?? {},
      processing_status: "discovered",
    }));

    // Upsert in chunks to avoid payload limits.
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from("source_items").upsert(chunk, {
        onConflict: "source_id,external_id",
      });
      if (error) throw error;
    }
  }

  if (toMarkUnavailable.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < toMarkUnavailable.length; i += chunkSize) {
      const chunk = toMarkUnavailable.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("source_items")
        .update({ processing_status: "unavailable" })
        .eq("source_id", sourceId)
        .in("external_id", chunk);
      if (error) throw error;
    }
  }

  const { error: scanStampError } = await supabase
    .from("connected_sources")
    .update({ last_scan_at: new Date().toISOString(), status: "connected" })
    .eq("id", sourceId);

  if (scanStampError) throw scanStampError;

  connectorLog("upsert_result", {
    sourceId,
    ...summary,
  });
  connectorLog("scan_completed", { sourceId, discovered: summary.discovered });

  return summary;
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export function formatModified(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatLastScanned(iso?: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Never";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Today, ${time}`;
  return `${formatModified(iso)}, ${time}`;
}
