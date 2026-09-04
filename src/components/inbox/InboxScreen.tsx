"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, Mail, Sparkles } from "lucide-react";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  buildInboxMockMessages,
  filterInboxMessages,
  formatInboxReceivedAt,
  type InboxFilterId,
  type InboxMockMessage,
} from "@/lib/inbox/mockMail";
import { topLevelProfiles } from "@/lib/profiles/types";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";

const CONNECTIONS_PATH = "/settings/connections";

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-brand bg-brand-light text-brand-dark ring-1 ring-brand/25"
          : "border-border-subtle bg-surface text-ink-muted hover:border-brand/40 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function MessageRow({
  message,
  spaceName,
}: {
  message: InboxMockMessage;
  spaceName: string | null;
}) {
  const askHref = `${ASK_GIDEON_PATH}?draft=${encodeURIComponent(
    `Help me with this email from ${message.fromName}: ${message.subject}`
  )}`;

  return (
    <li className="simple-home-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {message.fromName}
            </p>
            {message.needsAttention ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                Needs attention
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground">
            {message.subject}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">
            {message.preview}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {spaceName ? (
              <span>
                {message.assignedSpaceId ? "In" : "Suggested"}{" "}
                <span className="font-medium text-foreground">{spaceName}</span>
              </span>
            ) : (
              <span>Unsorted</span>
            )}
            {message.bucket === "bills" ? <span>Bills</span> : null}
            {message.bucket === "school" ? <span>School</span> : null}
          </div>
        </div>
        <time
          dateTime={message.receivedAt}
          className="shrink-0 text-xs text-ink-muted"
        >
          {formatInboxReceivedAt(message.receivedAt)}
        </time>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={askHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-light/50 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand-light"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Ask Gideon
        </Link>
        {!message.assignedSpaceId && message.suggestedSpaceLabel ? (
          <button
            type="button"
            disabled
            title="Filing to Spaces arrives with live email sync"
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-semibold text-ink-muted opacity-70"
          >
            File to {message.suggestedSpaceLabel}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function InboxScreen() {
  const { profiles, loading: profilesLoading } = useActiveProfile();
  const [filter, setFilter] = useState<InboxFilterId>("all");

  const spaces = useMemo(() => topLevelProfiles(profiles), [profiles]);

  const messages = useMemo(
    () =>
      buildInboxMockMessages(
        spaces.map((s) => ({
          id: s.id,
          display_name: s.display_name,
          profile_type: s.profile_type,
        }))
      ),
    [spaces]
  );

  const visible = useMemo(
    () => filterInboxMessages(messages, filter),
    [messages, filter]
  );

  const spaceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of spaces) map.set(s.id, s.display_name);
    return map;
  }, [spaces]);

  if (profilesLoading) {
    return <p className="p-6 text-sm text-ink-muted">Loading inbox…</p>;
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ProfileSetupHub returnTo="/inbox" />
      </div>
    );
  }

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-8">
      <header>
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-brand" aria-hidden />
          <h1 className="text-xl font-semibold text-foreground">Inbox</h1>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Preview how mail will route into your Spaces — Bills, School, and more.
        </p>
      </header>

      <div
        role="status"
        className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm text-ink-muted"
      >
        <p className="font-medium text-foreground">Sample mail</p>
        <p className="mt-0.5">
          Live inbox sync isn&apos;t connected yet. These threads show how filters
          will work.{" "}
          <Link
            href={CONNECTIONS_PATH}
            className="font-semibold text-brand hover:text-brand-dark"
          >
            Connections
          </Link>
        </p>
      </div>

      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="toolbar"
        aria-label="Inbox filters"
      >
        <FilterChip
          active={filter === "all"}
          label="All"
          onClick={() => setFilter("all")}
        />
        <FilterChip
          active={filter === "needs_attention"}
          label="Needs attention"
          onClick={() => setFilter("needs_attention")}
        />
        <FilterChip
          active={filter === "unsorted"}
          label="Unsorted"
          onClick={() => setFilter("unsorted")}
        />
        <FilterChip
          active={filter === "bills"}
          label="Bills"
          onClick={() => setFilter("bills")}
        />
        <FilterChip
          active={filter === "school"}
          label="School"
          onClick={() => setFilter("school")}
        />
        {spaces.map((space) => {
          const id: InboxFilterId = `space:${space.id}`;
          return (
            <FilterChip
              key={space.id}
              active={filter === id}
              label={space.display_name}
              onClick={() => setFilter(id)}
            />
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="simple-home-card flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Mail className="h-8 w-8 text-ink-muted" aria-hidden />
          <p className="text-sm font-medium text-foreground">Nothing in this view</p>
          <p className="text-sm text-ink-muted">
            Try All, or another Space filter.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((message) => {
            const spaceId =
              message.assignedSpaceId ?? message.suggestedSpaceId;
            const spaceName =
              (spaceId ? spaceNameById.get(spaceId) : null) ??
              message.suggestedSpaceLabel;
            return (
              <MessageRow
                key={message.id}
                message={message}
                spaceName={spaceName}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
