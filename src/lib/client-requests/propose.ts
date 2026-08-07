import {
  CLIENT_REQUEST_STATUS_LABELS,
  isClientRequestStatus,
  type ClientRequestStatus,
} from "./types";
import { wantsClientRequestCreate } from "./proposeCreate";

export type ProposedClientRequestReply = {
  requestId: string;
  content: string;
  status?: ClientRequestStatus;
};

const CLIENT_REQUEST_REPLY_INTENT =
  /\b(reply|respond|answer|message|tell|update)\b.{0,48}\b(client|request|requests|ticket|tickets|customer)\b/i;

const CLIENT_REQUEST_STATUS_INTENT =
  /\b(status|update)\b.{0,32}\b(request|requests|ticket|tickets|client\s+request)\b/i;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when the user wants Gideon to draft a client request thread reply. */
export function wantsClientRequestReply(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  if (wantsClientRequestCreate(q)) return false;
  return (
    CLIENT_REQUEST_REPLY_INTENT.test(q) || CLIENT_REQUEST_STATUS_INTENT.test(q)
  );
}

export function clientRequestReplySystemNote(): string {
  return `Client request reply mode:
The user wants help with a client request or ticket thread. Use CLIENT REQUESTS below for context. Answer briefly, then if you can draft a message for the request thread, end with exactly:

## PROPOSED CLIENT REQUEST REPLY
request_id: <uuid from CLIENT REQUESTS>
content: <reply to post in the conversation — plain text, no markdown headers>
status: open | in_progress | resolved

Include status only when it should change. Never invent request facts or ids — omit the section if you cannot name a request_id from CLIENT REQUESTS. Do not post the reply yourself — the user will confirm in the app.`;
}

const SECTION_START = /^#{1,3}\s*PROPOSED CLIENT REQUEST REPLY\s*$/i;

function trimField(value: string | undefined, max = 4000): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max) : t;
}

/** Pull a structured client request reply from Gideon markdown. */
export function parseProposedClientRequestReply(
  content: string,
  fallbackRequestId?: string | null
): ProposedClientRequestReply | null {
  const lines = content.split(/\r?\n/);
  const i = lines.findIndex((line) => SECTION_START.test(line.trim()));
  if (i < 0) return null;

  const fields: Record<string, string> = {};
  const contentLines: string[] = [];
  let collectingContent = false;

  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j]!;
    const trimmed = line.trim();
    if (/^#{1,3}\s+/.test(trimmed)) break;

    if (collectingContent) {
      contentLines.push(line);
      continue;
    }

    if (!trimmed) continue;

    const m = /^(request_id|status|content)\s*:\s*(.*)$/i.exec(trimmed);
    if (m) {
      const key = m[1]!.toLowerCase().replace(/_/g, "");
      const val = m[2]!.trim();
      if (key === "content") {
        collectingContent = true;
        if (val) contentLines.push(val);
      } else {
        fields[key] = val;
      }
      continue;
    }

    if (fields.content !== undefined) {
      collectingContent = true;
      contentLines.push(line);
    }
  }

  const requestId = (
    fields.requestid?.trim() ||
    fallbackRequestId?.trim() ||
    ""
  ).trim();
  if (!UUID_RE.test(requestId)) return null;

  const contentText = trimField(contentLines.join("\n").trim());
  if (!contentText) return null;

  const statusRaw = (fields.status ?? "").trim().toLowerCase();
  let status: ClientRequestStatus | undefined;
  if (statusRaw && isClientRequestStatus(statusRaw)) {
    status = statusRaw;
  }

  return { requestId, content: contentText, status };
}

/** Remove the proposal section from displayed chat text. */
export function stripProposedClientRequestReplySection(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (SECTION_START.test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^#{1,3}\s+\S/.test(line.trim())) {
        skipping = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n").trim();
}

export function proposedClientRequestReplySummary(
  proposal: ProposedClientRequestReply,
  requestTitle?: string | null
): string {
  const title = requestTitle?.trim();
  const head = title ? `Reply on "${title}"` : `Reply on request ${proposal.requestId.slice(0, 8)}…`;
  const statusNote = proposal.status
    ? ` · status → ${CLIENT_REQUEST_STATUS_LABELS[proposal.status]}`
    : "";
  const preview =
    proposal.content.length > 120
      ? `${proposal.content.slice(0, 117)}…`
      : proposal.content;
  return `${head}${statusNote}: ${preview}`;
}
