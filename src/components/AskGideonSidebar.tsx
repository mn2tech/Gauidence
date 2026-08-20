"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import {
  ChevronDown,
  Import,
  MessageSquarePlus,
  PanelLeftClose,
  Plus,
  Trash2,
} from "lucide-react";
import GuardianLogo from "@/components/brand/GuardianLogo";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  ACTIVE_CLIENTS_GROUP_LABEL,
  INACTIVE_CLIENTS_GROUP_LABEL,
  nestedGroupsUnder,
  profileSubtitle,
  profileTypeLabel,
  topLevelProfiles,
  type GuardianProfile,
  type NestedVaultGroup,
} from "@/lib/profiles/types";
import { useVaultSubVaultMenu } from "@/components/VaultSubVaultMenu";
import AskConnectedSourcesPanel from "@/components/connections/AskConnectedSourcesPanel";

type ChatSummary = {
  id: string;
  title: string;
  imported_from?: "chatgpt" | "claude" | null;
};

function CollapsibleSection({
  title,
  open,
  onToggle,
  className = "",
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/60"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform ${
            open ? "" : "-rotate-90"
          }`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          {title}
        </span>
      </button>
      {open ? <div className="mt-0.5">{children}</div> : null}
    </section>
  );
}

function VaultRow({
  profile,
  selected,
  indented,
  onSelect,
  onContextMenu,
  className = "",
}: {
  profile: GuardianProfile;
  selected: boolean;
  indented?: boolean;
  onSelect: () => void;
  onContextMenu?: (e: MouseEvent, profile: GuardianProfile) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onContextMenu={
        onContextMenu ? (e) => onContextMenu(e, profile) : undefined
      }
      className={`flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-sm transition ${
        indented ? "pl-6 pr-2" : "px-2"
      } ${
        selected
          ? "bg-white font-medium text-foreground ring-1 ring-brand/30"
          : "text-foreground/90 hover:bg-white/80"
      } ${className}`}
    >
      <ProfileAvatar profile={profile} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{profile.display_name}</span>
        <span className="block truncate text-[10px] text-ink-muted">
          {indented
            ? profileTypeLabel(profile.profile_type)
            : profileSubtitle(profile)}
        </span>
      </span>
    </button>
  );
}

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

function VaultGroup({
  profile,
  groups,
  selected,
  expanded,
  onToggleExpand,
  onSelect,
  onSelectChild,
  activeChildId,
  expandedGroups,
  onToggleGroup,
  onContextMenu,
}: {
  profile: GuardianProfile;
  groups: NestedVaultGroup[];
  selected: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelect: () => void;
  onSelectChild: (id: string) => void;
  activeChildId?: string;
  expandedGroups: Set<string>;
  onToggleGroup: (parentId: string, label: string) => void;
  onContextMenu?: (e: MouseEvent, profile: GuardianProfile) => void;
}) {
  const subVaultCount = groups.reduce((n, g) => n + g.profiles.length, 0);
  const hasSubVaults = subVaultCount > 0;

  const isGroupOpen = (label: string) => {
    const key = nestedGroupKey(profile.id, label);
    if (expandedGroups.has(key)) return true;
    return !defaultNestedGroupCollapsed(label);
  };

  return (
    <li>
      <div
        className={`flex items-stretch rounded-lg ${
          hasSubVaults
            ? selected && !activeChildId
              ? "bg-white ring-1 ring-brand/30"
              : "hover:bg-white/80"
            : ""
        }`}
      >
        {hasSubVaults ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${profile.display_name}`}
            className="flex shrink-0 items-center self-stretch rounded-l-lg px-1.5 text-ink-muted transition hover:bg-white/60"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                expanded ? "" : "-rotate-90"
              }`}
              aria-hidden
            />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <VaultRow
            profile={profile}
            selected={!hasSubVaults && selected}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            className={hasSubVaults ? "rounded-l-none pl-0 hover:bg-transparent" : undefined}
          />
        </div>
      </div>
      {hasSubVaults && expanded
        ? groups.map((group) => (
            <CollapsibleSection
              key={group.label}
              title={`${group.label} (${group.profiles.length})`}
              open={isGroupOpen(group.label)}
              onToggle={() => onToggleGroup(profile.id, group.label)}
              className="pl-2"
            >
              {group.profiles.map((child) => (
                <VaultRow
                  key={child.id}
                  profile={child}
                  selected={activeChildId === child.id}
                  indented
                  onSelect={() => onSelectChild(child.id)}
                  onContextMenu={onContextMenu}
                />
              ))}
            </CollapsibleSection>
          ))
        : null}
    </li>
  );
}

function VaultList({ onPicked }: { onPicked?: () => void }) {
  const { profiles, active, loading, switchProfile } = useActiveProfile();
  const { handleContextMenu, overlay } = useVaultSubVaultMenu();
  const topLevel = topLevelProfiles(profiles);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    if (!active?.parent_profile_id) return;
    setExpandedParents((prev) => {
      if (prev.has(active.parent_profile_id!)) return prev;
      const next = new Set(prev);
      next.add(active.parent_profile_id!);
      return next;
    });
    const parent = profiles.find((p) => p.id === active.parent_profile_id);
    if (!parent) return;
    for (const group of nestedGroupsUnder(profiles, parent)) {
      if (group.profiles.some((p) => p.id === active.id)) {
        const key = nestedGroupKey(parent.id, group.label);
        setExpandedGroups((prev) => {
          if (prev.has(key)) return prev;
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      }
    }
  }, [active?.id, active?.parent_profile_id, profiles]);

  const pick = (id: string) => {
    if (active?.id === id) {
      onPicked?.();
      return;
    }
    void switchProfile(id).then(() => onPicked?.());
  };

  const toggleGroup = (parentId: string, label: string) => {
    const key = nestedGroupKey(parentId, label);
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleParent = (parentId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  if (loading && !active) {
    return <p className="px-2 py-1 text-xs text-ink-muted">Loading spaces…</p>;
  }

  if (topLevel.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-ink-muted">
        No spaces yet.{" "}
        <Link
          href="/settings/profiles?add=1&return=%2Fask"
          className="font-medium text-brand hover:text-brand-dark"
        >
          Create one
        </Link>
      </p>
    );
  }

  return (
    <>
      {overlay}
      <ul className="space-y-0.5" role="listbox" aria-label="Vaults">
        {topLevel.map((p) => {
          const groups = nestedGroupsUnder(profiles, p);
          const subVaultCount = groups.reduce((n, g) => n + g.profiles.length, 0);
          return (
            <VaultGroup
              key={p.id}
              profile={p}
              groups={groups}
              selected={active?.id === p.id}
              activeChildId={
                active?.parent_profile_id === p.id ? active.id : undefined
              }
              expanded={subVaultCount === 0 || expandedParents.has(p.id)}
              onToggleExpand={() => toggleParent(p.id)}
              onSelect={() => pick(p.id)}
              onSelectChild={pick}
              expandedGroups={expandedGroups}
              onToggleGroup={toggleGroup}
              onContextMenu={handleContextMenu}
            />
          );
        })}
        <li className="pt-1">
          <Link
            href="/settings/profiles?add=1&return=%2Fask"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-brand hover:bg-white/80"
          >
            <Plus className="h-3.5 w-3.5" />
            New space
          </Link>
        </li>
      </ul>
    </>
  );
}

type Props = {
  chats: ChatSummary[];
  activeChatId: string | null;
  sending: boolean;
  docsHref: string;
  activeVaultName?: string;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string, e: MouseEvent) => void;
  onImportChats?: () => void;
  onSidebarAction?: () => void;
  onToggleCollapsed?: () => void;
};

export default function AskGideonSidebar({
  chats,
  activeChatId,
  sending,
  docsHref,
  activeVaultName,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onImportChats,
  onSidebarAction,
  onToggleCollapsed,
}: Props) {
  const vaultLabel = activeVaultName?.trim() || "this space";
  const [vaultsOpen, setVaultsOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);
  const [connectionsOpen, setConnectionsOpen] = useState(true);

  return (
    <>
      <div className="shrink-0 border-b border-stone-200 px-3 py-3">
        <div className="mb-3 flex items-start justify-between gap-2">
          <GuardianLogo variant="horizontal" size="sm" className="min-w-0" />
          {onToggleCollapsed ? (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Minimize sidebar"
              title="Minimize sidebar"
              className="shrink-0 rounded-full p-1.5 text-ink-muted transition hover:bg-white hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onSidebarAction?.();
          }}
          disabled={sending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>
        {onImportChats ? (
          <button
            type="button"
            onClick={() => {
              onImportChats();
              onSidebarAction?.();
            }}
            disabled={sending}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
          >
            <Import className="h-4 w-4" />
            Import chats
          </button>
        ) : null}
      </div>

      <div
        className={`shrink-0 overflow-y-auto border-b border-stone-200 p-2 ${
          vaultsOpen ? "max-h-[32%]" : ""
        }`}
      >
        <CollapsibleSection
          title="Spaces"
          open={vaultsOpen}
          onToggle={() => setVaultsOpen((o) => !o)}
        >
          <p className="mb-1 px-2 text-[10px] text-ink-muted">
            Right-click a vault to add a sub-vault.
          </p>
          <VaultList onPicked={onSidebarAction} />
        </CollapsibleSection>
      </div>

      <div className="shrink-0 border-b border-stone-200 p-2">
        <CollapsibleSection
          title="Connections"
          open={connectionsOpen}
          onToggle={() => setConnectionsOpen((o) => !o)}
        >
          <AskConnectedSourcesPanel onNavigate={onSidebarAction} />
        </CollapsibleSection>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <CollapsibleSection
          title={`Chats · ${vaultLabel}`}
          open={chatsOpen}
          onToggle={() => setChatsOpen((o) => !o)}
        >
          {chats.length === 0 ? (
            <p className="px-2 py-2 text-xs text-ink-muted">No chats yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {chats.map((c) => (
                <li key={c.id}>
                  <div
                    className={`group flex items-center gap-1 rounded-lg ${
                      c.id === activeChatId
                        ? "bg-white ring-1 ring-stone-200"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        void onSelectChat(c.id);
                        onSidebarAction?.();
                      }}
                      className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm hover:text-foreground"
                    >
                      <span className="block truncate">{c.title || "New chat"}</span>
                      {c.imported_from ? (
                        <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                          From {c.imported_from === "chatgpt" ? "ChatGPT" : "Claude"}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void onDeleteChat(c.id, e)}
                      aria-label={`Delete ${c.title}`}
                      className="mr-1 rounded-md p-1.5 text-ink-muted opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CollapsibleSection>
      </div>

      <div className="shrink-0 border-t border-stone-200 p-3">
        <Link
          href={docsHref}
          className="text-xs font-medium text-ink-muted hover:text-foreground"
        >
          ← Docs
        </Link>
      </div>
    </>
  );
}
