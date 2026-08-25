/** Display helpers for parent-facing knowledge cards. */

const MONTH_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Labels checked only near a specific calendar date mention. */
const DATE_LOCAL_LABELS: Array<{ re: RegExp; label: string }> = [
  { re: /\bfirst day of school\b/i, label: "First day of school for students" },
  { re: /\blast day of school\b/i, label: "Last day of school" },
  { re: /\bstudent transition day\b/i, label: "Student Transition Day" },
  { re: /\blabor day\b/i, label: "Labor Day — no school" },
  { re: /\bthanksgiving\b/i, label: "Thanksgiving holiday" },
  { re: /\bwinter break\b/i, label: "Winter break" },
  { re: /\bspring break\b/i, label: "Spring break" },
  { re: /\bmemorial day\b/i, label: "Memorial Day — no school" },
  { re: /\bearly release\b/i, label: "Early release" },
  {
    re: /\b(schools? and offices closed|systemwide closure)\b/i,
    label: "Schools and offices closed",
  },
  { re: /\bno school for students\b/i, label: "No school for students" },
  { re: /\bprofessional (development )?day\b/i, label: "Professional day — no school" },
];

/**
 * Title the card from text near the chosen event date so we don't label
 * "Aug 25 First day of school" as "Early release" just because early release
 * appears elsewhere in the same calendar PDF.
 */
export function labelForEventDate(args: {
  title: string;
  content: string;
  eventDate: string;
}): string | null {
  const m = args.eventDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) return null;

  const full = MONTH_FULL[monthIdx]!;
  const short = MONTH_SHORT[monthIdx]!;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const dateRe = new RegExp(
    `${full}\\.?\\s+${day}(?:st|nd|rd|th)?\\b|${short}\\.?\\s+${day}(?:st|nd|rd|th)?\\b|${iso}`,
    "gi"
  );

  const text = `${args.title}\n${args.content}`;
  const windows: string[] = [];
  for (const match of text.matchAll(dateRe)) {
    const idx = match.index ?? 0;
    windows.push(
      text.slice(Math.max(0, idx - 50), Math.min(text.length, idx + match[0].length + 180))
    );
  }
  if (!windows.length) return null;

  for (const win of windows) {
    for (const rule of DATE_LOCAL_LABELS) {
      if (rule.re.test(win)) return rule.label;
    }
  }
  return null;
}

const CALENDAR_LABELS: Array<{ re: RegExp; label: string }> = [
  ...DATE_LOCAL_LABELS,
  { re: /\bmlk|martin luther king\b/i, label: "MLK Day — no school" },
  { re: /\bpresidents['’]? day\b/i, label: "Presidents' Day — no school" },
];

const TRANSPORT_LABELS: Array<{ re: RegExp; label: string }> = [
  { re: /\bbus depot\b/i, label: "Bus depot contacts" },
  { re: /\bbus routes?\b/i, label: "Bus routes" },
  { re: /\briding the school bus\b/i, label: "Riding the school bus" },
  { re: /\btransportation\b/i, label: "Transportation" },
];

const PARENT_LABELS: Array<{ re: RegExp; label: string }> = [
  { re: /\bparentvue\b/i, label: "ParentVUE" },
  { re: /\bhow to enroll\b/i, label: "How to enroll a student" },
  { re: /\benroll\b/i, label: "Student enrollment" },
];

const ASSIGNMENT_LABELS: Array<{ re: RegExp; label: string }> = [
  { re: /\bschool assignment\b/i, label: "Find your assigned school" },
  { re: /\bboundar/i, label: "School boundaries" },
];

function labelsForCategory(category: string): Array<{ re: RegExp; label: string }> {
  switch (category.trim().toLowerCase()) {
    case "calendar":
      return CALENDAR_LABELS;
    case "transportation":
      return TRANSPORT_LABELS;
    case "parent-resources":
      return PARENT_LABELS;
    case "school-assignment":
      return ASSIGNMENT_LABELS;
    case "schools":
      return [{ re: /\bschool\b/i, label: "MCPS schools" }];
    default:
      return [
        ...CALENDAR_LABELS,
        ...TRANSPORT_LABELS,
        ...PARENT_LABELS,
        ...ASSIGNMENT_LABELS,
      ];
  }
}

function looksLikeDumpTitle(title: string): boolean {
  if (title.length > 72) return true;
  if (/Montgomery County Public Schools/i.test(title) && title.length > 40) {
    return true;
  }
  if ((title.match(/20\d{2}/g) ?? []).length >= 2) return true;
  if (/July|August|September|October|November|December/i.test(title) && title.length > 50) {
    return true;
  }
  return false;
}

function firstCleanContentLine(content: string): string | null {
  const lines = content
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 12 && l.length <= 90);
  for (const line of lines) {
    if (/cookie|privacy policy|accept all/i.test(line)) continue;
    if (/^https?:\/\//i.test(line)) continue;
    return line.replace(/\s+/g, " ");
  }
  return null;
}

function sentenceMatching(content: string, re: RegExp, max = 220): string | null {
  const parts = content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (re.test(part) && part.length >= 20) {
      return part.length <= max ? part : `${part.slice(0, max).trimEnd()}…`;
    }
  }
  // Also try line-based matches for PDF text without periods.
  for (const line of content.split(/\n+/).map((l) => l.trim())) {
    if (re.test(line) && line.length >= 12) {
      const cleaned = line.replace(/\s+/g, " ");
      return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max).trimEnd()}…`;
    }
  }
  return null;
}

/**
 * Turn scraped/PDF dump titles into short parent-facing card titles.
 */
export function humanizeKnowledgeTitle(args: {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  eventDate?: string | null;
}): string {
  if (args.eventDate) {
    const dated = labelForEventDate({
      title: args.title,
      content: args.content,
      eventDate: args.eventDate,
    });
    if (dated) return dated;
  }

  const blob = `${args.title}\n${args.content}`;
  const category = args.category ?? "";

  // Do not globally prefer "early release" when a specific event date exists
  // but failed local matching — fall through to category labels carefully.
  if (
    !args.eventDate &&
    args.tags?.includes("early_release") &&
    /\bearly release\b/i.test(blob)
  ) {
    return "Early release";
  }
  if (
    !args.eventDate &&
    (args.tags?.includes("no_school") || args.tags?.includes("school_closure")) &&
    /\blabor day\b/i.test(blob)
  ) {
    return "Labor Day — no school";
  }

  for (const rule of labelsForCategory(category)) {
    if (rule.re.test(blob)) return rule.label;
  }

  const raw = args.title.trim().replace(/\s+/g, " ");
  if (!looksLikeDumpTitle(raw)) {
    return raw.slice(0, 80);
  }

  const fromContent = firstCleanContentLine(args.content);
  if (fromContent) return fromContent.slice(0, 80);

  const cut = raw.slice(0, 72);
  const breakAt = Math.max(
    cut.lastIndexOf("—"),
    cut.lastIndexOf("-"),
    cut.lastIndexOf(",")
  );
  if (breakAt > 24) return cut.slice(0, breakAt).trim();
  return `${cut.trimEnd()}…`;
}

/**
 * Build a short parent-facing blurb for a dated calendar-style card.
 */
export function humanizeSummary(
  content: string,
  opts?: {
    title?: string;
    tags?: string[];
    max?: number;
    eventDate?: string | null;
  }
): string {
  const max = opts?.max ?? 180;
  const title = (opts?.title ?? "").toLowerCase();

  if (opts?.eventDate) {
    const dated = labelForEventDate({
      title: opts.title ?? "",
      content,
      eventDate: opts.eventDate,
    });
    if (dated === "First day of school for students") {
      return "First day of school for students.";
    }
    if (dated === "Student Transition Day") {
      return "Student Transition Day for students entering Grades K, 6, and 9, and students new to a school.";
    }
    if (dated === "Early release") {
      return (
        sentenceMatching(content, /\bearly release\b/i, max) ??
        "Early release day for students. Check the official MCPS calendar for dismissal times."
      );
    }
    if (dated) {
      const near = sentenceMatching(
        content,
        new RegExp(dated.split("—")[0]!.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        max
      );
      if (near) return near;
      return `${dated}.`;
    }
  }

  if (opts?.tags?.includes("early_release") || /\bearly release\b/i.test(title)) {
    const hit =
      sentenceMatching(content, /\bearly release\b/i, max) ??
      "MCPS has an early release day. Check the official calendar for dismissal times.";
    return hit;
  }
  if (
    opts?.tags?.includes("no_school") ||
    opts?.tags?.includes("school_closure") ||
    /no school|closed|holiday/i.test(title)
  ) {
    const hit =
      sentenceMatching(
        content,
        /\b(no school|schools? and offices closed|holiday|professional)\b/i,
        max
      ) ?? "MCPS schools are closed or have no school for students on this date.";
    return hit;
  }

  // Avoid leading with glued PDF title dumps.
  let cleaned = content.replace(/\s+/g, " ").trim();
  cleaned = cleaned
    .replace(/^202\d[-–].*?Public Schools\s*/i, "")
    .replace(/^School Calendar\+?\s*/i, "")
    .trim();
  if (cleaned.length <= max) return cleaned || content.slice(0, max);
  return `${cleaned.slice(0, max).trimEnd()}…`;
}

/** Parent-facing date: "Tue, Aug 25" (no year clutter for near-term). */
export function formatParentDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const m = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Only calendar (and clearly dated event/deadline) content should mine
 * opportunistic dates from body text. Evergreen pages like ParentVUE often
 * mention months/years that are not "coming up" events.
 */
export function allowsOpportunisticEventDates(
  category: string,
  tags: string[]
): boolean {
  const cat = category.trim().toLowerCase();
  if (cat === "calendar") return true;
  return tags.some((t) =>
    [
      "early_release",
      "no_school",
      "school_closure",
      "deadline",
      "school_event",
    ].includes(t)
  );
}
