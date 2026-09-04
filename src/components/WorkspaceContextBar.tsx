"use client";

import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ProfileAvatar from "@/components/ProfileAvatar";
import type { WorkingInDisplay } from "@/lib/workspace-context/client";
import {
  SEARCH_SCOPE_FIRST_HINT,
  searchScopeHint,
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

/** Compact single-row space / scope chrome for Ask Gideon (phone + laptop). */
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

  const showFirstHint = showSearchScopeToggle && !hintSeen;
  const returning = display.mode === "searching" && onReturnToWorkspace;
  const scopeTitle =
    searchScope === "global"
      ? "All spaces"
      : display.primaryName;

  function markHintSeen() {
    writeSearchScopeHintSeen(true);
    setHintSeen(true);
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-surface-elevated/80 px-2 py-1.5">
        {returning ? (
          <button
            type="button"
            onClick={onReturnToWorkspace}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-elevated"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Return
          </button>
        ) : (
          <div className="relative min-w-0" ref={rootRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              title={
                display.scopeNote ||
                searchScopeHint(searchScope, display.primaryName)
              }
              className="inline-flex max-w-[14rem] items-center gap-1 rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-elevated sm:max-w-[18rem]"
            >
              <span className="truncate">{scopeTitle}</span>
              {display.secondaryLabel && searchScope !== "global" ? (
                <span className="hidden shrink-0 rounded-full bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-muted sm:inline">
                  {display.secondaryLabel}
                </span>
              ) : null}
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
            className="ml-auto flex shrink-0 gap-0.5 rounded-full bg-surface p-0.5 ring-1 ring-border-subtle"
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
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  searchScope === mode
                    ? "bg-brand text-white"
                    : "text-ink-muted hover:text-foreground"
                }`}
              >
                {mode === "workspace" ? "This space" : "All"}
              </button>
            ))}
          </div>
        ) : (
          <div className="ml-auto" />
        )}

        {onOpenSearch ? (
          <button
            type="button"
            onClick={onOpenSearch}
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface p-2 text-brand hover:bg-brand-light/40"
            aria-label="Search spaces and content"
            title="Search"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {showFirstHint ? (
        <div className="rounded-lg bg-surface px-2.5 py-2 ring-1 ring-border-subtle">
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
  );
}
