"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  Merge,
  Pencil,
  X,
} from "lucide-react";
import type { WorldInboxItem } from "@/lib/world/types";
import { WORLD_PATH, worldEntityHref } from "@/lib/routes";

function typeLabel(type: string): string {
  switch (type) {
    case "ENTITY_CONFIRMATION":
      return "Confirm this person or thing";
    case "ENTITY_MERGE":
      return "Possible match";
    case "RELATIONSHIP_CONFIRMATION":
      return "Confirm this connection";
    case "TRACKING_SUGGESTION":
      return "Start tracking?";
    case "AMBIGUOUS_FACT":
      return "Check this detail";
    default:
      return type.replace(/_/g, " ");
  }
}

function candidateName(item: WorldInboxItem): string {
  const c = item.candidate;
  if (typeof c.name === "string" && c.name.trim()) return c.name.trim();
  if (typeof c.suggested_merge_name === "string") return c.suggested_merge_name;
  return "Unknown";
}

export default function WorldInboxScreen() {
  const [items, setItems] = useState<WorldInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/world/inbox");
      const body = (await res.json().catch(() => ({}))) as {
        items?: WorldInboxItem[];
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load confirmations.");
        setItems([]);
        return;
      }
      setItems(body.items ?? []);
    } catch {
      setError("Couldn't reach Guardian.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    item: WorldInboxItem,
    action: "confirm" | "edit" | "merge" | "reject" | "ignore",
    extra?: { editedName?: string; mergeIntoEntityId?: string }
  ) {
    setBusyId(item.id);
    setNote(null);
    try {
      const res = await fetch(
        `/api/world/inbox/${encodeURIComponent(item.id)}/action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNote(body.error ?? "That didn't work.");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setEditingId(null);
      setNote(
        action === "confirm"
          ? "Saved — Guardian will remember this."
          : action === "merge"
            ? "Merged — future matches will be smarter."
            : action === "reject"
              ? "Rejected."
              : action === "ignore"
                ? "Ignored."
                : "Updated."
      );
    } catch {
      setNote("Couldn't reach Guardian.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 sm:py-8">
      <Link
        href={WORLD_PATH}
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> My World
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Confirmations</h1>
        <p className="mt-1 text-sm text-ink-muted">
          When Guardian is unsure, you decide. Your answers become lasting
          knowledge.
        </p>
      </header>

      {note ? (
        <p className="rounded-xl bg-brand-light/50 px-4 py-2.5 text-sm text-brand" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : items.length === 0 ? (
        <div className="simple-home-card p-6 text-center">
          <p className="font-semibold">You&apos;re all caught up</p>
          <p className="mt-1 text-sm text-ink-muted">
            Nothing needs confirmation right now.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const name = candidateName(item);
            const mergeTarget =
              typeof item.candidate.suggested_merge_name === "string"
                ? item.candidate.suggested_merge_name
                : null;
            const mergeId =
              (typeof item.candidate.suggested_merge_into === "string"
                ? item.candidate.suggested_merge_into
                : null) ?? item.related_entity_ids[0] ?? null;
            const busy = busyId === item.id;

            return (
              <li key={item.id} className="simple-home-card space-y-3 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {typeLabel(String(item.type))}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {name}
                  </p>
                  {item.reason ? (
                    <p className="mt-1 text-sm text-ink-muted">{item.reason}</p>
                  ) : null}
                  {mergeTarget ? (
                    <p className="mt-1 text-sm text-ink-muted">
                      Looks like: <span className="font-medium">{mergeTarget}</span>
                    </p>
                  ) : null}
                  {item.semantic_entity_id ? (
                    <Link
                      href={worldEntityHref(item.semantic_entity_id)}
                      className="mt-2 inline-block text-xs font-semibold text-brand hover:underline"
                    >
                      View details
                    </Link>
                  ) : null}
                </div>

                {editingId === item.id ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                      placeholder="Correct name"
                      aria-label="Correct name"
                    />
                    <button
                      type="button"
                      disabled={busy || !editName.trim()}
                      onClick={() =>
                        void act(item, "edit", { editedName: editName.trim() })
                      }
                      className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-xl border border-stone-200 px-4 py-2 text-sm font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(item, "confirm")}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" /> Confirm
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(item.id);
                        setEditName(name);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                    {item.type === "ENTITY_MERGE" && mergeId ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(item, "merge", {
                            mergeIntoEntityId: mergeId,
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                      >
                        <Merge className="h-4 w-4" /> Merge
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(item, "reject")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" /> Reject
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(item, "ignore")}
                      className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-muted hover:text-foreground disabled:opacity-50"
                    >
                      Ignore
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
