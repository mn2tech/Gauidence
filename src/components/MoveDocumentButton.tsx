"use client";

import { useEffect, useRef, useState } from "react";
import { FolderInput, Loader2, X } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  nestedUnder,
  profileTypeLabel,
  topLevelProfiles,
} from "@/lib/profiles/types";

type Props = {
  documentId: string;
  fileName: string;
  currentProfileId: string;
  onMoved: (documentId: string) => void;
};

type PendingMove = {
  id: string;
  name: string;
};

export default function MoveDocumentButton({
  documentId,
  fileName,
  currentProfileId,
  onMoved,
}: Props) {
  const { profiles } = useActiveProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const destinations = profiles.filter((p) => p.id !== currentProfileId);
  const topLevel = topLevelProfiles(profiles);

  useEffect(() => {
    if (!menuOpen || pending) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen, pending]);

  if (destinations.length === 0) return null;

  const chooseTarget = (id: string, name: string) => {
    setError(null);
    setNotice(null);
    setPending({ id, name });
    setMenuOpen(false);
  };

  const confirmMove = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetProfileId: pending.id }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        warning?: string;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't move that document.");
        return;
      }
      if (body.warning) {
        setNotice(body.warning);
        setPending(null);
        onMoved(documentId);
        return;
      }
      setPending(null);
      onMoved(documentId);
    } catch {
      setError("Couldn't move that document. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setNotice(null);
          setMenuOpen((o) => !o);
        }}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`Move ${fileName} to another vault`}
        title="Move to another vault"
        className="rounded-full p-2 text-ink-muted transition hover:bg-stone-100 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <FolderInput className="h-4 w-4" />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
        >
          <p className="border-b border-stone-100 px-3 py-2 text-[11px] font-medium text-ink-muted">
            Move to vault…
          </p>
          <ul className="max-h-64 overflow-y-auto py-1">
            {topLevel.map((p) => {
              const children = nestedUnder(profiles, p).filter(
                (c) => c.id !== currentProfileId
              );
              return (
                <li key={p.id}>
                  {p.id !== currentProfileId ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => chooseTarget(p.id, p.display_name)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {p.display_name}
                        </span>
                        <span className="block truncate text-[11px] text-ink-muted">
                          {profileTypeLabel(p.profile_type)}
                        </span>
                      </span>
                    </button>
                  ) : null}
                  {children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      role="menuitem"
                      onClick={() => chooseTarget(child.id, child.display_name)}
                      className="flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left text-sm hover:bg-stone-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {child.display_name}
                        </span>
                        <span className="block truncate text-[11px] text-ink-muted">
                          {profileTypeLabel(child.profile_type)}
                        </span>
                      </span>
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {pending || notice || (error && !menuOpen) ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="move-doc-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="move-doc-title"
                  className="text-base font-semibold text-foreground"
                >
                  {notice
                    ? "Document moved"
                    : error && !pending
                      ? "Couldn't move"
                      : "Move document?"}
                </h3>
                {pending ? (
                  <>
                    <p className="mt-2 text-sm text-ink-muted">
                      Move{" "}
                      <span className="font-medium text-foreground">
                        {fileName}
                      </span>{" "}
                      to{" "}
                      <span className="font-medium text-foreground">
                        {pending.name}
                      </span>
                      &apos;s vault?
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                      Analysis, reminders from this file, and Ask-this-document
                      history move with it.
                    </p>
                  </>
                ) : null}
                {notice ? (
                  <p className="mt-2 text-sm text-ink-muted">{notice}</p>
                ) : null}
                {error ? (
                  <p className="mt-2 text-sm text-red-700" role="alert">
                    {error}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  setPending(null);
                  setError(null);
                  setNotice(null);
                }}
                aria-label="Close"
                className="rounded-full p-1 text-ink-muted hover:bg-stone-100 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {pending ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPending(null);
                      setError(null);
                    }}
                    className="rounded-full px-4 py-2 text-sm font-medium text-ink-muted hover:bg-stone-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void confirmMove()}
                    className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Move
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                  }}
                  className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
