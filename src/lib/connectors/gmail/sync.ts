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
import {
  analyzeMoneyEmail,
  compareWithPreviousCharge,
  moneySignalToGuardianItem,
} from "./moneySignals";
import { persistExtractedGuardianItem } from "@/lib/guardian-items/persist";

const SYNC_BATCH = 40;
const FETCH_CONCURRENCY = 5;

export type GmailSyncResult = {
  upserted: number;
  listed: number;
  sourceId: string;
  moneySignals: number;
  watchItems: number;
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

  const messages = metas.filter((m): m is NonNullable<typeof m> => m != null);
  const baseSignals = messages.map((m) =>
    analyzeMoneyEmail({
      fromEmail: m.fromEmail,
      fromName: m.fromName,
      subject: m.subject,
      preview: m.snippet,
      receivedAt: m.receivedAt,
    })
  );
  const moneySignals = baseSignals.map((signal, index) => {
    if (!signal) return null;
    const current = messages[index]!;
    const previousIndex = messages.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        candidate.fromEmail.toLowerCase() === current.fromEmail.toLowerCase() &&
        baseSignals[candidateIndex]?.amountCents != null
    );
    return compareWithPreviousCharge(
      signal,
      previousIndex >= 0 ? baseSignals[previousIndex] : null
    );
  });

  const rows = messages.map((m, index) => {
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
        metadata: {
          historyId: m.historyId ?? null,
          ...(moneySignals[index]
            ? { money_guardian: moneySignals[index] }
            : {}),
        },
        updated_at: new Date().toISOString(),
      };
    });

  let createdWatchItems = 0;

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

    const { data: savedRows, error } = await args.supabase
      .from("inbox_messages")
      .upsert(rows, { onConflict: "source_id,external_id" })
      .select("id, external_id");
    if (error) throw error;

    const inboxIdByExternal = new Map(
      (savedRows ?? []).map((row) => [String(row.external_id), String(row.id)])
    );
    const today = new Date().toISOString().slice(0, 10);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]!;
      const signal = moneySignals[index];
      const spaceId = row.assigned_space_id ?? row.suggested_space_id;
      const inboxMessageId = inboxIdByExternal.get(row.external_id);
      if (!signal || !spaceId || !inboxMessageId) continue;
      const item = moneySignalToGuardianItem(
        signal,
        `${row.subject}\n${row.preview}`
      );
      if (!item) continue;
      const result = await persistExtractedGuardianItem({
        supabase: args.supabase,
        association: {
          userId: args.userId,
          spaceId,
          childId: null,
          schoolContextId: null,
        },
        item,
        sourceDocumentId: null,
        sourceType: "gmail",
        sourceId: inboxMessageId,
        sourceDocumentTitle: row.subject,
        today,
      });
      if (result.outcome === "created" || result.outcome === "superseded") {
        createdWatchItems += 1;
      }
    }
  }

  await updateConnectedSource(args.supabase, args.userId, args.source.id, {
    lastScanAt: new Date().toISOString(),
  });

  return {
    upserted: rows.length,
    listed: listed.length,
    sourceId: args.source.id,
    moneySignals: moneySignals.filter(Boolean).length,
    watchItems: createdWatchItems,
  };
}
