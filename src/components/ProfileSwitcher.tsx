"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus, UserRound } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { profileTypeLabel } from "@/lib/profiles/types";

export default function ProfileSwitcher() {
  const { profiles, active, loading, switchProfile } = useActiveProfile();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (loading && !active) {
    return (
      <span className="hidden text-xs text-ink-muted sm:inline">Loading…</span>
    );
  }
  if (!active) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-stone-50 sm:max-w-[14rem]"
      >
        <UserRound className="h-3.5 w-3.5 shrink-0 text-brand" />
        <span className="truncate">{active.display_name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            {profiles.map((p) => {
              const selected = p.id === active.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      void (async () => {
                        if (p.id !== active.id) await switchProfile(p.id);
                        setOpen(false);
                      })();
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
                  >
                    <span className="mt-0.5 w-4 shrink-0">
                      {selected ? (
                        <Check className="h-4 w-4 text-brand" />
                      ) : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {p.display_name}
                      </span>
                      <span className="block truncate text-[11px] text-ink-muted">
                        {profileTypeLabel(p.profile_type)}
                        {p.relationship ? ` · ${p.relationship}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-stone-100 py-1">
            <Link
              href="/settings/profiles?add=1"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand hover:bg-stone-50"
            >
              <Plus className="h-4 w-4" />
              Add Profile
            </Link>
            <Link
              href="/settings/profiles"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-ink-muted hover:bg-stone-50 hover:text-foreground"
            >
              Manage Profiles
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
