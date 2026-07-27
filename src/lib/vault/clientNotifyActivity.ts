/** Fire-and-forget: tell the server to email other vault members about new content. */
export function notifyVaultActivityClient(args: {
  profileId: string;
  kind: "document" | "daily_log";
  documentId?: string;
  logId?: string;
}): void {
  void fetch("/api/vault/activity-notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  }).catch(() => {
    /* non-blocking */
  });
}
