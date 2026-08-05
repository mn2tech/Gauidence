import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlatformAdmin } from "@/lib/admin";
import { isImageFileName } from "@/lib/vault/images";
import { getPlanSnapshot } from "./quota";
import { PLAN_LABELS, type PlanId } from "./plans";

export type StorageBreakdown = {
  totalBytes: number;
  fileBytes: number;
  fileCount: number;
  imageBytes: number;
  imageCount: number;
};

export type StorageSnapshot = StorageBreakdown & {
  accountId: string;
  plan: PlanId;
  planLabel: string;
  limitBytes: number;
  remainingBytes: number;
  percentUsed: number;
};

function isImageDocument(row: {
  mime_type?: string | null;
  file_name?: string | null;
}): boolean {
  const mime = row.mime_type?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return true;
  return isImageFileName(row.file_name);
}

function storageAccountPrefix(accountId: string): string {
  return `${accountId}/`;
}

export function storageAccountIdFromPath(filePath: string): string | null {
  const segment = filePath.split("/")[0]?.trim();
  if (!segment) return null;
  return segment;
}

export function summarizeDocumentRows(
  rows: { size_bytes: number; mime_type?: string | null; file_name?: string | null }[]
): StorageBreakdown {
  let totalBytes = 0;
  let imageBytes = 0;
  let imageCount = 0;
  let fileBytes = 0;
  let fileCount = 0;

  for (const row of rows) {
    const size = Number(row.size_bytes) || 0;
    totalBytes += size;
    if (isImageDocument(row)) {
      imageBytes += size;
      imageCount += 1;
    } else {
      fileBytes += size;
      fileCount += 1;
    }
  }

  return { totalBytes, fileBytes, fileCount, imageBytes, imageCount };
}

export async function getAccountStorageUsage(
  supabase: SupabaseClient,
  accountId: string
): Promise<StorageBreakdown> {
  const { data, error } = await supabase
    .from("documents")
    .select("size_bytes, mime_type, file_name")
    .like("file_path", `${storageAccountPrefix(accountId)}%`);

  if (error) {
    console.error("getAccountStorageUsage:", error.message);
    return {
      totalBytes: 0,
      fileBytes: 0,
      fileCount: 0,
      imageBytes: 0,
      imageCount: 0,
    };
  }

  return summarizeDocumentRows(data ?? []);
}

export function buildStorageSnapshot(args: {
  accountId: string;
  plan: PlanId;
  limitBytes: number;
  usage: StorageBreakdown;
}): StorageSnapshot {
  const remainingBytes = Math.max(0, args.limitBytes - args.usage.totalBytes);
  const percentUsed =
    args.limitBytes > 0
      ? Math.min(100, Math.round((args.usage.totalBytes / args.limitBytes) * 100))
      : 0;

  return {
    accountId: args.accountId,
    plan: args.plan,
    planLabel: PLAN_LABELS[args.plan],
    limitBytes: args.limitBytes,
    remainingBytes,
    percentUsed,
    ...args.usage,
  };
}

export async function getStorageSnapshot(
  supabase: SupabaseClient,
  accountId: string
): Promise<StorageSnapshot> {
  const [usage, snap] = await Promise.all([
    getAccountStorageUsage(supabase, accountId),
    getPlanSnapshot(supabase, accountId),
  ]);

  return buildStorageSnapshot({
    accountId,
    plan: snap.plan,
    limitBytes: snap.limits.storageBytes,
    usage,
  });
}

export function storageLimitMessage(plan: PlanId, limitBytes: number): string {
  const gb = limitBytes / (1024 * 1024 * 1024);
  const limitLabel =
    gb >= 1 ? `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)} GB` : `${Math.round(limitBytes / (1024 * 1024))} MB`;
  return `You've used all your vault storage on the ${PLAN_LABELS[plan]} plan (${limitLabel}). Delete files or upgrade for more space.`;
}

export async function assertStorageQuota(
  supabase: SupabaseClient,
  args: {
    accountId: string;
    additionalBytes: number;
    email?: string | null;
  }
): Promise<
  | { ok: true; snapshot: StorageSnapshot }
  | { ok: false; response: NextResponse }
> {
  if (args.additionalBytes <= 0) {
    const snapshot = await getStorageSnapshot(supabase, args.accountId);
    return { ok: true, snapshot };
  }

  if (isPlatformAdmin(args.email)) {
    const snapshot = await getStorageSnapshot(supabase, args.accountId);
    return { ok: true, snapshot };
  }

  const snapshot = await getStorageSnapshot(supabase, args.accountId);
  if (snapshot.totalBytes + args.additionalBytes > snapshot.limitBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ...snapshot,
          error: storageLimitMessage(snapshot.plan, snapshot.limitBytes),
          code: "storage_limit",
        },
        { status: 429 }
      ),
    };
  }

  return { ok: true, snapshot };
}

export function isStorageLimitError(message: string): boolean {
  return /vault storage/i.test(message) || /storage_limit/i.test(message);
}
