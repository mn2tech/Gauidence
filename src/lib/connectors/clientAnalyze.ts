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
  // Allow retry when a previous request left the row stuck in analyzing.
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

function isTrelloRemoteItem(item: SourceItem): boolean {
  return item.metadata?.provider === "trello";
}

/** True when Analyze can fetch content server-side (no local folder picker). */
export function isRemoteAnalyzeItem(item: SourceItem): boolean {
  return isTrelloRemoteItem(item);
}

async function markAnalysisFailed(
  sourceId: string,
  itemId: string,
  message: string
): Promise<void> {
  try {
    await fetch(`/api/connections/${sourceId}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        processingStatus: "analysis_failed",
        analysisError: message.slice(0, 500),
      }),
    });
  } catch {
    // Best-effort status recovery after timeouts.
  }
}

/**
 * Read bytes + POST analyze for one connected source item.
 * Trello boards/PDFs are fetched server-side (no local file picker).
 */
export async function analyzeSourceItemClient(args: {
  sourceId: string;
  item: SourceItem & { id: string };
  force?: boolean;
  profileId?: string | null;
  readOptions?: ReadSourceOptions;
  /** Force server-side fetch (whole Trello connection). */
  remote?: boolean;
}): Promise<AnalyzeClientResult | AnalyzeClientFailure> {
  const { sourceId, item, force, profileId, readOptions, remote } = args;
  try {
    const shouldForce =
      force === true ||
      item.processingStatus === "analyzed" ||
      item.processingStatus === "analysis_failed";

    if (remote || isTrelloRemoteItem(item)) {
      const res = await fetch(
        `/api/connections/${sourceId}/items/${item.id}/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fetchFromSource: true,
            force: shouldForce,
            profileId: profileId ?? null,
          }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as AnalyzeClientResult & {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        const message = body.error ?? "Analysis failed.";
        await markAnalysisFailed(sourceId, item.id, message);
        return {
          ok: false,
          error: message,
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
    }

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
      const message = body.error ?? "Analysis failed.";
      await markAnalysisFailed(sourceId, item.id, message);
      return {
        ok: false,
        error: message,
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
    const message =
      err instanceof Error ? err.message : "Analysis failed.";
    await markAnalysisFailed(sourceId, item.id, message);
    return {
      ok: false,
      error: message,
      code: err instanceof ConnectorError ? err.code : undefined,
    };
  }
}
