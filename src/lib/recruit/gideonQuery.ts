import {
  RECOMMENDATION_LABELS,
  effectiveCandidateScore,
  type CandidateWithDetails,
  type RecruitmentJob,
} from "./types";

export type RecruitGideonIntent =
  | "list_jobs"
  | "candidates"
  | "top_matches"
  | "shortlist"
  | "candidate_lookup"
  | "unknown";

export type RecruitGideonParseResult = {
  intent: RecruitGideonIntent;
  jobTitle?: string;
  candidateName?: string;
  reviewStatus?: "shortlisted" | "declined";
  confirmed?: boolean;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
};

const RECRUIT_KEYWORDS =
  /\b(recruit(ment|ing)?|hiring (jobs?|roles?|pipeline|candidates?)|shortlist|resumes? for)\b/i;

const LIST_JOBS =
  /\b(recruit(ment|ing)?|hiring)\b.{0,40}\b(jobs?|roles?|openings?|positions?|pipeline)\b|\b(jobs?|roles?|openings?|positions?) (in |from |on )?(recruit|hiring)\b|\bshow (me )?(my |our )?(open )?(recruit|hiring)\b/i;

const TOP_MATCHES =
  /\b(top|best|strong) (candidates?|matches?|resumes?)\b/i;

const CANDIDATES =
  /\bcandidates?\b.{0,40}\b(job|role|recruit|hiring|position|for)\b|\bwho (applied|are the (top )?candidates)\b|\bresumes? for\b/i;

const SHORTLIST_WRITE =
  /\b(shortlist|decline)\b.{0,60}\b(candidate|resume)?/i;

const SHORTLIST_READ =
  /\b(who(?:'s| is| are)? (on )?(the )?shortlist|show (me )?(the )?shortlist)\b/i;

const CANDIDATE_LOOKUP =
  /\b(tell me about|what about|show(?: me)?)\b.{0,40}\b(candidate|resume)\b|\bcandidate (?:named |called )?(.+)/i;

function hasExplicitConfirmation(q: string): boolean {
  return /\b(yes|yep|yeah|confirm|go ahead|do it|please)\b/i.test(q);
}

function extractQuotedOrAfter(text: string, verb: RegExp): string | undefined {
  const quoted = text.match(/"([^"]{2,80})"/);
  if (quoted?.[1]) return quoted[1].trim();
  const afterFor = text.match(
    new RegExp(`${verb.source}.{0,10}(?:for|on|named|called)?\\s+(.+)$`, "i")
  );
  const raw = afterFor?.[1]?.trim();
  if (!raw) return undefined;
  return raw
    .replace(/\b(the|a|an|job|role|candidate|resume|please|recruit(ment|ing)?)\b/gi, " ")
    .replace(/[?.!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || undefined;
}

export function wantsRecruitQuery(question: string): boolean {
  const parsed = parseRecruitGideonQuery(question);
  if (parsed.intent !== "unknown") return true;
  return RECRUIT_KEYWORDS.test(question);
}

export function parseRecruitGideonQuery(query: string): RecruitGideonParseResult {
  const q = query.trim();
  const confirmed = hasExplicitConfirmation(q);

  if (/\byes,?\s+shortlist\b/i.test(q)) {
    return {
      intent: "shortlist",
      candidateName: extractQuotedOrAfter(q, /shortlist/i),
      reviewStatus: "shortlisted",
      confirmed: true,
      requiresConfirmation: false,
    };
  }

  if (/\byes,?\s+decline\b/i.test(q)) {
    return {
      intent: "shortlist",
      candidateName: extractQuotedOrAfter(q, /decline/i),
      reviewStatus: "declined",
      confirmed: true,
      requiresConfirmation: false,
    };
  }

  if (/\bshortlist\b/i.test(q) && !SHORTLIST_READ.test(q)) {
    const candidateName = extractQuotedOrAfter(q, /shortlist/i);
    return {
      intent: "shortlist",
      candidateName,
      jobTitle: extractQuotedOrAfter(q, /(?:for|on) (?:the )?(?:job|role)/i),
      reviewStatus: "shortlisted",
      confirmed,
      requiresConfirmation: Boolean(candidateName) && !confirmed,
      confirmationMessage: candidateName
        ? `Shortlist ${candidateName}? Reply "yes, shortlist" to confirm.`
        : undefined,
    };
  }

  if (/\bdecline\b.{0,40}\b(candidate|resume)\b/i.test(q)) {
    const candidateName = extractQuotedOrAfter(q, /decline/i);
    return {
      intent: "shortlist",
      candidateName,
      reviewStatus: "declined",
      confirmed,
      requiresConfirmation: Boolean(candidateName) && !confirmed,
      confirmationMessage: candidateName
        ? `Decline ${candidateName}? Reply "yes, decline" to confirm.`
        : undefined,
    };
  }

  if (SHORTLIST_READ.test(q) || (/\bshortlist\b/i.test(q) && !SHORTLIST_WRITE.test(q))) {
    return {
      intent: "shortlist",
      jobTitle: extractQuotedOrAfter(q, /shortlist/i),
      requiresConfirmation: false,
    };
  }

  if (TOP_MATCHES.test(q)) {
    return {
      intent: "top_matches",
      jobTitle: extractQuotedOrAfter(q, /(?:for|on)/i),
      requiresConfirmation: false,
    };
  }

  if (CANDIDATE_LOOKUP.test(q)) {
    return {
      intent: "candidate_lookup",
      candidateName: extractQuotedOrAfter(q, /(?:candidate|resume|about)/i),
      requiresConfirmation: false,
    };
  }

  if (CANDIDATES.test(q)) {
    return {
      intent: "candidates",
      jobTitle: extractQuotedOrAfter(q, /(?:candidates?|resumes?)/i),
      requiresConfirmation: false,
    };
  }

  if (LIST_JOBS.test(q) || RECRUIT_KEYWORDS.test(q)) {
    return { intent: "list_jobs", requiresConfirmation: false };
  }

  return { intent: "unknown", requiresConfirmation: false };
}

export function formatRecruitJobs(jobs: RecruitmentJob[]): string {
  if (!jobs.length) {
    return "No recruitment jobs yet. Open Recruit to create one.\n\n→ /recruit";
  }
  const lines = [`Recruit jobs (${jobs.length}):`];
  for (const job of jobs.slice(0, 8)) {
    const loc = job.location ? ` · ${job.location}` : "";
    lines.push(`• ${job.title}${loc} · ${job.status.replace(/_/g, " ")}`);
  }
  lines.push("", "→ /recruit");
  return lines.join("\n");
}

export function formatCandidateLine(
  candidate: CandidateWithDetails,
  jobTitle?: string
): string {
  const name =
    candidate.display_name?.trim() ||
    candidate.extraction?.candidate_name?.trim() ||
    "Unnamed candidate";
  const score = effectiveCandidateScore(candidate.score);
  const rec = candidate.score?.recommendation_status
    ? RECOMMENDATION_LABELS[candidate.score.recommendation_status]
    : candidate.review_status.replace(/_/g, " ");
  const scoreBit = typeof score === "number" ? ` · ${Math.round(score)}` : "";
  const jobBit = jobTitle ? ` · ${jobTitle}` : "";
  return `${name}${scoreBit} · ${rec}${jobBit}`;
}

export function formatRecruitCandidates(
  job: RecruitmentJob,
  candidates: CandidateWithDetails[],
  limit = 8
): string {
  if (!candidates.length) {
    return `No candidates yet for ${job.title}. Open Recruit to upload resumes.\n\n→ /recruit/${job.id}`;
  }
  const ranked = [...candidates].sort((a, b) => {
    return (effectiveCandidateScore(b.score) ?? -1) - (effectiveCandidateScore(a.score) ?? -1);
  });
  return [
    `${job.title} candidates (${candidates.length}):`,
    ...ranked.slice(0, limit).map((c) => `• ${formatCandidateLine(c)}`),
    "",
    `→ /recruit/${job.id}`,
  ].join("\n");
}

export function formatRecruitShortlist(
  job: RecruitmentJob,
  candidates: CandidateWithDetails[]
): string {
  const shortlisted = candidates.filter((c) => c.review_status === "shortlisted");
  if (!shortlisted.length) {
    return `No one is shortlisted for ${job.title} yet.\n\n→ /recruit/${job.id}`;
  }
  return [
    `${job.title} shortlist (${shortlisted.length}):`,
    ...shortlisted.map((c) => `• ${formatCandidateLine(c)}`),
    "",
    `→ /recruit/${job.id}`,
  ].join("\n");
}

export const RECRUIT_AGENT_SYSTEM_NOTE = `When the user asks about Recruit, hiring jobs, candidates, or shortlists, use Guardian Recruit for this workspace.
Do not invent scores or candidates. Open /recruit for resume upload, analysis, and reports.
Shortlisting or declining a candidate requires an explicit yes from the user.`;
