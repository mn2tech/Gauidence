/** Connectors whose file bytes are fetched server-side (not from device storage). */

export function isRemoteSourceType(sourceType?: string | null): boolean {
  return sourceType === "trello" || sourceType === "google_drive";
}

export function isRemoteSourceItem(item: {
  metadata?: Record<string, unknown> | null;
}): boolean {
  const provider = item.metadata?.provider;
  return provider === "trello" || provider === "google_drive";
}
