"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  knowledgeKindLabel,
  type SpaceKnowledgeItem,
} from "@/lib/space-conversations/types";

type Props = {
  profileId: string;
  /** When true, only show decisions (Decisions tab). */
  decisionsOnly?: boolean;
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function SpaceDecisionsPanel({
  profileId,
  decisionsOnly = true,
}: Props) {
  const [items, setItems] = useState<SpaceKnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = decisionsOnly ? "?kind=decision" : "";
      const res = await fetch(
        `/api/spaces/${encodeURIComponent(profileId)}/knowledge${q}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load.");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [profileId, decisionsOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-700" role="alert">
        {error}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 px-4 py-8 text-center">
        <h3 className="text-base font-semibold text-foreground">
          {decisionsOnly ? "No decisions yet" : "No saved knowledge yet"}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          Promote important messages from Conversation with{" "}
          <span className="font-medium text-foreground">Save as…</span> so Gideon
          can remember them later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">
            {knowledgeKindLabel(item.kind)}
          </p>
          {item.title ? (
            <h3 className="mt-1 text-base font-semibold text-foreground">
              {item.title}
            </h3>
          ) : null}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {item.content}
          </p>
          <dl className="mt-3 space-y-0.5 text-xs text-ink-muted">
            {item.source_message_id ? (
              <div>
                <dt className="inline font-medium">Created from: </dt>
                <dd className="inline">Space Conversation</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline font-medium">Date: </dt>
              <dd className="inline">{formatDate(item.created_at)}</dd>
            </div>
            {item.created_by_display_name ? (
              <div>
                <dt className="inline font-medium">By: </dt>
                <dd className="inline">{item.created_by_display_name}</dd>
              </div>
            ) : null}
          </dl>
        </article>
      ))}
    </div>
  );
}
