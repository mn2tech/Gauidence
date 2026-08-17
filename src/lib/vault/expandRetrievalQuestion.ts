export type ChatTurn = { role: "user" | "assistant"; content: string };

const VAGUE_FOLLOWUP =
  /\b(full|entire|complete|verbatim|exact)\s+(log|logs|note|notes|entry|entries|request|requests|text|message)\b/i;

const DEICTIC_FOLLOWUP =
  /\b(show|give|share|display|repeat|quote)\s+(us |me )?(the |that )?(full |entire )?(log|note|it|that|this|request)\b/i;

const SHORT_DEICTIC =
  /^(and |also |)?(that|this|it|them|those)\??$/i;

const LEARN_THIS_SONG =
  /\b((learn|practice|play|teach)\b.{0,40}\b(this |that |the )?(song|chart|hymn)|help me .{0,20}(piano|keyboard|song)|(piano|keyboard).{0,30}(learn|practice|help))\b/i;

const CHART_FILE_FOLLOWUP =
  /\b(jpe?g|png|pdf|chart\s*(file|image|attachment)|the\s+(file|image|attachment|jpg|jpeg|png|pdf)|attach(ed|ment)?|source\s*(file|preview)?)\b/i;

/** "Open this PDF" / "show the chart" after a roster or song answer. */
const OPEN_CHART_ATTACHMENT =
  /\b(open|show|view|display|pull\s+up|bring\s+up)\b.{0,40}\b(this|that|the|it)?\s*(pdf|jpe?g|png|chart|file|attachment|source)\b/i;

const OPEN_CHART_SHORT =
  /^(open|show|view)\s+(this|that|it|the\s+(pdf|chart|file|jpg|jpeg|png))\s*[.!]?\s*$/i;

/** "What a Beautiful Name - C" / "Lord Send Revival - G" as a standalone chart pick. */
const CHART_TITLE_WITH_KEY =
  /^.{2,80}?\s[-–—]\s*[A-G](?:#|b)?(?:m|maj|min|major|minor|5)?\s*$/i;

/** True when the message is basically a chart/card title (often with a key). */
export function looksLikeChartTitleQuery(question: string): boolean {
  const t = question.trim();
  if (t.length < 4 || t.length > 100) return false;
  if (/[?]/.test(t)) return false;
  if (
    /\b(what|how|why|when|where|who|please|can you|could you|show me|tell me)\b/i.test(
      t
    ) &&
    !CHART_TITLE_WITH_KEY.test(t)
  ) {
    return false;
  }
  return CHART_TITLE_WITH_KEY.test(t);
}

/** Clean a chart filename or card title into a searchable song name. */
export function cleanChartTitle(raw: string): string {
  let title = raw.trim();
  // "Even So Come (Come+Lord+….pdf)" from roster bullets (nested parens in filenames)
  title = title.replace(/\s*\(.+\.(?:jpe?g|png|gif|webp|pdf)\)\s*$/i, "").trim();
  title = title.replace(/\.(jpe?g|png|gif|webp|pdf)$/i, "").trim();
  title = title
    .replace(/\s*-\s*[A-G](?:#|b)?(?:m|maj|min|major|minor|5)?\b.*$/i, "")
    .replace(/\s*-\s*short version\s*$/i, "")
    .replace(
      /\s*[-–—]\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b.*$/i,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
  return title;
}

/** Pull chart/song titles from filenames, bullets, or “chords for …” phrasing. */
export function extractChartTitlesFromText(text: string): string[] {
  const titles: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const title = cleanChartTitle(raw);
    const key = title.toLowerCase();
    if (title.length < 2 || seen.has(key)) return;
    if (/^(songs?|charts?|piano|practice|wednesday|living waters)$/i.test(title)) {
      return;
    }
    seen.add(key);
    titles.push(title);
  };

  for (const match of text.matchAll(
    /([^\n|•*]{2,120}?\.(?:jpe?g|png|gif|webp|pdf))/gi
  )) {
    push(match[1]!);
  }
  for (const match of text.matchAll(
    /^[•*\-]\s+(.+)\s+\((.+\.(?:jpe?g|png|gif|webp|pdf))\)\s*$/gim
  )) {
    push(match[1]!);
  }
  for (const match of text.matchAll(/^[•*\-]\s+(.+)$/gm)) {
    push(match[1]!);
  }
  const forMatch = text.match(
    /\b(?:chords?(?:\s+and\s+lyrics)?|lyrics|key|learn|practice|play)\s+(?:for|to)\s+(.+?)(?:\?|$)/i
  );
  if (forMatch?.[1]) push(forMatch[1]);

  const trimmed = text.trim();
  if (looksLikeChartTitleQuery(trimmed)) {
    push(trimmed);
  }

  return titles;
}

export function isPianoOrSongLearnRequest(question: string): boolean {
  return (
    LEARN_THIS_SONG.test(question.trim()) ||
    looksLikeChartTitleQuery(question)
  );
}

/** True when the user wants to open/view a chart PDF or image from this chat. */
export function wantsOpenChartAttachment(question: string): boolean {
  const q = question.trim();
  return OPEN_CHART_ATTACHMENT.test(q) || OPEN_CHART_SHORT.test(q);
}

export type OpenChartCitation = {
  documentId: string;
  fileName: string;
  profileName?: string;
  isImage?: boolean;
  kind?: "vault" | "connector";
  sourceId?: string;
  itemId?: string;
  sourceType?: string;
  mimeType?: string | null;
  cardName?: string | null;
};

/**
 * Deterministic reply for "open this PDF" after a roster/song turn —
 * attaches the matching chart Source instead of letting the model hedge.
 */
export function buildOpenChartAttachmentAnswer(args: {
  question: string;
  history: ChatTurn[];
  citations: OpenChartCitation[];
}): { answer: string; citations: OpenChartCitation[] } | null {
  if (!wantsOpenChartAttachment(args.question)) return null;
  if (!args.citations.length) return null;

  const recent = args.history
    .slice(-8)
    .map((t) => t.content)
    .join("\n");
  const titles = extractChartTitlesFromText(
    `${args.question}\n${recent}`
  ).map((t) => t.toLowerCase());

  const preferPdf = /\bpdfs?\b/i.test(args.question);
  const preferImage = /\b(jpe?g|pngs?|image)\b/i.test(args.question);

  const scored = args.citations
    .map((c) => {
      const labels = [c.cardName, c.fileName]
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean);
      const isPdf =
        /\.pdf$/i.test(c.fileName) ||
        Boolean(c.mimeType?.includes("pdf"));
      const isImg =
        Boolean(c.isImage) ||
        /\.(jpe?g|png|gif|webp)$/i.test(c.fileName);
      let score = 0;
      if (preferPdf && isPdf) score += 3;
      if (preferImage && isImg) score += 3;
      if (!preferPdf && !preferImage && (isPdf || isImg)) score += 1;
      for (const title of titles) {
        if (title.length < 2) continue;
        for (const label of labels) {
          const stem = cleanChartTitle(label).toLowerCase();
          if (
            stem.includes(title) ||
            title.includes(stem) ||
            label.toLowerCase().includes(title)
          ) {
            score += 5;
          }
        }
      }
      return { c, score, isPdf, isImg };
    })
    .filter((row) => row.score > 0 || args.citations.length === 1)
    .sort((a, b) => b.score - a.score);

  let picked = scored.map((row) => row.c);
  if (!picked.length && preferPdf) {
    const pdfs = args.citations.filter(
      (c) =>
        /\.pdf$/i.test(c.fileName) || Boolean(c.mimeType?.includes("pdf"))
    );
    if (pdfs.length === 1) picked = pdfs;
  }
  if (!picked.length && args.citations.length === 1) {
    picked = [args.citations[0]!];
  }
  if (!picked.length) return null;

  const top = picked.slice(0, 2);
  const primary = top[0]!;
  const label =
    (primary.cardName && primary.cardName.trim()) ||
    cleanChartTitle(primary.fileName) ||
    primary.fileName;
  const kindLabel = /\.pdf$/i.test(primary.fileName) ? "PDF" : "chart";
  return {
    answer: `Here's ${label} — tap the Source preview below to open the ${kindLabel} (${primary.fileName}).`,
    citations: top,
  };
}

/** Expand a vague follow-up with recent chat turns so retrieval stays on topic. */
export function expandRetrievalQuestion(
  question: string,
  history: ChatTurn[] = []
): string {
  const q = question.trim();
  if (!q) return q;

  const namedInQuestion = extractChartTitlesFromText(q);
  if (namedInQuestion.length) {
    return `${q}\n\nFocus on these songs/charts: ${namedInQuestion.join("; ")}`;
  }

  const needsHistory =
    VAGUE_FOLLOWUP.test(q) ||
    DEICTIC_FOLLOWUP.test(q) ||
    SHORT_DEICTIC.test(q) ||
    isPianoOrSongLearnRequest(q) ||
    CHART_FILE_FOLLOWUP.test(q) ||
    wantsOpenChartAttachment(q) ||
    (q.length < 48 && /\b(it|that|this|those|them|the same)\b/i.test(q));

  if (!needsHistory || history.length === 0) return q;

  const recent = history
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");

  const namedInHistory = extractChartTitlesFromText(recent);
  if (
    namedInHistory.length &&
    (isPianoOrSongLearnRequest(q) ||
      CHART_FILE_FOLLOWUP.test(q) ||
      wantsOpenChartAttachment(q))
  ) {
    return `${q}\n\nSongs recently discussed (ask which one if unclear): ${namedInHistory.slice(0, 12).join("; ")}\n\nContext from this conversation:\n${recent}`;
  }

  return `${q}\n\nContext from this conversation:\n${recent}`;
}

/** True when the user wants the complete Daily Log text quoted back. */
export function wantsFullDailyLogQuote(question: string): boolean {
  return (
    VAGUE_FOLLOWUP.test(question) || DEICTIC_FOLLOWUP.test(question)
  );
}
