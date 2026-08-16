/**
 * Shared display helpers for Business Intelligence answers (no server-only).
 */

/** Strip a leading "Client — " prefix from proposal titles when grouping by client. */
export function proposalTitleWithoutClientPrefix(
  title: string,
  clientName: string
): string {
  const t = title.trim();
  const c = clientName.trim();
  if (!c || /^unknown client$/i.test(c)) return t;

  const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = t
    .replace(new RegExp(`^${escaped}\\s*[—\\-–:]\\s*`, "i"), "")
    .trim();
  if (exact && exact !== t) return exact;

  // AshtonManor vs "Ashton Manor — …"
  const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const clientKey = compact(c);
  if (clientKey.length < 3) return t;

  const sep = t.search(/\s*[—\-–:]\s*/);
  if (sep <= 0) return t;
  const head = t.slice(0, sep).trim();
  const rest = t.slice(sep).replace(/^\s*[—\-–:]\s*/, "").trim();
  if (rest && compact(head) === clientKey) return rest;

  return t;
}

/** "Client — Title" without repeating the client name inside the title. */
export function formatClientProposalLabel(
  clientName: string,
  title: string
): string {
  const client = clientName.trim() || "Client";
  const cleanTitle = proposalTitleWithoutClientPrefix(title, client);
  return `${client} — ${cleanTitle}`;
}
