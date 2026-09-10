"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Pencil, UserRound, X } from "lucide-react";

type ReviewItem = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  event_date: string | null;
  confidence: number | null;
  needs_review: boolean;
  child_id: string | null;
};

type ReviewPayload = {
  documentId: string;
  documentTitle: string | null;
  summary: {
    headline: string;
    childName: string | null;
    needsChildConfirmation: boolean;
  };
  countLines: string[];
  items: ReviewItem[];
};

type ChildOption = { id: string; display_name: string };

export function NewsletterReviewPanel(props: {
  documentId: string;
  childrenOptions?: ChildOption[];
  onDone?: () => void;
}) {
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [childId, setChildId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/guardian/newsletter-review?documentId=${encodeURIComponent(props.documentId)}`
      );
      const body = (await res.json().catch(() => ({}))) as ReviewPayload & {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load newsletter review.");
        setReview(null);
        return;
      }
      setReview(body);
      if (body.summary.childName == null && props.childrenOptions?.[0]) {
        setChildId(props.childrenOptions[0].id);
      }
    } catch {
      setError("Couldn't load newsletter review.");
    } finally {
      setLoading(false);
    }
  }, [props.documentId, props.childrenOptions]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(
    itemId: string,
    action: "confirm" | "dismiss" | "assign-child" | "edit",
    payload?: Record<string, unknown>
  ) {
    setBusyId(itemId);
    setError(null);
    try {
      const path =
        action === "edit"
          ? `/api/guardian/items/${itemId}`
          : `/api/guardian/items/${itemId}/${action === "assign-child" ? "assign-child" : action}`;
      const res = await fetch(path, {
        method: action === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Action failed.");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparing school newsletter review…
      </div>
    );
  }

  if (!review) {
    return error ? (
      <p className="text-sm text-red-700">{error}</p>
    ) : null;
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">
        {review.summary.headline}
      </h2>
      <ul className="mt-2 space-y-1 text-sm text-zinc-700">
        {review.countLines.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>

      {review.summary.needsChildConfirmation && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-amber-50 p-3">
          <label className="text-sm text-zinc-800">
            Which child is this newsletter for?
            <select
              className="mt-1 block w-full rounded border border-zinc-300 px-2 py-1"
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
            >
              <option value="">Select…</option>
              {(props.childrenOptions ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!childId || !review.items[0]}
            className="inline-flex items-center gap-1 rounded bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => {
              const first = review.items[0];
              if (!first || !childId) return;
              void runAction(first.id, "assign-child", { childId });
            }}
          >
            <UserRound className="h-4 w-4" />
            Assign child
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <ul className="mt-4 space-y-2">
        {review.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              {editingId === item.id ? (
                <input
                  className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              ) : (
                <p className="text-sm font-medium text-zinc-900">{item.title}</p>
              )}
              <p className="text-xs text-zinc-500">
                {item.type.replace(/_/g, " ")}
                {item.event_date ? ` · ${item.event_date}` : ""}
                {item.needs_review ? " · needs confirmation" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {editingId === item.id ? (
                <button
                  type="button"
                  className="rounded bg-zinc-900 px-2 py-1 text-xs text-white"
                  disabled={busyId === item.id}
                  onClick={() =>
                    void runAction(item.id, "edit", { title: editTitle })
                  }
                >
                  Save
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs"
                    disabled={busyId === item.id}
                    onClick={() => void runAction(item.id, "confirm")}
                  >
                    <Check className="h-3 w-3" />
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs"
                    disabled={busyId === item.id}
                    onClick={() => {
                      setEditingId(item.id);
                      setEditTitle(item.title);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs"
                    disabled={busyId === item.id}
                    onClick={() => void runAction(item.id, "dismiss")}
                  >
                    <X className="h-3 w-3" />
                    Dismiss
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {props.onDone && (
        <button
          type="button"
          className="mt-4 text-sm text-zinc-600 underline"
          onClick={props.onDone}
        >
          Done
        </button>
      )}
    </section>
  );
}
