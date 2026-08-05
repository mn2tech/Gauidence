/** Client-side pre-check before vault uploads. */

export type StorageCheckResult = {
  ok: true;
  totalBytes: number;
  limitBytes: number;
  remainingBytes: number;
};

export async function checkVaultStorageQuota(args: {
  additionalBytes: number;
  storageOwnerId?: string;
}): Promise<StorageCheckResult> {
  const res = await fetch("/api/account/storage/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      additionalBytes: args.additionalBytes,
      storageOwnerId: args.storageOwnerId,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    totalBytes?: number;
    limitBytes?: number;
    remainingBytes?: number;
  };
  if (!res.ok) {
    const err = new Error(body.error ?? "Storage check failed.") as Error & {
      code?: string;
    };
    err.code = body.code;
    throw err;
  }
  return {
    ok: true,
    totalBytes: body.totalBytes ?? 0,
    limitBytes: body.limitBytes ?? 0,
    remainingBytes: body.remainingBytes ?? 0,
  };
}

export function isStorageLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: string }).code ?? "") : "";
  if (code === "storage_limit") return true;
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /vault storage/i.test(message) || /storage limit/i.test(message);
}
