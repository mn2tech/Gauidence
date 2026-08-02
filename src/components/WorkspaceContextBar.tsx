"use client";

import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ProfileAvatar from "@/components/ProfileAvatar";
import type { WorkingInDisplay } from "@/lib/workspace-context/client";
import type { GuardianProfile } from "@/lib/profiles/types";
import { nestedUnder, topLevelProfiles } from "@/lib/profiles/types";

type Props = {
  display: WorkingInDisplay;
  profiles: GuardianProfile[];
  activeProfileId: string;
  onSwitchWorkspace: (profileId: string) => void;
  onReturnToWorkspace?: () => void;
  onOpenSearch?: () => void;
  className?: string;
};

function WorkspaceMenu({
  profiles,
  activeId,
  onPick,
  onClose,
}: {
  profiles: GuardianProfile[];
  activeId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const topLevel = topLevelProfiles(profiles);
  return (
    <div
      role="listbox"
      className="absolute left-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
    >
      <ul className="max-h-64 overflow-y-auto py-1">
        {topLevel.map((p) => {
          const children = nestedUnder(profiles, p);
          return (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === activeId}
                onClick={() => {
                  onPick(p.id);
                  onClose();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
              >
                <ProfileAvatar profile={p} size="sm" />
                <span className="truncate font-medium">{p.display_name}</span>
              </button>
              {children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  role="option"
                  aria-selected={child.id === activeId}
                  onClick={() => {
                    onPick(child.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left text-sm hover:bg-stone-50"
                >
                  <ProfileAvatar profile={child} size="sm" />
                  <span className="truncate">{child.display_name}</span>
                </button>
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function WorkspaceContextBar({
  display,
  profiles,
  activeProfileId,
  onSwitchWorkspace,
  onReturnToWorkspace,
  onOpenSearch,
  className = "",
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const heading = display.mode === "searching" ? "Searching" : "Working in";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 ${className}`}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {heading}
        </p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold text-foreground">
            {display.primaryName}
          </p>
          {display.secondaryLabel ? (
            <p className="text-xs text-ink-muted">{display.secondaryLabel}</p>
          ) : null}
        </div>
        {display.scopeNote ? (
          <p className="mt-0.5 text-[11px] text-ink-muted">{display.scopeNote}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {display.mode === "searching" && onReturnToWorkspace ? (
          <button
            type="button"
            onClick={onReturnToWorkspace}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-stone-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Return
          </button>
        ) : (
          <div className="relative" ref={rootRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-stone-50"
            >
              Switch
              <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
            </button>
            {menuOpen ? (
              <WorkspaceMenu
                profiles={profiles}
                activeId={activeProfileId}
                onPick={onSwitchWorkspace}
                onClose={() => setMenuOpen(false)}
              />
            ) : null}
          </div>
        )}
        {onOpenSearch ? (
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand-light/40"
            aria-label="Search vault"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>
        ) : null}
      </div>
    </div>
  );
}
