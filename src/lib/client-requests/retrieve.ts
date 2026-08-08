import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { collaboratorDisplayName } from "@/lib/profiles/collaboratorDisplay";
import { loadCollaboratorMemberAccounts } from "@/lib/profiles/collaboratorMembers";
import { profileMentionedInQuestion } from "@/lib/vault/detectVaultScope";
import {
  CLIENT_REQUEST_STATUS_LABELS,
  scoreClientRequestRelevance,
  type ClientRequest,
  type ClientRequestComment,
} from "./types";

const REQUEST_SELECT =
  "id, profile_id, created_by, title, description, status, document_id, assigned_to_user_id, created_at, updated_at, resolved_at";

const COMMENT_SELECT =
  "id, request_id, author_user_id, content, created_at";

export type ClientRequestWithComments = ClientRequest & {
  comments: ClientRequestComment[];
};

export type RetrievedClientRequests = {
  requests: ClientRequestWithComments[];
  authorNames: Record<string, string>;
};

function requestsByMentionedAuthor(
  requests: ClientRequest[],
  question: string,
  authorNames: Record<string, string>
): ClientRequest[] {
  return requests.filter((request) => {
    const name = authorNames[request.created_by];
    return name && profileMentionedInQuestion(question, name);
  });
}

function mentionedVaultProfileIds(
  question: string,
  profileIds: string[],
  profileNames?: Record<string, string>
): string[] {
  if (!profileNames) return [];
  return profileIds.filter((id) => {
    const name = profileNames[id]?.trim();
    return name && profileMentionedInQuestion(question, name);
  });
}

function recentWindowStart(days = 120): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/** Retrieve relevant client requests for Gideon (client vaults only). */
export async function retrieveRelevantClientRequests(
  supabase: SupabaseClient,
  args: {
    clientProfileIds: string[];
    profileNames?: Record<string, string>;
    question: string;
    limit?: number;
  }
): Promise<RetrievedClientRequests> {
  const limit = args.limit ?? 6;
  const clientProfileIds = [...new Set(args.clientProfileIds.filter(Boolean))];
  if (clientProfileIds.length === 0) {
    return { requests: [], authorNames: {} };
  }

  const windowStart = recentWindowStart();
  const { data, error } = await supabase
    .from("client_requests")
    .select(REQUEST_SELECT)
    .in("profile_id", clientProfileIds)
    .gte("updated_at", windowStart)
    .order("updated_at", { ascending: false })
    .limit(Math.min(40 * clientProfileIds.length, 120));

  if (error || !data?.length) {
    return { requests: [], authorNames: {} };
  }

  const requests = data as ClientRequest[];
  const creatorIds = [...new Set(requests.map((row) => row.created_by))];
  const authorAccounts = await loadCollaboratorMemberAccounts(creatorIds);
  const authorNames = Object.fromEntries(
    creatorIds.map((id) => [
      id,
      collaboratorDisplayName(authorAccounts.get(id)),
    ])
  );

  const mentionedVaultIds = mentionedVaultProfileIds(
    args.question,
    clientProfileIds,
    args.profileNames
  );

  const scored = requests
    .map((request) => ({
      request,
      score:
        scoreClientRequestRelevance(request, args.question, {
          authorName: authorNames[request.created_by],
          vaultName: args.profileNames?.[request.profile_id],
        }) + (mentionedVaultIds.includes(request.profile_id) ? 4 : 0),
    }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.request.updated_at.localeCompare(a.request.updated_at)
    );

  let selected: ClientRequest[] = [];
  if (scored.length > 0) {
    selected = scored.slice(0, limit).map((row) => row.request);
  } else {
    const authorMatched = requestsByMentionedAuthor(
      requests,
      args.question,
      authorNames
    );
    if (authorMatched.length > 0) {
      const vaultFiltered =
        mentionedVaultIds.length === 1
          ? authorMatched.filter(
              (request) => request.profile_id === mentionedVaultIds[0]
            )
          : authorMatched;
      selected = (vaultFiltered.length > 0 ? vaultFiltered : authorMatched).slice(
        0,
        limit
      );
    } else if (mentionedVaultIds.length === 1) {
      selected = requests
        .filter((request) => request.profile_id === mentionedVaultIds[0])
        .slice(0, limit);
    } else if (
      /\b(request|requests|issue|ticket|client|submitted|asked|open|resolved)\b/i.test(
        args.question
      )
    ) {
      selected = requests.slice(0, Math.min(5, limit));
    } else {
      selected = requests.slice(0, Math.min(3, limit));
    }
  }

  if (selected.length === 0) {
    return { requests: [], authorNames };
  }

  const requestIds = selected.map((request) => request.id);
  const { data: commentRows } = await supabase
    .from("client_request_comments")
    .select(COMMENT_SELECT)
    .in("request_id", requestIds)
    .order("created_at", { ascending: true });

  const commentAuthorIds = [
    ...new Set((commentRows ?? []).map((row) => String(row.author_user_id))),
  ];
  const commentAccounts = await loadCollaboratorMemberAccounts(commentAuthorIds);
  for (const id of commentAuthorIds) {
    if (!authorNames[id]) {
      authorNames[id] = collaboratorDisplayName(commentAccounts.get(id));
    }
  }

  const commentsByRequest = new Map<string, ClientRequestComment[]>();
  for (const row of commentRows ?? []) {
    const requestId = String(row.request_id);
    const list = commentsByRequest.get(requestId) ?? [];
    list.push(row as ClientRequestComment);
    commentsByRequest.set(requestId, list);
  }

  const requestsWithComments: ClientRequestWithComments[] = selected.map(
    (request) => ({
      ...request,
      comments: (commentsByRequest.get(request.id) ?? []).slice(-5),
    })
  );

  return { requests: requestsWithComments, authorNames };
}

/** Open / in-progress requests for Gideon context (business monitoring). */
export async function loadActiveClientRequestsForGideon(
  supabase: SupabaseClient,
  clientProfileIds: string[],
  limit = 8
): Promise<ClientRequestWithComments[]> {
  const ids = [...new Set(clientProfileIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("client_requests")
    .select(REQUEST_SELECT)
    .in("profile_id", ids)
    .in("status", ["open", "in_progress"])
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  const requests = data as ClientRequest[];
  const requestIds = requests.map((r) => r.id);
  const { data: commentRows } = await supabase
    .from("client_request_comments")
    .select(COMMENT_SELECT)
    .in("request_id", requestIds)
    .order("created_at", { ascending: true });

  const commentsByRequest = new Map<string, ClientRequestComment[]>();
  for (const row of commentRows ?? []) {
    const requestId = String(row.request_id);
    const list = commentsByRequest.get(requestId) ?? [];
    list.push(row as ClientRequestComment);
    commentsByRequest.set(requestId, list);
  }

  return requests.map((request) => ({
    ...request,
    comments: (commentsByRequest.get(request.id) ?? []).slice(-5),
  }));
}

/** Merge active open requests with relevance-scored picks (dedupe by id). */
export function mergeClientRequestsForGideon(
  primary: ClientRequestWithComments[],
  supplemental: ClientRequestWithComments[],
  limit = 8
): ClientRequestWithComments[] {
  const seen = new Set<string>();
  const out: ClientRequestWithComments[] = [];
  for (const list of [primary, supplemental]) {
    for (const request of list) {
      if (seen.has(request.id)) continue;
      seen.add(request.id);
      out.push(request);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function formatClientRequestsForGideon(
  requests: ClientRequestWithComments[],
  profileNames?: Record<string, string>,
  authorNames?: Record<string, string>,
  assigneeNames?: Record<string, string>
): string {
  if (requests.length === 0) return "";
  return requests
    .map((request) => {
      const spaceLabel =
        profileNames?.[request.profile_id]?.trim() ||
        (profileNames ? "linked client space" : "");
      const spaceTag = spaceLabel ? ` | space: ${spaceLabel}` : "";
      const author = authorNames?.[request.created_by]?.trim();
      const submittedBy = author ? ` | submitted by: ${author}` : "";
      const assignee = request.assigned_to_user_id
        ? assigneeNames?.[request.assigned_to_user_id]?.trim() || "assigned teammate"
        : null;
      const assignedLine = assignee ? ` | assigned to: ${assignee}` : "";
      const status = CLIENT_REQUEST_STATUS_LABELS[request.status];
      const idLine = ` | id: ${request.id}`;
      const commentBlock =
        request.comments.length > 0
          ? `\nRecent replies:\n${request.comments
              .map((comment) => {
                const name =
                  authorNames?.[comment.author_user_id]?.trim() || "Someone";
                const date = comment.created_at.slice(0, 10);
                return `- ${name} (${date}): ${comment.content}`;
              })
              .join("\n")}`
          : "";
      return `[Client Request${spaceTag}${submittedBy}${assignedLine}${idLine} | status: ${status} | updated: ${request.updated_at.slice(0, 10)}]\nTitle: ${request.title}\nDescription: ${request.description}${commentBlock}`;
    })
    .join("\n\n---\n\n");
}
