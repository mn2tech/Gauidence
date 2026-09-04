import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConnectedSource } from "../types";
import { updateConnectedSource } from "../services/connectedSources";
import { gmailAccessTokenForSource } from "./access";
import {
  fetchGmailMessageMeta,
  listGmailMessageIds,
  GmailApiError,
} from "./client";
import {
  classifyInboxBucket,
  needsAttentionFromLabels,
  suggestSpaceForBucket,
  type InboxSpaceHint,
} from "./classify";

const SYNC_BATCH = 40;
const FETCH_CONCURRENCY = 5;

export type GmailSyncResult = {
  upserted: number;
  listed: number;
  sourceId: string;
};

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return out;
}

export async function syncGmailInbox(args: {
  supabase: SupabaseClient;
  userId: string;
  source: ConnectedSource;
  spaces: InboxSpaceHint[];
}): Promise<GmailSyncResult> {
  const accessToken = await gmailAccessTokenForSource(
    args.supabase,
    args.userId,
    args.source
  );

  const listed = await listGmailMessageIds(accessToken, {
    maxResults: SYNC_BATCH,
    q: "newer_than:30d -category:promotions -category:social",
  });

  const metas = await mapPool(listed, FETCH_CONCURRENCY, async (item) => {
    try {
      return await fetchGmailMessageMeta(accessToken, item.id);
    } catch (err) {
      if (err instanceof GmailApiError && err.status === 404) return null;
      throw err;
    }
  });

  const rows = metas
    .filter((m): m is NonNullable<typeof m> => m != null)
    .map((m) => {
      const bucket = classifyInboxBucket({
        fromEmail: m.fromEmail,
        fromName: m.fromName,
        subject: m.subject,
      });
      const suggested = suggestSpaceForBucket(bucket, args.spaces);
      return {
        user_id: args.userId,
        source_id: args.source.id,
        external_id: m.id,
        thread_external_id: m.threadId,
        from_name: m.fromName,
        from_email: m.fromEmail,
        subject: m.subject,
        preview: m.snippet.slice(0, 500),
        received_at: m.receivedAt,
        needs_attention: needsAttentionFromLabels(m.labelIds),
        bucket,
        assigned_space_id: null as string | null,
        suggested_space_id: suggested,
        label_ids: m.labelIds,
        metadata: { historyId: m.historyId ?? null },
        updated_at: new Date().toISOString(),
      };
    });

  if (rows.length > 0) {
    const { data: priorRows } = await args.supabase
      .from("inbox_messages")
      .select("external_id, assigned_space_id")
      .eq("source_id", args.source.id)
      .in(
        "external_id",
        rows.map((r) => r.external_id)
      );
    const assignedByExternal = new Map(
      (priorRows ?? []).map((r) => [
        String(r.external_id),
        (r.assigned_space_id as string | null) ?? null,
      ])
    );
    for (const row of rows) {
      const prior = assignedByExternal.get(row.external_id);
      if (prior) row.assigned_space_id = prior;
    }

    const { error } = await args.supabase.from("inbox_messages").upsert(rows, {
      onConflict: "source_id,external_id",
    });
    if (error) throw error;
  }

  await updateConnectedSource(args.supabase, args.userId, args.source.id, {
    lastScanAt: new Date().toISOString(),
  });

  return {
    upserted: rows.length,
    listed: listed.length,
    sourceId: args.source.id,
  };
}
