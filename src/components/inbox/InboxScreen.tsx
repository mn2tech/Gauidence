"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FolderInput,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
} from "lucide-react";
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
  spaces,
  canFile,
  filingId,
  onFile,
}: {
  message: InboxMockMessage;
  spaceName: string | null;
  spaces: { id: string; display_name: string }[];
  canFile: boolean;
  filingId: string | null;
  onFile: (messageId: string, spaceId: string) => void;
}) {
  const askHref = `${ASK_GIDEON_PATH}?draft=${encodeURIComponent(
    `Help me with this email from ${message.fromName}: ${message.subject}`
  )}`;
  const busy = filingId === message.id;
  const suggestId = message.suggestedSpaceId;
  const suggestLabel = message.suggestedSpaceLabel;
  const otherSpaces = spaces.filter(
    (s) => s.id !== message.assignedSpaceId && s.id !== suggestId
  );

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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={askHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-light/50 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand-light"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Ask Gideon
        </Link>
        {canFile && !message.assignedSpaceId && suggestId && suggestLabel ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onFile(message.id, suggestId)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-subtle bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <FolderInput className="h-3.5 w-3.5" aria-hidden />
            )}
            File to {suggestLabel}
          </button>
        ) : null}
        {canFile && !message.assignedSpaceId && spaces.length > 0 ? (
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="sr-only">File to another Space</span>
            <select
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                const spaceId = e.target.value;
                e.target.value = "";
                if (spaceId) onFile(message.id, spaceId);
              }}
              className="max-w-[10rem] rounded-lg border border-border-subtle bg-white px-2 py-1.5 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              <option value="" disabled>
                {suggestId ? "Other space…" : "File to…"}
              </option>
              {(suggestId
                ? otherSpaces
                : spaces.filter((s) => s.id !== message.assignedSpaceId)
              ).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {canFile && message.assignedSpaceId ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
            <FolderInput className="h-3.5 w-3.5" aria-hidden />
            Filed
          </span>
        ) : null}
      </div>
    </li>
  );
}

export default function InboxScreen() {
  const router = useRouter();
  const { profiles, active, loading: profilesLoading } = useActiveProfile();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<InboxFilterId>("all");
  const [connected, setConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<InboxMockMessage[] | null>(
    null
  );
  const [loadingMail, setLoadingMail] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyAccount, setBusyAccount] = useState(false);
  const [filingId, setFilingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  const spaces = useMemo(() => topLevelProfiles(profiles), [profiles]);

  const mockMessages = useMemo(
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

  const clearGmailQuery = useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("gmail") && !url.searchParams.has("reason")) {
      return;
    }
    url.searchParams.delete("gmail");
    url.searchParams.delete("reason");
    router.replace(url.pathname + (url.search || ""));
  }, [router]);

  const loadMessages = useCallback(async () => {
    setLoadingMail(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inbox/messages?filter=${encodeURIComponent(filter)}`
      );
      const body = (await res.json().catch(() => ({}))) as {
        connected?: boolean;
        email?: string | null;
        lastSyncAt?: string | null;
        sourceId?: string | null;
        messages?: InboxMockMessage[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't load inbox.");
      }
      setConnected(Boolean(body.connected));
      setGmailEmail(body.email ?? null);
      setSourceId(body.sourceId ?? null);
      setLastSyncAt(body.lastSyncAt ?? null);
      setLiveMessages(body.connected ? body.messages ?? [] : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load inbox.");
      setLiveMessages(null);
      setConnected(false);
      setSourceId(null);
    } finally {
      setLoadingMail(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const gmail = searchParams.get("gmail");
    const reason = searchParams.get("reason");
    if (!gmail) return;
    if (gmail === "connected") {
      setBanner("Gmail connected. Syncing your recent mail…");
      void (async () => {
        setSyncing(true);
        try {
          const res = await fetch("/api/inbox/sync", { method: "POST" });
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            upserted?: number;
          };
          if (!res.ok) throw new Error(body.error ?? "Sync failed.");
          setBanner(
            `Synced ${body.upserted ?? 0} recent messages from Gmail.`
          );
          await loadMessages();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Sync failed.");
          setBanner(null);
        } finally {
          setSyncing(false);
          clearGmailQuery();
        }
      })();
    } else if (gmail === "denied") {
      setError("Gmail access was cancelled or denied.");
      clearGmailQuery();
    } else if (gmail === "not_configured") {
      setError(
        "Gmail isn’t configured on this deployment. Enable the Gmail API and add the Gmail callback URI to your Google OAuth client."
      );
      clearGmailQuery();
    } else if (gmail === "error") {
      if (reason === "migration") {
        setError(
          "Gmail connected source isn’t ready in the database. Apply migration 0115_gmail_inbox.sql in Supabase, then try again."
        );
      } else if (reason === "state") {
        setError(
          "Gmail sign-in expired or cookies were blocked. Try Connect Gmail again in the same browser tab."
        );
      } else if (reason === "provider") {
        setError(
          "Google rejected the request. Confirm the Gmail callback URI is listed on your OAuth client (redirect_uri_mismatch)."
        );
      } else {
        setError(
          "Couldn't connect Gmail. Check Google Cloud (Gmail API, gmail.readonly scope, callback URI) and that migration 0115 is applied."
        );
      }
      clearGmailQuery();
    }
  }, [searchParams, loadMessages, clearGmailQuery]);

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox/sync", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        upserted?: number;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Sync failed.");
      }
      setBanner(`Synced ${body.upserted ?? 0} recent messages.`);
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const connectGmail = (opts?: { switchAccount?: boolean }) => {
    const profileId = active?.id ?? "";
    const q = new URLSearchParams({ returnTo: "/inbox" });
    if (profileId) q.set("profileId", profileId);
    if (opts?.switchAccount) q.set("switch", "1");
    window.location.href = `/api/connections/gmail/start?${q.toString()}`;
  };

  const disconnectGmail = async () => {
    if (!sourceId) return;
    setBusyAccount(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${encodeURIComponent(sourceId)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't disconnect Gmail.");
      }
      setConfirmDisconnect(false);
      setBanner("Gmail disconnected. Showing sample mail until you connect again.");
      setConnected(false);
      setGmailEmail(null);
      setSourceId(null);
      setLiveMessages(null);
      setLastSyncAt(null);
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect Gmail.");
    } finally {
      setBusyAccount(false);
    }
  };

  const fileMessage = async (messageId: string, spaceId: string) => {
    setFilingId(messageId);
    setError(null);
    try {
      const res = await fetch(
        `/api/inbox/messages/${encodeURIComponent(messageId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceId }),
        }
      );
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: InboxMockMessage;
        spaceName?: string;
      };
      if (!res.ok) {
        throw new Error(body.error ?? "Couldn't file that message.");
      }
      if (body.message) {
        setLiveMessages((prev) =>
          prev
            ? prev.map((m) => (m.id === messageId ? body.message! : m))
            : prev
        );
      }
      setBanner(
        body.spaceName
          ? `Filed to ${body.spaceName}.`
          : "Filed to Space."
      );
      // Refresh so filter views (e.g. Unsorted) update.
      await loadMessages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't file that message.");
    } finally {
      setFilingId(null);
    }
  };

  const usingLive = connected && liveMessages != null;
  const messages = usingLive
    ? liveMessages
    : !loadingMail
      ? filterInboxMessages(mockMessages, filter)
      : [];

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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-brand" aria-hidden />
            <h1 className="text-xl font-semibold text-foreground">Inbox</h1>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {usingLive
              ? gmailEmail
                ? `Mail from ${gmailEmail}`
                : "Your connected Gmail"
              : "Connect any Google account to replace sample mail with your real inbox."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {usingLive ? (
            <>
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={syncing || busyAccount}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-elevated disabled:opacity-60"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                )}
                Sync
              </button>
              <button
                type="button"
                onClick={() => setConfirmSwitch(true)}
                disabled={busyAccount || syncing}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-elevated disabled:opacity-60"
              >
                Change Gmail
              </button>
              <button
                type="button"
                onClick={() => setConfirmDisconnect(true)}
                disabled={busyAccount || syncing}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => connectGmail()}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden />
              Connect Gmail
            </button>
          )}
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}
      {banner ? (
        <p className="rounded-xl border border-brand/25 bg-brand-light/40 px-4 py-3 text-sm text-foreground">
          {banner}
        </p>
      ) : null}

      {!usingLive ? (
        <div
          role="status"
          className="rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm text-ink-muted"
        >
          <p className="font-medium text-foreground">Sample mail</p>
          <p className="mt-0.5">
            Preview threads until you connect Gmail (same Google sign-in as
            ChatGPT or Claude). Manage connectors anytime in{" "}
            <Link
              href={CONNECTIONS_PATH}
              className="font-semibold text-brand hover:text-brand-dark"
            >
              Settings → Connections
            </Link>
            .
          </p>
        </div>
      ) : lastSyncAt ? (
        <p className="text-xs text-ink-muted">
          Last synced {new Date(lastSyncAt).toLocaleString()}
          {gmailEmail ? ` · ${gmailEmail}` : ""}
        </p>
      ) : null}

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

      {loadingMail ? (
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading mail…
        </p>
      ) : messages.length === 0 ? (
        <div className="simple-home-card flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Mail className="h-8 w-8 text-ink-muted" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            Nothing in this view
          </p>
          <p className="text-sm text-ink-muted">
            {usingLive
              ? "Try Sync, or another filter."
              : "Try All, or another Space filter."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => {
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
                spaces={spaces.map((s) => ({
                  id: s.id,
                  display_name: s.display_name,
                }))}
                canFile={usingLive}
                filingId={filingId}
                onFile={(id, spaceId) => void fileMessage(id, spaceId)}
              />
            );
          })}
        </ul>
      )}

      {confirmDisconnect ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inbox-disconnect-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
            <h3
              id="inbox-disconnect-title"
              className="text-lg font-semibold text-foreground"
            >
              Disconnect Gmail?
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              Guardian stops syncing
              {gmailEmail ? ` ${gmailEmail}` : " this account"} and clears
              synced messages here. You can connect again anytime.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDisconnect(false)}
                className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void disconnectGmail()}
                disabled={busyAccount}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busyAccount ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmSwitch ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inbox-switch-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
            <h3
              id="inbox-switch-title"
              className="text-lg font-semibold text-foreground"
            >
              Use a different Gmail?
            </h3>
            <p className="mt-2 text-sm text-ink-muted">
              Google will let you pick another account. If you choose a
              different address, synced mail from
              {gmailEmail ? ` ${gmailEmail}` : " the current account"} is
              cleared so inboxes don’t mix.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmSwitch(false)}
                className="rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-foreground hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmSwitch(false);
                  connectGmail({ switchAccount: true });
                }}
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Continue to Google
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
