"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Loader2,
  MessageCircle,
  Paperclip,
  Plus,
  Send,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  CLIENT_REQUEST_STATUS_LABELS,
  type ClientRequest,
  type ClientRequestComment,
  type ClientRequestStatus,
} from "@/lib/client-requests/types";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import { documentsHref } from "@/lib/routes";
import {
  uploadAndAnalyzeToVault,
  VAULT_ACCEPTED_TYPES,
} from "@/lib/vault/clientUpload";
import { createClient } from "@/lib/supabase/client";

type RequestWithMeta = ClientRequest & { profile_name?: string | null };

type CommentWithMeta = ClientRequestComment & { author_name?: string };

function statusIcon(status: ClientRequestStatus) {
  if (status === "resolved") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
  }
  if (status === "in_progress") {
    return <CircleDot className="h-4 w-4 text-amber-600" aria-hidden />;
  }
  return <MessageCircle className="h-4 w-4 text-brand" aria-hidden />;
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ClientRequestsScreen() {
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const { active } = useActiveProfile();

  const isBusinessView =
    active != null &&
    isOrgStyleProfile(active.profile_type) &&
    active.profile_type !== "client";
  const isClientVault = active?.profile_type === "client";
  const canUseRequests = isClientVault || isBusinessView;

  const [requests, setRequests] = useState<RequestWithMeta[]>([]);
  const [comments, setComments] = useState<CommentWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const selected = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId]
  );

  const listUrl = isBusinessView
    ? "/api/client-requests?scope=clients"
    : "/api/client-requests";

  useEffect(() => {
    if (searchParams.get("new") === "1" && isClientVault) {
      setShowCreate(true);
    }
  }, [searchParams, isClientVault]);

  const refreshList = useCallback(async () => {
    if (!canUseRequests) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(listUrl);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        requests?: RequestWithMeta[];
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load requests.");
        setRequests([]);
        return;
      }
      setRequests(body.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [canUseRequests, listUrl]);

  const refreshComments = useCallback(async (requestId: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/client-requests/${requestId}/comments`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        comments?: CommentWithMeta[];
      };
      if (res.ok) {
        setComments(body.comments ?? []);
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId) {
      setComments([]);
      return;
    }
    void refreshComments(selectedId);
  }, [selectedId, refreshComments]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
  }, []);

  const createRequest = async () => {
    if (!active || !isClientVault) return;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle || !trimmedDescription) {
      setError("Title and description are required.");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      let documentId: string | null = null;
      if (file && userId) {
        const uploaded = await uploadAndAnalyzeToVault({
          userId,
          profileId: active.id,
          ownerUserId: active.owner_user_id,
          file,
        });
        documentId = uploaded.documentId;
      }

      const res = await fetch("/api/client-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: active.id,
          title: trimmedTitle,
          description: trimmedDescription,
          documentId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        request?: RequestWithMeta;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't create request.");
        return;
      }

      setTitle("");
      setDescription("");
      setFile(null);
      setShowCreate(false);
      await refreshList();
      if (body.request?.id) {
        window.history.replaceState(null, "", `/requests?id=${body.request.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create request.");
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async () => {
    if (!selectedId) return;
    const content = reply.trim();
    if (!content) return;

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/client-requests/${selectedId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't send message.");
        return;
      }
      setReply("");
      await Promise.all([refreshComments(selectedId), refreshList()]);
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (status: ClientRequestStatus) => {
    if (!selectedId) return;
    setStatusBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/client-requests/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        request?: RequestWithMeta;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't update status.");
        return;
      }
      if (body.request) {
        setRequests((prev) =>
          prev.map((r) => (r.id === body.request!.id ? { ...r, ...body.request } : r))
        );
      }
    } finally {
      setStatusBusy(false);
    }
  };

  if (!canUseRequests) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Requests</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Client requests are available in client vaults, or when viewing a business
          vault with linked clients.
        </p>
        <Link
          href="/home"
          className="mt-4 inline-flex text-sm font-semibold text-brand-dark hover:underline"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/requests"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-dark hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            All requests
          </Link>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                {statusIcon(selected.status)}
                <span>{CLIENT_REQUEST_STATUS_LABELS[selected.status]}</span>
                {selected.profile_name ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{selected.profile_name}</span>
                  </>
                ) : null}
              </div>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                {selected.title}
              </h1>
              <p className="mt-1 text-xs text-ink-muted">
                Opened {formatWhen(selected.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["open", "in_progress", "resolved"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={statusBusy || selected.status === status}
                  onClick={() => void updateStatus(status)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    selected.status === status
                      ? "border-brand bg-brand-light text-brand-dark"
                      : "border-stone-300 bg-white text-foreground hover:bg-stone-50"
                  }`}
                >
                  {CLIENT_REQUEST_STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </div>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {selected.description}
          </p>

          {selected.document_id ? (
            <Link
              href={`${documentsHref(selected.profile_id)}&documentId=${selected.document_id}`}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-dark hover:underline"
            >
              <Paperclip className="h-4 w-4" />
              View attached document
            </Link>
          ) : null}
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Conversation</h2>
          {detailLoading ? (
            <p className="mt-3 text-sm text-ink-muted">Loading messages…</p>
          ) : comments.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              No replies yet. Send a message to keep everything in one place.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  className={`rounded-xl px-3 py-2.5 text-sm ${
                    comment.author_user_id === userId
                      ? "bg-brand-light/50"
                      : "bg-stone-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                    <span className="font-medium text-foreground">
                      {comment.author_name ?? "Someone"}
                    </span>
                    <span>{formatWhen(comment.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">
                    {comment.content}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="request-reply" className="sr-only">
              Reply
            </label>
            <textarea
              id="request-reply"
              rows={3}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply…"
              className="min-w-0 flex-1 rounded-xl border border-border-subtle bg-white px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            />
            <button
              type="button"
              disabled={sending || !reply.trim()}
              onClick={() => void sendReply()}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </button>
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {isBusinessView ? "Client requests" : "My requests"}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isBusinessView
              ? "Open requests from your client vaults — no more lost texts or emails."
              : "Send requirements and questions to your company in one thread."}
          </p>
        </div>
        {isClientVault ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" />
            New request
          </button>
        ) : null}
      </div>

      {showCreate && isClientVault ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">New request</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="request-title" className="text-xs font-medium text-ink-muted">
                Title
              </label>
              <input
                id="request-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What do you need?"
                className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
            <div>
              <label
                htmlFor="request-description"
                className="text-xs font-medium text-ink-muted"
              >
                Details
              </label>
              <textarea
                id="request-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what you need, deadlines, or context…"
                className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
              />
            </div>
            <div>
              <label htmlFor="request-file" className="text-xs font-medium text-ink-muted">
                Attachment (optional)
              </label>
              <input
                id="request-file"
                type="file"
                accept={Object.keys(VAULT_ACCEPTED_TYPES).join(",")}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-light file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-dark"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={creating}
                onClick={() => void createRequest()}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Submit request
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setTitle("");
                  setDescription("");
                  setFile(null);
                }}
                className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading requests…</p>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 p-8 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-brand/60" />
          <p className="mt-3 text-sm font-medium text-foreground">No requests yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            {isClientVault
              ? "Create a request when you need something from your company."
              : "When clients submit requests, they'll appear here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {requests.map((request) => (
            <li key={request.id}>
              <Link
                href={`/requests?id=${request.id}`}
                className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand/30 hover:shadow-card"
              >
                <span className="mt-0.5">{statusIcon(request.status)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">
                    {request.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {CLIENT_REQUEST_STATUS_LABELS[request.status]}
                    {request.profile_name ? ` · ${request.profile_name}` : ""}
                    {" · "}
                    {formatWhen(request.updated_at)}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm text-ink-muted">
                    {request.description}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
