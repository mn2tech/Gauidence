import type { InboxFilterId, InboxMockMessage } from "@/lib/inbox/mockMail";
import { filterInboxMessages } from "@/lib/inbox/mockMail";

export type InboxMessageRow = {
  id: string;
  from_name: string | null;
  from_email: string | null;
  subject: string;
  preview: string;
  received_at: string | null;
  needs_attention: boolean;
  bucket: string | null;
  assigned_space_id: string | null;
  suggested_space_id: string | null;
  label_ids?: string[] | null;
};

export function mapInboxRowToMessage(
  row: InboxMessageRow,
  spaceNames: Map<string, string>
): InboxMockMessage {
  const suggestedId = row.suggested_space_id;
  return {
    id: row.id,
    fromName: row.from_name?.trim() || "Unknown",
    fromEmail: row.from_email?.trim() || "",
    subject: row.subject || "(no subject)",
    preview: row.preview || "",
    receivedAt: row.received_at || new Date(0).toISOString(),
    needsAttention: Boolean(row.needs_attention),
    bucket:
      row.bucket === "bills" || row.bucket === "school" || row.bucket === "work"
        ? row.bucket
        : null,
    assignedSpaceId: row.assigned_space_id,
    suggestedSpaceId: suggestedId,
    suggestedSpaceLabel: suggestedId
      ? spaceNames.get(suggestedId) ?? null
      : null,
  };
}

export function filterMappedInbox(
  messages: InboxMockMessage[],
  filter: InboxFilterId
): InboxMockMessage[] {
  return filterInboxMessages(messages, filter);
}
