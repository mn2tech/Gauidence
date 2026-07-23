"use client";

import Link from "next/link";
import { useState, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  nestedUnder,
  profileSubtitle,
  profileTypeLabel,
  topLevelProfiles,
  type GuardianProfile,
} from "@/lib/profiles/types";

type ChatSummary = {
  id: string;
  title: string;
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
      className={`flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-sm transition ${
        indented ? "pl-6 pr-2" : "px-2"
      } ${
        selected
          ? "bg-white font-medium text-foreground ring-1 ring-brand/30"
          : "text-foreground/90 hover:bg-white/80"
      }`}
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

function VaultList({ onPicked }: { onPicked?: () => void }) {
  const { profiles, active, loading, switchProfile } = useActiveProfile();
  const topLevel = topLevelProfiles(profiles);

  const pick = (id: string) => {
    if (active?.id === id) {
      onPicked?.();
      return;
    }
    void switchProfile(id).then(() => onPicked?.());
  };

  if (loading && !active) {
    return <p className="px-2 py-1 text-xs text-ink-muted">Loading vaults…</p>;
  }

  if (topLevel.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-ink-muted">
        No vaults yet.{" "}
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
    <ul className="space-y-0.5" role="listbox" aria-label="Vaults">
      {topLevel.map((p) => {
        const children = nestedUnder(profiles, p);
        return (
          <li key={p.id}>
            <VaultRow
              profile={p}
              selected={active?.id === p.id}
              onSelect={() => pick(p.id)}
            />
            {children.map((child) => (
              <VaultRow
                key={child.id}
                profile={child}
                selected={active?.id === child.id}
                indented
                onSelect={() => pick(child.id)}
              />
            ))}
          </li>
        );
      })}
      <li className="pt-1">
        <Link
          href="/settings/profiles?add=1&return=%2Fask"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-brand hover:bg-white/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Add vault
        </Link>
      </li>
    </ul>
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
  onSidebarAction?: () => void;
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
  onSidebarAction,
}: Props) {
  const vaultLabel = activeVaultName?.trim() || "this vault";
  const [vaultsOpen, setVaultsOpen] = useState(true);
  const [chatsOpen, setChatsOpen] = useState(true);

  return (
    <>
      <div className="shrink-0 border-b border-stone-200 p-3">
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
      </div>

      <div
        className={`shrink-0 overflow-y-auto border-b border-stone-200 p-2 ${
          vaultsOpen ? "max-h-[38%]" : ""
        }`}
      >
        <CollapsibleSection
          title="Vaults"
          open={vaultsOpen}
          onToggle={() => setVaultsOpen((o) => !o)}
        >
          <VaultList onPicked={onSidebarAction} />
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
                      {c.title || "New chat"}
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
