"use client";

import { ConnectorError, type SourceItem } from "@/lib/connectors/types";
import {
  hashSourceBytes,
  readSourceItemContent,
  type ReadSourceOptions,
} from "@/lib/connectors/content/readClient";
import { isAnalyzeSupportedMime } from "@/lib/connectors/content/types";

export type AnalyzeClientResult = {
  ok: true;
  skipped?: boolean;
  reason?: string;
  profileId?: string;
  entitiesFound?: number;
  relationshipsFound?: number;
  confidence?: string;
  entities?: Array<{
    id: string;
    entity_type: string;
    name: string;
    confidence: number | null;
    review_status: string | null;
  }>;
  relationships?: Array<{
    id: string;
    relationship_type: string;
    confidence: number | null;
    review_status: string | null;
    source_name: string;
    target_name: string;
  }>;
};

export type AnalyzeClientFailure = {
  ok: false;
  error: string;
  code?: string;
  cancelled?: boolean;
};

/** Files that can be analyzed (or re-analyzed) from the browse list. */
export function isItemAnalyzable(
  item: Pick<SourceItem, "name" | "mimeType" | "processingStatus">
): boolean {
  if (item.processingStatus === "unavailable") return false;
  if (item.processingStatus === "analyzing") return false;
  return isAnalyzeSupportedMime(item.mimeType, item.name);
}

/** New / failed items for "Analyze new". */
export function isItemNeedsAnalyze(
  item: Pick<SourceItem, "name" | "mimeType" | "processingStatus">
): boolean {
  if (!isItemAnalyzable(item)) return false;
  return (
    item.processingStatus === "discovered" ||
    item.processingStatus === "analysis_failed"
  );
}

/**
 * Read bytes + POST analyze for one connected source item.
 */
export async function analyzeSourceItemClient(args: {
  sourceId: string;
  item: SourceItem & { id: string };
  force?: boolean;
  profileId?: string | null;
  readOptions?: ReadSourceOptions;
}): Promise<AnalyzeClientResult | AnalyzeClientFailure> {
  const { sourceId, item, force, profileId, readOptions } = args;
  try {
    const content = await readSourceItemContent(item, readOptions);
    if (!content.bytes) {
      return { ok: false, error: "Couldn't read file bytes for analysis." };
    }
    const contentHash = await hashSourceBytes(content.bytes);
    const form = new FormData();
    const ab = content.bytes.buffer.slice(
      content.bytes.byteOffset,
      content.bytes.byteOffset + content.bytes.byteLength
    ) as ArrayBuffer;
    form.append(
      "file",
      new File([ab], content.filename, { type: content.mimeType })
    );
    form.append("contentHash", contentHash);
    if (content.text) form.append("text", content.text);
    if (profileId) form.append("profileId", profileId);
    const shouldForce =
      force === true ||
      item.processingStatus === "analyzed" ||
      item.processingStatus === "analysis_failed";
    if (shouldForce) form.append("force", "1");

    const res = await fetch(
      `/api/connections/${sourceId}/items/${item.id}/analyze`,
      { method: "POST", body: form }
    );
    const body = (await res.json().catch(() => ({}))) as AnalyzeClientResult & {
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: body.error ?? "Analysis failed.",
        code: body.code,
      };
    }
    return {
      ok: true,
      skipped: body.skipped,
      reason: body.reason,
      profileId: body.profileId,
      entitiesFound: body.entitiesFound,
      relationshipsFound: body.relationshipsFound,
      confidence: body.confidence,
      entities: body.entities,
      relationships: body.relationships,
    };
  } catch (err) {
    if (err instanceof ConnectorError && err.code === "cancelled") {
      return {
        ok: false,
        error: err.message,
        code: err.code,
        cancelled: true,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Analysis failed.",
      code: err instanceof ConnectorError ? err.code : undefined,
    };
  }
}
