"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Loader2,
  Mail,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  canManageProfileAccess,
  type GuardianProfile,
} from "@/lib/profiles/types";

type Member = {
  userId: string;
  role: string;
  email: string | null;
  fullName: string | null;
  isYou: boolean;
  createdAt: string;
};

type Invitation = {
  id: string;
  email: string;
  expiresAt: string;
  createdAt: string;
};

export default function CollaboratorsPanel({
  profileId,
}: {
  profileId: string;
}) {
  const router = useRouter();
  const { profiles, refresh } = useActiveProfile();
  const profile = profiles.find((p) => p.id === profileId) ?? null;

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [vault, setVault] = useState<GuardianProfile | null>(profile);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}/collaborators`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        profile?: GuardianProfile;
        members?: Member[];
        invitations?: Invitation[];
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load access settings.");
        return;
      }
      setVault(body.profile ?? null);
      setMembers(body.members ?? []);
      setInvitations(body.invitations ?? []);
    } catch {
      setError("Couldn't load access settings.");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!profile || !canManageProfileAccess(profile)) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-ink-muted">
          Only the owner of a business or client vault can manage collaborators.
        </p>
        <Link
          href="/settings/profiles"
          className="mt-4 inline-flex text-sm font-semibold text-brand hover:text-brand-dark"
        >
          Back to people &amp; spaces
        </Link>
      </div>
    );
  }

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setLastInviteUrl(null);
    try {
      const res = await fetch(`/api/profiles/${profileId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        acceptUrl?: string;
        emailed?: boolean;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't send invitation.");
        return;
      }
      setEmail("");
      setLastInviteUrl(body.acceptUrl ?? null);
      if (!body.emailed && body.acceptUrl) {
        setError(
          "Invitation created, but email couldn't be sent. Copy the link below and share it yourself."
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revokeInvite = async (invitationId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/profiles/${profileId}/collaborators/invitations/${invitationId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't revoke invitation.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!window.confirm("Remove this collaborator's access to the vault?")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/profiles/${profileId}/collaborators/${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't remove collaborator.");
        return;
      }
      await load();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy the link. Select and copy it manually.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/settings/profiles"
            className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            People &amp; spaces
          </Link>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">
            Manage access
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Invite Editors to{" "}
            <span className="font-medium text-foreground">
              {vault?.display_name ?? profile.display_name}
            </span>
            . They can add documents and Daily Logs and Ask Gideon. Their chats
            stay private.
          </p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
          <Users className="h-5 w-5" />
        </span>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold">Invite an Editor</h2>
        <form onSubmit={invite} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@company.com"
            className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Send invite
          </button>
        </form>
        {lastInviteUrl ? (
          <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <p className="text-xs font-medium text-ink-muted">Invite link</p>
            <p className="mt-1 break-all text-xs text-foreground">
              {lastInviteUrl}
            </p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold">People with access</h2>
        {loading ? (
          <p className="mt-3 text-sm text-ink-muted">Loading…</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.fullName || m.email || "Member"}
                    {m.isYou ? " (you)" : ""}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {m.role === "owner" ? "Owner" : "Editor"}
                    {m.email ? ` · ${m.email}` : ""}
                  </p>
                </div>
                {m.role === "editor" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeMember(m.userId)}
                    className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {invitations.length > 0 ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Pending invitations</h2>
          <ul className="mt-3 divide-y divide-stone-100">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <Mail className="h-3.5 w-3.5 text-ink-muted" />
                    {inv.email}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revokeInvite(inv.id)}
                  aria-label={`Revoke invite to ${inv.email}`}
                  className="rounded-full p-1.5 text-ink-muted hover:bg-stone-100 hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => router.push("/settings/profiles")}
        className="text-sm font-medium text-ink-muted hover:text-foreground"
      >
        Done
      </button>
    </div>
  );
}
