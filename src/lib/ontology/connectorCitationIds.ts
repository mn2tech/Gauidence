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

/** Key mentioned in Gideon’s answer or the user question (e.g. "Key C"). */
export function extractMusicalKeyFromText(text: string): string | null {
  const m =
    text.match(/\bkey\s*[:\-]?\s*([A-G](?:#|b)?m?(?:aj|in)?)\b/i) ||
    text.match(/\bin\s+([A-G](?:#|b)?m?)\b/i);
  if (!m?.[1]) return null;
  return m[1].replace(/maj|in$/i, "").replace(/aj$/i, "");
}

function chartLabelHasKey(label: string, key: string): boolean {
  const base = key.replace(/m$/i, "");
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `[-–—]\\s*${escaped}(?:m|maj|min|major|minor)?\\b|\\bkey\\s*${escaped}\\b`,
    "i"
  ).test(label);
}

/**
 * When several charts match the same song, prefer the key named in the text
 * (e.g. answer says Key C → keep the C chart, drop Bb).
 */
export function preferChartsMatchingKeyInText<T extends NamedCitation>(
  citations: T[],
  text: string,
  limit = 2
): T[] {
  if (!citations.length) return [];
  if (citations.length === 1) return citations.slice(0, limit);
  const key = extractMusicalKeyFromText(text);
  if (!key) return citations.slice(0, limit);
  const keyed = citations.filter((c) => {
    const labels = [c.cardName, c.fileName]
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean)
      .join(" ");
    return chartLabelHasKey(labels, key);
  });
  if (keyed.length) return keyed.slice(0, Math.min(limit, 1));
  return citations.slice(0, limit);
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
  return preferChartsMatchingKeyInText(mentioned, answer, limit);
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
  const keyText = `${question}\n${answer}`;
  const fromAnswer = pickConnectorImageCitations(citations, answer, limit);
  if (fromAnswer.length) {
    return preferChartsMatchingKeyInText(fromAnswer, keyText, limit);
  }

  const fromQuestion = pickConnectorImageCitations(citations, question, limit);
  if (fromQuestion.length) {
    return preferChartsMatchingKeyInText(fromQuestion, keyText, limit);
  }

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
    return preferChartsMatchingKeyInText(
      charts.length === 1 ? charts : [],
      keyText,
      limit
    );
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

  if (matched.length) {
    return preferChartsMatchingKeyInText(matched, keyText, limit);
  }

  // Opaque Trello filenames with a matching card title already filtered upstream.
  const charts = citations.filter(
    (c) =>
      (isLikelyChordChartFile(c.fileName, c.mimeType ?? null) || c.isImage) &&
      Boolean(c.cardName?.trim())
  );
  if (charts.length === 1) return charts;
  return preferChartsMatchingKeyInText(charts, keyText, limit);
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
