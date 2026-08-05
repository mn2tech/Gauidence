const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const KB = 1024;

/** Human-readable size for storage meters (prefers GB when large). */
export function formatStorageBytes(bytes: number): string {
  const safe = Math.max(0, bytes);
  if (safe >= GB) {
    const gb = safe / GB;
    return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  }
  if (safe >= MB) return `${(safe / MB).toFixed(0)} MB`;
  if (safe >= KB) return `${(safe / KB).toFixed(0)} KB`;
  return `${safe} B`;
}

/** Compact label for list rows (e.g. 1.39 GB · 47 files). */
export function formatStorageSummary(bytes: number, count: number, label: string): string {
  return `${formatStorageBytes(bytes)} · ${count.toLocaleString()} ${label}`;
}
