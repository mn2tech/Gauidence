"use client";

import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ProfileAvatar from "@/components/ProfileAvatar";
import type { WorkingInDisplay } from "@/lib/workspace-context/client";
import {
  SEARCH_SCOPE_FIRST_HINT,
  searchScopeHeading,
  searchScopeHint,
  searchScopeLabel,
  type SearchScopeMode,
} from "@/lib/workspace-context/client";
import type { GuardianProfile } from "@/lib/profiles/types";
import { nestedUnder, topLevelProfiles } from "@/lib/profiles/types";
import {
  readSearchScopeHintSeen,
  writeSearchScopeHintSeen,
} from "@/lib/vault/searchScopeHintClient";

type Props = {
  display: WorkingInDisplay;
  profiles: GuardianProfile[];
  activeProfileId: string;
  onSwitchWorkspace: (profileId: string) => void;
  onReturnToWorkspace?: () => void;
  onOpenSearch?: () => void;
  searchScope?: SearchScopeMode;
  showSearchScopeToggle?: boolean;
  onSearchScopeChange?: (scope: SearchScopeMode) => void;
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
      className="absolute left-0 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border-subtle bg-surface py-1 shadow-lg"
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
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-elevated"
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
                  className="flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left text-sm hover:bg-surface-elevated"
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
  searchScope = "workspace",
  showSearchScopeToggle = false,
  onSearchScopeChange,
  className = "",
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hintSeen, setHintSeen] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHintSeen(readSearchScopeHintSeen());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const scopeLabel = showSearchScopeToggle
    ? searchScopeHeading(searchScope, display.primaryName)
    : display.primaryName;
  const hint = showSearchScopeToggle
    ? searchScopeHint(searchScope, display.primaryName)
    : null;
  const showFirstHint = showSearchScopeToggle && !hintSeen;

  function markHintSeen() {
    writeSearchScopeHintSeen(true);
    setHintSeen(true);
  }

  const returning = display.mode === "searching" && onReturnToWorkspace;

  return (
    <div
      className={`flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-elevated/80 px-2 py-1.5 sm:flex-wrap sm:justify-between sm:gap-2 sm:px-3 sm:py-2 ${className}`}
    >
      {/* Desktop-only title block */}
      <div className="hidden min-w-0 sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          Searching
        </p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold text-foreground">{scopeLabel}</p>
          {display.secondaryLabel && searchScope !== "global" ? (
            <p className="text-xs text-ink-muted">{display.secondaryLabel}</p>
          ) : null}
        </div>
        {hint ? (
          <p className="mt-0.5 text-[11px] text-ink-muted">{hint}</p>
        ) : display.scopeNote ? (
          <p className="mt-0.5 text-[11px] text-ink-muted">{display.scopeNote}</p>
        ) : null}
        {showFirstHint ? (
          <div className="mt-2 rounded-lg bg-surface px-2.5 py-2 ring-1 ring-border-subtle">
            <p className="text-[11px] leading-snug text-foreground">
              {SEARCH_SCOPE_FIRST_HINT}
            </p>
            <button
              type="button"
              onClick={markHintSeen}
              className="mt-1.5 text-[11px] font-semibold text-brand hover:text-brand-dark"
            >
              Got it
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none sm:justify-end">
        {returning ? (
          <button
            type="button"
            onClick={onReturnToWorkspace}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs font-medium text-foreground hover:bg-surface-elevated sm:px-2.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return</span>
          </button>
        ) : (
          <div className="relative min-w-0" ref={rootRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              title="Switch space"
              className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs font-medium text-foreground hover:bg-surface-elevated sm:px-2.5"
            >
              <span className="truncate sm:hidden">{display.primaryName}</span>
              <span className="hidden sm:inline">Switch</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
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

        {showSearchScopeToggle && onSearchScopeChange ? (
          <div
            className="ml-auto flex shrink-0 gap-0.5 rounded-full bg-surface p-0.5 ring-1 ring-border-subtle sm:ml-0"
            role="group"
            aria-label="Search scope"
          >
            {(["workspace", "global"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={searchScope === mode}
                title={searchScopeHint(mode, display.primaryName)}
                onClick={() => {
                  markHintSeen();
                  onSearchScopeChange(mode);
                }}
                className={`rounded-full px-2 py-1 text-[11px] font-medium transition sm:px-2.5 ${
                  searchScope === mode
                    ? "bg-brand text-white"
                    : "text-ink-muted hover:text-foreground"
                }`}
              >
                <span className="sm:hidden">
                  {mode === "workspace" ? "Space" : "All"}
                </span>
                <span className="hidden sm:inline">
                  {searchScopeLabel(mode)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="ml-auto sm:hidden" />
        )}

        {onOpenSearch ? (
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-subtle bg-surface p-2 text-xs font-medium text-brand hover:bg-brand-light/40 sm:px-2.5 sm:py-1.5"
            aria-label="Search spaces and content"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
