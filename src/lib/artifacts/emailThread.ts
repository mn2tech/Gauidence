import type {
  EmailMessage,
  EmailParticipant,
  EmailThreadExtraction,
} from "./types";
import { looksLikeEmailThread, looksLikeSingleEmail } from "./classify";

const SIGNATURE_CUES =
  /^(sent from my |get outlook for |confidentiality notice|this email and any attachments|please consider the environment)/i;

const ORG_HINTS =
  /\b([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.']*){0,4}\s+(?:Chamber of Commerce|Inc\.?|LLC|Corp\.?|Company|Ministr(?:y|ies)|Church|Foundation))\b/g;

/**
 * Extract semantic structure from a pasted email or email thread.
 * Signatures and repeated quoted blocks are reduced, not treated as events.
 */
export function extractEmailThread(text: string): EmailThreadExtraction | null {
  const raw = text.trim();
  if (!raw || (!looksLikeEmailThread(raw) && !looksLikeSingleEmail(raw))) {
    return null;
  }

  const cleaned = stripDuplicateSignatures(raw);
  const messages = splitEmailMessages(cleaned);
  const participants = collectParticipants(messages, cleaned);
  const organizations = collectOrganizations(cleaned);
  const subject = messages.find((m) => m.subject)?.subject;
  const dates = [
    ...new Set(
      messages.map((m) => m.date).filter((d): d is string => Boolean(d))
    ),
  ];

  const bodyText = messages.map((m) => m.body).join("\n");
  const questions = extractQuestions(bodyText);
  const requests = extractRequests(bodyText);
  const appointments = extractAppointments(bodyText);
  const tasks = extractTasks(bodyText);
  const deadlines = extractDeadlines(bodyText);
  const commitments = extractCommitments(bodyText);
  const timeAmbiguities = detectTimeAmbiguities(bodyText);

  return {
    sourceType: "email_thread",
    participants,
    organizations,
    subject,
    dates,
    messages,
    questions,
    requests,
    commitments,
    appointments,
    tasks,
    deadlines,
    timeAmbiguities,
  };
}

/** Format a short semantic summary for Gideon / debug. */
export function formatEmailThreadSemantics(
  extraction: EmailThreadExtraction
): string {
  const people = extraction.participants
    .map((p) => p.name)
    .filter(Boolean)
    .slice(0, 12);
  const lines = [
    `Artifact type: email_thread`,
    extraction.subject ? `Subject: ${extraction.subject}` : null,
    people.length ? `People: ${[...new Set(people)].join(", ")}` : null,
    extraction.organizations.length
      ? `Organizations: ${extraction.organizations.join(", ")}`
      : null,
    extraction.appointments.length
      ? `Appointments: ${extraction.appointments.join("; ")}`
      : null,
    extraction.timeAmbiguities.length
      ? `Time ambiguities to verify: ${extraction.timeAmbiguities.join("; ")}`
      : null,
    extraction.questions.length
      ? `Questions: ${extraction.questions.slice(0, 5).join(" | ")}`
      : null,
    extraction.requests.length
      ? `Requests: ${extraction.requests.slice(0, 5).join(" | ")}`
      : null,
    extraction.tasks.length
      ? `Tasks: ${extraction.tasks.slice(0, 5).join(" | ")}`
      : null,
    `Messages in thread: ${extraction.messages.length}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function splitEmailMessages(text: string): EmailMessage[] {
  const parts = text.split(
    /(?:^|\n)(?=(?:From\s*:|-{2,}\s*Original Message\s*-{2,}|Begin forwarded message))/i
  );
  const chunks =
    parts.length > 1
      ? parts.map((p) => p.trim()).filter(Boolean)
      : [text.trim()];

  return chunks.map((chunk, index) => {
    const headers = parseHeaders(chunk);
    const body = stripHeadersAndSignature(chunk);
    return {
      index,
      from: headers.from,
      to: headers.to,
      cc: headers.cc,
      date: headers.date,
      subject: headers.subject,
      body,
    };
  });
}

function parseHeaders(chunk: string): {
  from?: string;
  to?: string[];
  cc?: string[];
  date?: string;
  subject?: string;
} {
  const from = matchHeader(chunk, "from");
  const to = splitAddresses(matchHeader(chunk, "to"));
  const cc = splitAddresses(matchHeader(chunk, "cc"));
  const date =
    matchHeader(chunk, "date") ?? matchHeader(chunk, "sent") ?? undefined;
  const subject = matchHeader(chunk, "subject") ?? undefined;
  return { from, to, cc, date, subject };
}

function matchHeader(chunk: string, name: string): string | undefined {
  const re = new RegExp(`^${name}\\s*:\\s*(.+)$`, "im");
  const m = chunk.match(re);
  return m?.[1]?.trim() || undefined;
}

function splitAddresses(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripHeadersAndSignature(chunk: string): string {
  const lines = chunk.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^(from|to|cc|bcc|subject|sent|date|reply-to)\s*:/i.test(line)) {
      i += 1;
      continue;
    }
    if (!line.trim()) {
      i += 1;
      break;
    }
    break;
  }
  const bodyLines = lines.slice(i);
  const withoutSig = dropTrailingSignature(bodyLines);
  // Drop nested quoted reply lines that are pure signature noise
  return withoutSig
    .filter((line) => !SIGNATURE_CUES.test(line.trim()))
    .join("\n")
    .trim();
}

function dropTrailingSignature(lines: string[]): string[] {
  const cut = lines.findIndex((line) => SIGNATURE_CUES.test(line.trim()));
  if (cut >= 0 && cut > lines.length * 0.4) {
    return lines.slice(0, cut);
  }
  // Common "-- " signature delimiter
  const dash = lines.findIndex((line) => /^--\s*$/.test(line.trim()));
  if (dash >= 0 && dash > 2) return lines.slice(0, dash);
  return lines;
}

function stripDuplicateSignatures(text: string): string {
  const lines = text.split(/\r?\n/);
  const seenSigBlocks = new Set<string>();
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (SIGNATURE_CUES.test(line.trim()) || /^--\s*$/.test(line.trim())) {
      const block = lines.slice(i, i + 8).join("\n").toLowerCase();
      const key = block.slice(0, 120);
      if (seenSigBlocks.has(key)) {
        i += 8;
        continue;
      }
      seenSigBlocks.add(key);
    }
    out.push(line);
    i += 1;
  }
  return out.join("\n");
}

function collectParticipants(
  messages: EmailMessage[],
  fullText: string
): EmailParticipant[] {
  const byKey = new Map<string, EmailParticipant>();

  function add(raw: string | undefined, role: EmailParticipant["role"]) {
    if (!raw) return;
    const { name, email } = parsePerson(raw);
    if (!name && !email) return;
    const key = (email || name).toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.email && email) existing.email = email;
      return;
    }
    byKey.set(key, { name: name || email!, email, role });
  }

  for (const m of messages) {
    add(m.from, "from");
    for (const t of m.to ?? []) add(t, "to");
    for (const c of m.cc ?? []) add(c, "cc");
  }

  // Mentioned first names in body (Sarah, etc.)
  for (const m of fullText.matchAll(
    /\b(?:whether|if|ask|tell|invite|include|does|can|should)\s+([A-Z][a-z]{2,})\b/g
  )) {
    const name = m[1]!;
    if (/^(From|To|Subject|Thanks|Hello|Hi|Dear|Please)$/.test(name)) continue;
    const key = name.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, { name, role: "mentioned" });
    }
  }
  // Parenthetical introductions: Sarah (our other Chamber employee)
  for (const m of fullText.matchAll(
    /\b([A-Z][a-z]{2,})\s*\((?:our|the|a|an)\b[^)]{0,60}\)/g
  )) {
    const name = m[1]!;
    const key = name.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, { name, role: "mentioned" });
    }
  }

  return [...byKey.values()];
}

function parsePerson(raw: string): { name: string; email?: string } {
  const emailMatch = raw.match(/<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i);
  const email = emailMatch?.[1];
  let name = raw
    .replace(/<[^>]+>/g, "")
    .replace(email ?? "", "")
    .replace(/[<>"]/g, "")
    .trim();
  if (!name && email) name = email.split("@")[0] ?? email;
  return { name, email };
}

function collectOrganizations(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(ORG_HINTS)) {
    found.add(m[1]!.replace(/\s+/g, " ").trim());
  }
  if (/\bNM2TECH\b/i.test(text)) found.add("NM2TECH");
  if (/\bOlney Chamber\b/i.test(text)) {
    found.add("Olney Chamber of Commerce");
  }
  return [...found].slice(0, 12);
}

function extractQuestions(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.replace(/^>\s*/, "").trim();
    if (t.includes("?") && t.length > 12 && t.length < 280) {
      out.push(t);
    }
  }
  return [...new Set(out)].slice(0, 10);
}

function extractRequests(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /(?:please|could you|can you|would you|let me know(?: if)?)\b[^.?\n]{8,200}[.?]/gi
  )) {
    out.push(m[0]!.replace(/\s+/g, " ").trim());
  }
  return [...new Set(out)].slice(0, 8);
}

function extractAppointments(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /\b((?:this )?(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})(?:[^\n.]{0,40}?\b(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?))?/gi
  )) {
    out.push(m[0]!.replace(/\s+/g, " ").trim());
  }
  return [...new Set(out)].slice(0, 8);
}

function extractTasks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /\b(?:action item|please (?:reply|confirm|send|update)|need(?:s)? to (?:reply|confirm|attend|respond))\b[^.?\n]{0,160}/gi
  )) {
    out.push(m[0]!.replace(/\s+/g, " ").trim());
  }
  return [...new Set(out)].slice(0, 8);
}

function extractDeadlines(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /\b(?:by|before|due)\s+(?:EOD|end of day|(?:Monday|Tuesday|Wednesday|Thursday|Friday)|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b[^.?\n]{0,40}/gi
  )) {
    out.push(m[0]!.replace(/\s+/g, " ").trim());
  }
  return [...new Set(out)].slice(0, 6);
}

function extractCommitments(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /\b(?:I(?:'| a)?ll|we will|I can|happy to)\b[^.?\n]{8,160}/gi
  )) {
    out.push(m[0]!.replace(/\s+/g, " ").trim());
  }
  return [...new Set(out)].slice(0, 6);
}

/** Flag suspicious PM times in business meeting email contexts. */
export function detectTimeAmbiguities(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /\b(\d{1,2}:\d{2}\s*PM)\b/gi
  )) {
    const raw = m[1]!;
    const hour = Number(raw.match(/^(\d{1,2})/)?.[1] ?? 0);
    // Business daytime meetings written as PM between 10–11 are often AM typos
    if (
      hour >= 10 &&
      hour <= 11 &&
      /\b(meeting|office|session|attend|Thursday|Tuesday|Wednesday|Monday|Friday)\b/i.test(
        text
      )
    ) {
      out.push(
        `${raw} appears in a business meeting context — confirm whether AM was intended`
      );
    }
  }
  return [...new Set(out)];
}
