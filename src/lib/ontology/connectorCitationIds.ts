/** Stable synthetic id so connector citations never collide with vault document UUIDs. */
export function connectorCitationDocumentId(itemId: string): string {
  return `connector:${itemId}`;
}

export function isConnectorCitationDocumentId(documentId: string): boolean {
  return documentId.startsWith("connector:");
}

export function connectorFilePreviewPath(
  sourceId: string,
  itemId: string
): string {
  return `/api/connections/${sourceId}/items/${itemId}/file`;
}

type NamedCitation = { fileName: string };

/** Prefer the Trello chart named in Gideon's answer; otherwise the first few. */
export function pickConnectorImageCitations<T extends NamedCitation>(
  citations: T[],
  answer: string,
  limit = 2
): T[] {
  if (!citations.length) return [];
  const lower = answer.toLowerCase();
  const mentioned = citations.filter((c) => {
    const stem = c.fileName.replace(/\.[^.]+$/, "").trim().toLowerCase();
    if (stem.length < 4) return false;
    const snippet = stem.slice(0, Math.min(stem.length, 32));
    return lower.includes(snippet);
  });
  return (mentioned.length ? mentioned : citations).slice(0, limit);
}
