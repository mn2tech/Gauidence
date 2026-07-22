import type { AwardKey } from "@/lib/awards/definitions";

/** Fire a browser event so AwardToast can celebrate new awards. */
export function dispatchAwardsEarned(keys: AwardKey[] | undefined | null) {
  if (!keys?.length || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("guardian:award-earned", { detail: { keys } })
  );
}

export function dispatchAwardsFromResponse(body: unknown) {
  if (!body || typeof body !== "object") return;
  const keys = (body as { newlyGranted?: unknown }).newlyGranted;
  if (!Array.isArray(keys)) return;
  dispatchAwardsEarned(keys.filter((k): k is AwardKey => typeof k === "string"));
}

/** Sync awards after a client-side document upload. */
export async function syncDocumentAwards(documentId: string) {
  try {
    const res = await fetch("/api/awards/document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    dispatchAwardsFromResponse(await res.json().catch(() => null));
  } catch {
    /* ignore */
  }
}
