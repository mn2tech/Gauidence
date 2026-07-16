"use client";

import { useEffect, useRef, useState } from "react";
import { FolderInput, Loader2 } from "lucide-react";
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

export default function MoveDocumentButton({
  documentId,
  fileName,
  currentProfileId,
  onMoved,
}: Props) {
  const { profiles } = useActiveProfile();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const destinations = profiles.filter((p) => p.id !== currentProfileId);
  const topLevel = topLevelProfiles(profiles);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (destinations.length === 0) return null;

  const moveTo = async (targetProfileId: string, targetName: string) => {
    if (
      !window.confirm(
        `Move "${fileName}" to ${targetName}'s vault?\n\nAnalysis, reminders from this file, and Ask-this-document history move with it.`
      )
    ) {
      return;
    }
    setBusyId(targetProfileId);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetProfileId }),
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
        window.alert(body.warning);
      }
      setOpen(false);
      onMoved(documentId);
    } catch {
      setError("Couldn't move that document. Check your connection.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Move ${fileName} to another vault`}
        title="Move to another vault"
        className="rounded-full p-2 text-ink-muted transition hover:bg-stone-100 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <FolderInput className="h-4 w-4" />
      </button>

      {open ? (
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
                      disabled={busyId !== null}
                      onClick={() => void moveTo(p.id, p.display_name)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50 disabled:opacity-50"
                    >
                      {busyId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
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
                      disabled={busyId !== null}
                      onClick={() => void moveTo(child.id, child.display_name)}
                      className="flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left text-sm hover:bg-stone-50 disabled:opacity-50"
                    >
                      {busyId === child.id ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand" />
                      ) : (
                        <span className="w-3.5 shrink-0" />
                      )}
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
          {error ? (
            <p className="border-t border-stone-100 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
