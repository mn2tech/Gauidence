"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  KnowledgeItemRow,
  KnowledgeSourceRow,
  KnowledgeSourceVersionRow,
} from "@/lib/knowledge-studio/projects/types";

type ReviewPayload = {
  source: KnowledgeSourceRow;
  versions: KnowledgeSourceVersionRow[];
  current_version: KnowledgeSourceVersionRow | null;
  published_version: KnowledgeSourceVersionRow | null;
  items: KnowledgeItemRow[];
  change_required: boolean;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "published") return "bg-emerald-100 text-emerald-900 border-emerald-300";
  if (s === "approved") return "bg-sky-100 text-sky-900 border-sky-300";
  if (s === "needs_review" || s === "draft")
    return "bg-amber-100 text-amber-900 border-amber-300";
  if (s === "rejected" || s === "failed")
    return "bg-red-100 text-red-900 border-red-300";
  return "bg-stone-100 text-stone-700 border-stone-300";
}

export default function SourceReviewClient({
  projectSlug,
  sourceId,
}: {
  projectSlug: string;
  sourceId: string;
}) {
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editEvidence, setEditEvidence] = useState("");

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(
      `/api/knowledge-studio/projects/${projectSlug}/sources/${sourceId}`,
      { cache: "no-store" }
    );
    const body = (await res.json().catch(() => ({}))) as ReviewPayload & {
      error?: string;
    };
    if (!res.ok) {
      setError(body.error ?? "Could not load source.");
      setLoading(false);
      return;
    }
    setData(body);
    setLoading(false);
  }, [projectSlug, sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchItem(itemId: string, body: Record<string, unknown>) {
    setBusy(itemId);
    setError(null);
    try {
      const res = await fetch(
        `/api/knowledge-studio/projects/${projectSlug}/items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Update failed.");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function sourceAction(action: "approve_all" | "publish_approved") {
    setBusy(action);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(
        `/api/knowledge-studio/projects/${projectSlug}/sources/${sourceId}/actions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            version_id: data?.current_version?.id,
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        count?: number;
        published?: number;
      };
      if (!res.ok) {
        setError(json.error ?? "Action failed.");
        return;
      }
      setNote(
        action === "approve_all"
          ? `Approved ${json.count ?? 0} item(s).`
          : `Published ${json.published ?? 0} item(s).`
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function refreshSource() {
    setBusy("refresh");
    setError(null);
    setNote(null);
    try {
      const res = await fetch(
        `/api/knowledge-studio/projects/${projectSlug}/sources/${sourceId}/refresh`,
        { method: "POST" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Refresh failed.");
        return;
      }
      setNote(json.message ?? "Refresh complete.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-ink-muted">Loading review…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-red-700">{error ?? "Source not found."}</p>
    );
  }

  const { source, versions, current_version, published_version, items } = data;
  const reviewItems = items.filter(
    (i) =>
      !current_version ||
      !i.version_id ||
      i.version_id === current_version.id ||
      i.status === "published"
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/knowledge-studio/${projectSlug}`}
          className="text-sm font-medium text-brand hover:underline"
        >
          ← Back to project
        </Link>
        <button
          type="button"
          disabled={busy === "refresh"}
          onClick={() => void refreshSource()}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50 disabled:opacity-60"
        >
          {busy === "refresh" ? "Refreshing…" : "Refresh source"}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {note}
        </p>
      ) : null}
      {data.change_required ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
          Source changed — review required. Compare the published version with
          the new version before replacing it.
        </p>
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Source Information</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Source Name</dt>
            <dd className="font-medium">{source.source_name}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">URL</dt>
            <dd>
              <a
                href={source.source_url}
                target="_blank"
                rel="noreferrer"
                className="break-all text-brand hover:underline"
              >
                {source.source_url}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">Authority</dt>
            <dd className="font-medium">{source.authority}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Category</dt>
            <dd className="font-medium">{source.category}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Last Checked</dt>
            <dd className="font-medium">{formatWhen(source.last_checked_at)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Refresh Frequency</dt>
            <dd className="font-medium">{source.refresh_frequency}</dd>
          </div>
        </dl>
      </section>

      {data.change_required && published_version && current_version ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Published Version</h3>
            <p className="mt-1 text-xs text-ink-muted">
              v{published_version.version_number} ·{" "}
              {formatWhen(published_version.published_at)}
            </p>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-stone-50 p-3 text-xs">
              {published_version.extracted_text}
            </pre>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-4 shadow-sm">
            <h3 className="text-sm font-semibold">New Version</h3>
            <p className="mt-1 text-xs text-ink-muted">
              v{current_version.version_number} · needs review
            </p>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs">
              {current_version.extracted_text}
            </pre>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Original Extracted Content</h2>
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-stone-50 p-4 text-xs leading-relaxed text-foreground">
          {current_version?.extracted_text || "No extracted content yet."}
        </pre>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Extracted Knowledge</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === "approve_all"}
              onClick={() => void sourceAction("approve_all")}
              className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-60"
            >
              Approve All
            </button>
            <button
              type="button"
              disabled={busy === "publish_approved"}
              onClick={() => void sourceAction("publish_approved")}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
            >
              Publish Approved
            </button>
          </div>
        </div>

        {reviewItems.length === 0 ? (
          <p className="text-sm text-ink-muted">No knowledge items yet.</p>
        ) : (
          <ul className="space-y-3">
            {reviewItems.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-muted">
                      {item.category}
                      {item.subcategory ? ` · ${item.subcategory}` : ""}
                    </p>
                    {editingId === item.id ? (
                      <input
                        className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1 text-sm font-semibold"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    ) : (
                      <h3 className="text-base font-semibold">{item.title}</h3>
                    )}
                  </div>
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClass(item.status)}`}
                  >
                    {String(item.status).replace(/_/g, " ")}
                  </span>
                </div>

                {editingId === item.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      rows={4}
                      className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                    <label className="block text-xs font-medium text-ink-muted">
                      Evidence text (source excerpt)
                    </label>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm"
                      value={editEvidence}
                      onChange={(e) => setEditEvidence(e.target.value)}
                    />
                  </div>
                ) : (
                  <>
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      {item.content}
                    </p>
                    {item.evidence_text ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-ink-muted">
                          Evidence
                        </summary>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-ink-muted">
                          {item.evidence_text}
                        </p>
                      </details>
                    ) : null}
                  </>
                )}

                <p className="mt-2 text-xs text-ink-muted">
                  Source:{" "}
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      className="text-brand hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {item.source_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {editingId === item.id ? (
                    <>
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() =>
                          void patchItem(item.id, {
                            action: "edit",
                            title: editTitle,
                            content: editContent,
                            evidence_text: editEvidence,
                          })
                        }
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditTitle(item.title);
                          setEditContent(item.content);
                          setEditEvidence(item.evidence_text);
                        }}
                        className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-semibold hover:bg-stone-50"
                      >
                        Edit
                      </button>
                      {item.status !== "approved" &&
                      item.status !== "published" ? (
                        <button
                          type="button"
                          disabled={busy === item.id}
                          onClick={() =>
                            void patchItem(item.id, { action: "approve" })
                          }
                          className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900"
                        >
                          Approve
                        </button>
                      ) : null}
                      {item.status !== "rejected" ? (
                        <button
                          type="button"
                          disabled={busy === item.id}
                          onClick={() =>
                            void patchItem(item.id, { action: "reject" })
                          }
                          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
                        >
                          Reject
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() =>
                          void patchItem(item.id, { action: "delete" })
                        }
                        className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-900"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Version History</h2>
        {versions.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No versions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 py-2 last:border-0"
              >
                <span>
                  Version {v.version_number}
                  {v.id === source.published_version_id ? " — live" : ""}
                  {v.change_summary ? ` · ${v.change_summary}` : ""}
                </span>
                <span
                  className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusClass(v.status)}`}
                >
                  {String(v.status).replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
