"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { documentsHref } from "@/lib/routes";

export type HomeWatchItem = {
  id: string;
  title: string;
  space_id: string;
  space_name: string | null;
  child_name: string | null;
  effective_date: string | null;
  requires_action: boolean;
  source_document_id: string | null;
  type: string;
};

export type HomeWatchData = {
  today: HomeWatchItem[];
  needsAttention: HomeWatchItem[];
  comingUp: HomeWatchItem[];
};

const EMPTY: HomeWatchData = {
  today: [],
  needsAttention: [],
  comingUp: [],
};

function mapItem(raw: Record<string, unknown>): HomeWatchItem {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    space_id: String(raw.space_id),
    space_name:
      typeof raw.space_name === "string" ? raw.space_name : null,
    child_name:
      typeof raw.child_name === "string" ? raw.child_name : null,
    effective_date:
      typeof raw.effective_date === "string" ? raw.effective_date : null,
    requires_action: Boolean(raw.requires_action),
    source_document_id:
      typeof raw.source_document_id === "string"
        ? raw.source_document_id
        : null,
    type: String(raw.type ?? ""),
  };
}

export function useGuardianWatchHome() {
  const [data, setData] = useState<HomeWatchData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [sourceOpen, setSourceOpen] = useState<{
    itemId: string;
    title: string;
    documentTitle: string | null;
    excerpt: string | null;
    message: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/guardian/watch");
      if (!res.ok) {
        setData(EMPTY);
        return;
      }
      const body = (await res.json()) as {
        today?: Record<string, unknown>[];
        needsAttention?: Record<string, unknown>[];
        comingUp?: Record<string, unknown>[];
      };
      setData({
        today: (body.today ?? []).map(mapItem),
        needsAttention: (body.needsAttention ?? []).map(mapItem),
        comingUp: (body.comingUp ?? []).map(mapItem),
      });
    } catch {
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const complete = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/guardian/items/${id}/complete`, {
        method: "POST",
      });
      if (res.ok) await refresh();
    },
    [refresh]
  );

  const dismiss = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/guardian/items/${id}/dismiss`, {
        method: "POST",
      });
      if (res.ok) await refresh();
    },
    [refresh]
  );

  const viewSource = useCallback(async (id: string) => {
    const res = await fetch(`/api/guardian/items/${id}/source`);
    if (!res.ok) return;
    const body = (await res.json()) as {
      title?: string;
      documentTitle?: string | null;
      excerpt?: string | null;
      message?: string;
    };
    setSourceOpen({
      itemId: id,
      title: body.title ?? "Item",
      documentTitle: body.documentTitle ?? null,
      excerpt: body.excerpt ?? null,
      message: body.message ?? "Guardian found this.",
    });
  }, []);

  return {
    data,
    loading,
    refresh,
    complete,
    dismiss,
    viewSource,
    sourceOpen,
    closeSource: () => setSourceOpen(null),
  };
}

function formatWhen(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function itemLabel(item: HomeWatchItem): string {
  const who = item.child_name || item.space_name;
  return who ? `${who} · ${item.title}` : item.title;
}

export function GuardianWatchList({
  items,
  onComplete,
  onDismiss,
  onViewSource,
}: {
  items: HomeWatchItem[];
  onComplete: (id: string) => void;
  onDismiss: (id: string) => void;
  onViewSource: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.slice(0, 6).map((item) => (
        <li
          key={item.id}
          className="rounded-xl px-2 py-2.5 transition hover:bg-brand-light/35"
        >
          <div className="flex items-start justify-between gap-2">
            <Link
              href={documentsHref(item.space_id)}
              className="min-w-0 flex-1 text-sm font-medium text-foreground"
            >
              <span className="block">{itemLabel(item)}</span>
              {item.effective_date ? (
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {formatWhen(item.effective_date)}
                </span>
              ) : null}
            </Link>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onComplete(item.id)}
              className="text-xs font-semibold text-brand hover:text-brand-dark"
            >
              Mark done
            </button>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="text-xs font-semibold text-ink-muted hover:text-foreground"
            >
              Dismiss
            </button>
            {item.source_document_id ? (
              <button
                type="button"
                onClick={() => onViewSource(item.id)}
                className="text-xs font-semibold text-ink-muted hover:text-foreground"
              >
                View source
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GuardianSourcePanel({
  open,
  onClose,
}: {
  open: {
    title: string;
    documentTitle: string | null;
    excerpt: string | null;
    message: string;
  } | null;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="View source"
      onClick={onClose}
    >
      <div
        className="simple-home-card w-full max-w-md p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-foreground">{open.title}</h3>
        <p className="mt-2 text-xs text-ink-muted">{open.message}</p>
        {open.documentTitle ? (
          <p className="mt-3 text-sm font-medium text-foreground">
            {open.documentTitle}
          </p>
        ) : null}
        {open.excerpt ? (
          <blockquote className="mt-2 border-l-2 border-brand/40 pl-3 text-sm italic text-ink-muted">
            “{open.excerpt}”
          </blockquote>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-xs font-semibold text-brand hover:text-brand-dark"
        >
          Close
        </button>
      </div>
    </div>
  );
}
