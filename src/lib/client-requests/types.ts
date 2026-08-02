import { profileMentionedInQuestion } from "@/lib/vault/detectVaultScope";

export const CLIENT_REQUEST_STATUSES = [
  "open",
  "in_progress",
  "resolved",
] as const;

export type ClientRequestStatus = (typeof CLIENT_REQUEST_STATUSES)[number];

export type ClientRequest = {
  id: string;
  profile_id: string;
  created_by: string;
  title: string;
  description: string;
  status: ClientRequestStatus;
  document_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

export type ClientRequestComment = {
  id: string;
  request_id: string;
  author_user_id: string;
  content: string;
  created_at: string;
};

export type ClientRequestWithMeta = ClientRequest & {
  profile_name?: string;
  comment_count?: number;
};

export const CLIENT_REQUEST_STATUS_LABELS: Record<ClientRequestStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export function isClientRequestStatus(v: unknown): v is ClientRequestStatus {
  return (
    typeof v === "string" &&
    (CLIENT_REQUEST_STATUSES as readonly string[]).includes(v)
  );
}

export type ClientRequestRelevanceContext = {
  authorName?: string | null;
  vaultName?: string | null;
};

const REQUEST_AUTHOR_INTENT =
  /\b(added|created|wrote|posted|submitted|logged|authored|entered|asked|opened)\b/i;

const REQUEST_INTENT =
  /\b(request|requests|issue|issues|ticket|tickets|submitted|asked|need|help|support)\b/i;

/** Score a client request against a query for Gideon retrieval (higher = better). */
export function scoreClientRequestRelevance(
  request: Pick<ClientRequest, "title" | "description" | "status">,
  question: string,
  context?: ClientRequestRelevanceContext
): number {
  const q = question.toLowerCase();
  const tokens = q
    .split(/[^a-z0-9#]+/i)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return 0;

  const hay = [
    request.title,
    request.description,
    request.status.replace(/_/g, " "),
    context?.authorName ?? "",
    context?.vaultName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 2;
  }

  const authorName = context?.authorName?.trim();
  if (authorName && profileMentionedInQuestion(question, authorName)) {
    score += 8;
    if (REQUEST_AUTHOR_INTENT.test(question)) score += 6;
  }

  const vaultName = context?.vaultName?.trim();
  if (vaultName && profileMentionedInQuestion(question, vaultName)) {
    score += 6;
  }

  if (REQUEST_INTENT.test(question)) score += 2;
  if (/\bopen\b/i.test(question) && request.status === "open") score += 4;
  if (/\bresolved\b/i.test(question) && request.status === "resolved") score += 4;
  if (/\bin[- ]progress\b/i.test(question) && request.status === "in_progress") {
    score += 4;
  }

  return score;
}
