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

function chartStem(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\s*-\s*[A-G](?:#|b)?(?:m|maj|min|major|minor|5)?\b.*$/i, "")
    .trim()
    .toLowerCase();
}

/** Prefer the Trello chart named in Gideon's answer — never show unrelated charts. */
export function pickConnectorImageCitations<T extends NamedCitation>(
  citations: T[],
  answer: string,
  limit = 2
): T[] {
  if (!citations.length) return [];
  const lower = answer.toLowerCase();
  const mentioned = citations.filter((c) => {
    const stem = chartStem(c.fileName);
    if (stem.length < 4) return false;
    const snippet = stem.slice(0, Math.min(stem.length, 40));
    return lower.includes(snippet);
  });
  // Do not fall back to random first citations — that shows the wrong charts.
  return mentioned.slice(0, limit);
}

/** Chord-chart attachments vs syllabus/docs that should not cite for piano help. */
export function isLikelyChordChartFile(
  fileName: string,
  mimeType?: string | null
): boolean {
  const name = fileName.trim();
  if (!name) return false;
  if (/\b(syllabus|invoice|receipt|proposal|handbook|policy|contract)\b/i.test(name)) {
    return false;
  }
  if (/\.(jpe?g|png|webp|gif)$/i.test(name)) return true;
  if (mimeType?.startsWith("image/")) return true;
  if (/\.pdf$/i.test(name) || mimeType === "application/pdf") {
    return !/\b(kfc|junior|syllabus|worksheet)\b/i.test(name);
  }
  return false;
}

export function filterCitationsToChordCharts<
  T extends { fileName: string; mimeType?: string | null },
>(citations: T[]): T[] {
  return citations.filter((c) =>
    isLikelyChordChartFile(c.fileName, c.mimeType ?? null)
  );
}
