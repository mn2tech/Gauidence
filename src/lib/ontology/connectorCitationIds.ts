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

type NamedCitation = {
  fileName: string;
  cardName?: string | null;
  isImage?: boolean;
  mimeType?: string | null;
};

function chartStem(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\s*-\s*[A-G](?:#|b)?(?:m|maj|min|major|minor|5)?\b.*$/i, "")
    .replace(
      /\s*[-–—]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b.*$/i,
      ""
    )
    .trim()
    .toLowerCase();
}

function citationMentionedInText(
  citation: NamedCitation,
  text: string
): boolean {
  const lower = text.toLowerCase();
  const stems = [chartStem(citation.fileName)];
  if (citation.cardName?.trim()) {
    stems.push(chartStem(citation.cardName));
  }
  for (const stem of stems) {
    if (stem.length < 4) continue;
    const snippet = stem.slice(0, Math.min(stem.length, 48));
    if (lower.includes(snippet)) return true;
  }
  return false;
}

/** Prefer the Trello chart named in Gideon's answer — never show unrelated charts. */
export function pickConnectorImageCitations<T extends NamedCitation>(
  citations: T[],
  answer: string,
  limit = 2
): T[] {
  if (!citations.length) return [];
  const mentioned = citations.filter((c) => citationMentionedInText(c, answer));
  // Do not fall back to random first citations — that shows the wrong charts.
  return mentioned.slice(0, limit);
}

/**
 * For chord/lyrics questions: prefer charts named in the answer, else in the
 * question, else charts whose Trello card title matches the song named.
 */
export function pickConnectorCitationsForChartQuery<T extends NamedCitation>(
  citations: T[],
  question: string,
  answer: string,
  songTitles: string[],
  limit = 4
): T[] {
  const fromAnswer = pickConnectorImageCitations(citations, answer, limit);
  if (fromAnswer.length) return fromAnswer;

  const fromQuestion = pickConnectorImageCitations(citations, question, limit);
  if (fromQuestion.length) return fromQuestion;

  const titles = [
    ...songTitles,
    ...extractTitlesFromQuestion(question),
  ].filter(Boolean);

  if (!titles.length) {
    // Ontology already scoped citations to this turn — if only one chart remains, attach it.
    const charts = citations.filter(
      (c) =>
        isLikelyChordChartFile(c.fileName, c.mimeType ?? null) || c.isImage
    );
    return charts.length === 1 ? charts : [];
  }

  const matched = citations.filter((c) => {
    if (
      !isLikelyChordChartFile(c.fileName, c.mimeType ?? null) &&
      !c.isImage
    ) {
      return false;
    }
    const labels = [c.cardName, c.fileName]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    return titles.some((title) => {
      const t = title.toLowerCase().trim();
      if (t.length < 3) return false;
      return labels.some((label) => {
        const stem = chartStem(label);
        return (
          stem.includes(t) ||
          t.includes(stem) ||
          citationMentionedInText(c, title)
        );
      });
    });
  });

  if (matched.length) return matched.slice(0, limit);

  // Opaque Trello filenames with a matching card title already filtered upstream.
  const charts = citations.filter(
    (c) =>
      (isLikelyChordChartFile(c.fileName, c.mimeType ?? null) || c.isImage) &&
      Boolean(c.cardName?.trim())
  );
  if (charts.length === 1) return charts;
  return [];
}

function extractTitlesFromQuestion(question: string): string[] {
  const forMatch = question.match(
    /\b(?:chords?(?:\s+and\s+lyrics)?|lyrics|key|learn|practice|play)\s+(?:for|to)\s+(.+?)(?:\?|$)/i
  );
  return forMatch?.[1] ? [forMatch[1].trim()] : [];
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
