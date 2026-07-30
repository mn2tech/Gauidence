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
