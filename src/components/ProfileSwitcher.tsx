"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useActiveProfile } from "@/components/ProfileProvider";
import { buildProfilePath } from "@/lib/search";
import {
  ACTIVE_CLIENTS_GROUP_LABEL,
  INACTIVE_CLIENTS_GROUP_LABEL,
  nestedGroupsUnder,
  profileSubtitle,
  profileTypeLabel,
  sharedProfileAccessBadge,
  topLevelProfiles,
  vaultLabel,
  type GuardianProfile,
  type NestedVaultGroup,
} from "@/lib/profiles/types";

function nestedGroupKey(parentId: string, label: string) {
  return `${parentId}:${label}`;
}

function defaultNestedGroupCollapsed(label: string) {
  return (
    label === "Employees" ||
    label === "Clients" ||
    label === ACTIVE_CLIENTS_GROUP_LABEL ||
    label === INACTIVE_CLIENTS_GROUP_LABEL
  );
}

function NestedGroupHeader({
  label,
  count,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted hover:bg-stone-50"
    >
      <ChevronDown
        className={`h-3.5 w-3.5 shrink-0 transition-transform ${
          open ? "" : "-rotate-90"
        }`}
        aria-hidden
      />
      <span className="truncate">{label}</span>
      <span className="text-[10px] font-medium normal-case">({count})</span>
    </button>
  );
}

function SwitcherRow({
  profile,
  selected,
  indented,
  onSelect,
}: {
  profile: GuardianProfile;
  selected: boolean;
  indented?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-2 py-2 text-left text-sm hover:bg-stone-50 ${
        indented ? "pl-8 pr-3" : "px-3"
      }`}
    >
      <span className="mt-0.5 w-4 shrink-0">
        {selected ? <Check className="h-4 w-4 text-brand" /> : null}
      </span>
      <ProfileAvatar profile={profile} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {profile.display_name}
          {sharedProfileAccessBadge(profile) ? (
            <span className="ml-1 text-[10px] font-medium text-brand">
              {sharedProfileAccessBadge(profile)}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[11px] text-ink-muted">
          {indented
            ? profileTypeLabel(profile.profile_type)
            : profileSubtitle(profile)}
        </span>
      </span>
    </button>
  );
}

function profileSearchHaystack(profile: GuardianProfile): string {
  return [
    profile.display_name,
    profileSubtitle(profile),
    profileTypeLabel(profile.profile_type),
    profile.relationship,
    profile.organization_name,
    profile.business_legal_name,
    profile.school_name,
    profile.job_title,
    profile.department,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function SwitcherSearchRow({
  profile,
  profiles,
  selected,
  onSelect,
}: {
  profile: GuardianProfile;
  profiles: GuardianProfile[];
  selected: boolean;
  onSelect: () => void;
}) {
  const path = buildProfilePath(profiles, profile.id);
  const subtitle =
    path !== profile.display_name.trim() ? path : profileSubtitle(profile);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-stone-50"
    >
      <span className="mt-0.5 w-4 shrink-0">
        {selected ? <Check className="h-4 w-4 text-brand" /> : null}
      </span>
      <ProfileAvatar profile={profile} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {profile.display_name}
          {sharedProfileAccessBadge(profile) ? (
            <span className="ml-1 text-[10px] font-medium text-brand">
              {sharedProfileAccessBadge(profile)}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-[11px] text-ink-muted">
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function ProfileMenu({
  profiles,
  activeId,
  onPick,
  onClose,
  align = "right",
  searchable = false,
}: {
  profiles: GuardianProfile[];
  activeId: string;
  onPick: (id: string) => void;
  onClose: () => void;
  align?: "left" | "right";
  searchable?: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const topLevel = topLevelProfiles(profiles);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const trimmedQuery = query.trim().toLowerCase();

  useEffect(() => {
    if (!searchable) return;
    searchRef.current?.focus({ preventScroll: true });
    const t = window.setTimeout(() => {
      searchRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [searchable]);

  const filteredProfiles = useMemo(() => {
    if (!trimmedQuery) return null;
    return profiles
      .filter((profile) => profileSearchHaystack(profile).includes(trimmedQuery))
      .sort((a, b) => {
        const aName = a.display_name.toLowerCase();
        const bName = b.display_name.toLowerCase();
        if (aName === trimmedQuery && bName !== trimmedQuery) return -1;
        if (bName === trimmedQuery && aName !== trimmedQuery) return 1;
        if (aName.startsWith(trimmedQuery) && !bName.startsWith(trimmedQuery)) {
          return -1;
        }
        if (bName.startsWith(trimmedQuery) && !aName.startsWith(trimmedQuery)) {
          return 1;
        }
        return aName.localeCompare(bName);
      });
  }, [profiles, trimmedQuery]);

  useEffect(() => {
    const active = profiles.find((p) => p.id === activeId);
    if (!active?.parent_profile_id) return;
    const parent = profiles.find((p) => p.id === active.parent_profile_id);
    if (!parent) return;
    for (const group of nestedGroupsUnder(profiles, parent)) {
      if (group.profiles.some((p) => p.id === activeId)) {
        const key = nestedGroupKey(parent.id, group.label);
        setExpandedGroups((prev) => {
          if (prev.has(key)) return prev;
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      }
    }
  }, [activeId, profiles]);

  const toggleGroup = (parentId: string, label: string) => {
    const key = nestedGroupKey(parentId, label);
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isGroupOpen = (parentId: string, label: string) => {
    const key = nestedGroupKey(parentId, label);
    if (expandedGroups.has(key)) return true;
    return !defaultNestedGroupCollapsed(label);
  };

  return (
    <div
      role="listbox"
      className={`absolute z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white py-1 shadow-lg ${
        align === "left" ? "left-0" : "right-0"
      }`}
    >
      {searchable ? (
        <div className="border-b border-stone-100 px-2 py-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vaults…"
              aria-label="Search vaults"
              className="w-full rounded-lg border border-stone-200 bg-stone-50 py-2 pl-8 pr-3 text-sm outline-none placeholder:text-ink-muted focus:border-brand/40 focus:bg-white focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
      ) : null}
      <ul className="max-h-72 overflow-y-auto py-1">
        {filteredProfiles ? (
          filteredProfiles.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-muted">
              No vaults match &ldquo;{query.trim()}&rdquo;.
            </li>
          ) : (
            filteredProfiles.map((profile) => (
              <li key={profile.id}>
                <SwitcherSearchRow
                  profile={profile}
                  profiles={profiles}
                  selected={profile.id === activeId}
                  onSelect={() => onPick(profile.id)}
                />
              </li>
            ))
          )
        ) : (
          topLevel.map((p) => {
          const selected = p.id === activeId;
          const groups = nestedGroupsUnder(profiles, p);
          return (
            <li key={p.id}>
              <SwitcherRow
                profile={p}
                selected={selected}
                onSelect={() => onPick(p.id)}
              />
              {groups.map((group: NestedVaultGroup) => (
                <div key={group.label}>
                  <NestedGroupHeader
                    label={group.label}
                    count={group.profiles.length}
                    open={isGroupOpen(p.id, group.label)}
                    onToggle={() => toggleGroup(p.id, group.label)}
                  />
                  {isGroupOpen(p.id, group.label)
                    ? group.profiles.map((child) => (
                        <SwitcherRow
                          key={child.id}
                          profile={child}
                          selected={child.id === activeId}
                          indented
                          onSelect={() => onPick(child.id)}
                        />
                      ))
                    : null}
                </div>
              ))}
            </li>
          );
        })
        )}
      </ul>
      <div className="border-t border-stone-100 py-1">
        <Link
          href="/settings/profiles?add=1"
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand hover:bg-stone-50"
        >
          <Plus className="h-4 w-4" />
          Add a vault
        </Link>
        <Link
          href="/settings/profiles"
          onClick={onClose}
          className="block px-3 py-2 text-sm text-ink-muted hover:bg-stone-50 hover:text-foreground"
        >
          Manage vaults
        </Link>
      </div>
    </div>
  );
}

function useProfileMenu(onAfterSwitch?: (id: string) => void) {
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

  const pick = (id: string) => {
    void (async () => {
      if (active && id !== active.id) await switchProfile(id);
      onAfterSwitch?.(id);
      setOpen(false);
    })();
  };

  return {
    profiles,
    active,
    loading,
    open,
    setOpen,
    rootRef,
    pick,
    close: () => setOpen(false),
  };
}

export default function ProfileSwitcher() {
  const { profiles, active, loading, open, setOpen, rootRef, pick, close } =
    useProfileMenu();

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
        className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-full border border-stone-300 bg-white px-2.5 py-1 text-sm font-medium text-foreground transition hover:bg-stone-50 sm:max-w-[14rem]"
      >
        <ProfileAvatar profile={active} size="sm" />
        <span className="truncate">{active.display_name}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
      </button>

      {open ? (
        <ProfileMenu
          profiles={profiles}
          activeId={active.id}
          onPick={pick}
          onClose={close}
          align="right"
          searchable
        />
      ) : null}
    </div>
  );
}

/** Vault workspace header: active vault name + dropdown to switch vaults. */
export function VaultHeaderProfileSwitch({
  onAfterSwitch,
}: {
  onAfterSwitch?: (id: string) => void;
}) {
  const { profiles, active, loading, open, setOpen, rootRef, pick, close } =
    useProfileMenu(onAfterSwitch);

  if (loading && !active) {
    return <span className="text-xs text-ink-muted">Loading…</span>;
  }
  if (!active) return null;

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Switch vault (currently ${active.display_name})`}
        title={vaultLabel(active)}
        className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-1 py-0.5 text-left transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <ProfileAvatar profile={active} size="sm" />
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {vaultLabel(active)}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
      </button>
      {open ? (
        <ProfileMenu
          profiles={profiles}
          activeId={active.id}
          onPick={pick}
          onClose={close}
          align="left"
          searchable
        />
      ) : null}
    </div>
  );
}

/** Compact Ask header control: title + ▾ opens people/spaces (no extra name chip). */
export function AskTitleProfileSwitch({
  title,
}: {
  title: string;
}) {
  const { profiles, active, open, setOpen, rootRef, pick, close } =
    useProfileMenu();

  if (!active) {
    return (
      <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
    );
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Switch person or space (currently ${active.display_name})`}
        title={`Chatting about ${active.display_name}`}
        className="inline-flex max-w-full items-center gap-0.5 rounded-lg text-left transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="truncate text-sm font-semibold sm:text-base">
          {title}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
      </button>
      {open ? (
        <ProfileMenu
          profiles={profiles}
          activeId={active.id}
          onPick={pick}
          onClose={close}
          align="left"
        />
      ) : null}
    </div>
  );
}

/** Welcome-line control: “Chatting about Name ▾” with more room than the header. */
export function AskWelcomeProfileSwitch({
  fallbackName,
}: {
  fallbackName?: string;
}) {
  const { profiles, active, open, setOpen, rootRef, pick, close } =
    useProfileMenu();
  const name = active?.display_name ?? fallbackName;
  if (!name) return null;

  const trigger = (children: ReactNode) =>
    active ? (
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Switch person or space (currently ${name})`}
        className="inline-flex max-w-full items-center gap-0.5 rounded-md text-left font-medium text-foreground underline decoration-stone-300 underline-offset-2 transition hover:decoration-brand"
      >
        {children}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
      </button>
    ) : (
      <span className="font-medium text-foreground">{children}</span>
    );

  return (
    <div className="relative" ref={rootRef}>
      <p className="text-xs text-ink-muted">
        Chatting about {trigger(name)}
      </p>
      {open && active ? (
        <ProfileMenu
          profiles={profiles}
          activeId={active.id}
          onPick={pick}
          onClose={close}
          align="left"
        />
      ) : null}
    </div>
  );
}
