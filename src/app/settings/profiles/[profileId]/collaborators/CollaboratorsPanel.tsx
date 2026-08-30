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
  collaboratorRoleDescription,
  collaboratorRoleLabel,
  parseCollaboratorInviteRole,
  profileTypeLabel,
  type GuardianProfile,
  type GuardianProfileCollaboratorRole,
} from "@/lib/profiles/types";
import { collaboratorDisplayName } from "@/lib/profiles/collaboratorDisplay";
import ClientSharingPanel from "@/components/ClientSharingPanel";

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
  role: string;
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
  const [inviteRole, setInviteRole] =
    useState<GuardianProfileCollaboratorRole>("editor");
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

  useEffect(() => {
    if (profile?.profile_type === "client") {
      setInviteRole("viewer");
    }
  }, [profile?.profile_type]);

  if (!profile || !canManageProfileAccess(profile)) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-ink-muted">
          Only the owner of a shareable vault can manage collaborators.
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
        body: JSON.stringify({ email, role: inviteRole }),
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

  const updateMemberRole = async (
    userId: string,
    role: GuardianProfileCollaboratorRole
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/profiles/${profileId}/collaborators/${userId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Couldn't update access level.");
        return;
      }
      await load();
      await refresh();
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

  const vaultName = vault?.display_name ?? profile.display_name;
  const vaultKind = vault?.profile_type ?? profile.profile_type;

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
            Invite people to the{" "}
            <span className="font-medium text-foreground">
              {profileTypeLabel(vaultKind).toLowerCase()} Space
            </span>{" "}
            <span className="font-medium text-foreground">{vaultName}</span>.
            {vaultKind === "client" ? (
              <>
                {" "}
                Invite clients as <strong>View</strong> (read-only). Editors can
                add documents and Daily Logs. Use{" "}
                <strong>What clients can see</strong> below to choose which files
                viewers can access — other documents stay internal. Sibling
                Spaces are not shared.
              </>
            ) : vaultKind === "business" || vaultKind === "non_profit" ? (
              <>
                {" "}
                For a stakeholder demo, invite as <strong>Edit</strong> so they
                can open Files and Ask Gideon across this Space&apos;s documents.
                Viewers only see documents marked shared below. Nested client
                Spaces are not included unless invited separately.
              </>
            ) : vaultKind === "family" ? (
              <>
                {" "}
                Invite a spouse or partner as <strong>Edit</strong> so you both
                see the same Today — school, kids, and home. Nested Spaces stay
                private unless invited separately.
              </>
            ) : (
              <>
                {" "}
                Choose view or edit access. Editors can add documents and Daily
                Logs. Viewers only see documents you mark as shared below.
              </>
            )}
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
        <h2 className="text-sm font-semibold">Invite someone</h2>
        <form onSubmit={invite} className="mt-3 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                vaultKind === "family"
                  ? "partner@email.com"
                  : "colleague@company.com"
              }
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
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label
              htmlFor="invite-access-level"
              className="text-xs font-medium text-ink-muted"
            >
              Access level
            </label>
            <select
              id="invite-access-level"
              value={inviteRole}
              onChange={(e) =>
                setInviteRole(parseCollaboratorInviteRole(e.target.value))
              }
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand sm:max-w-xs"
            >
              <option value="editor">Edit — add and change vault content</option>
              <option value="viewer">View — read and ask Gideon only</option>
            </select>
          </div>
          <p className="text-xs text-ink-muted">
            {collaboratorRoleDescription(inviteRole)}
          </p>
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
                    {collaboratorDisplayName(m)}
                    {m.isYou ? " (you)" : ""}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {collaboratorRoleLabel(m.role)}
                    {m.fullName && m.email ? ` · ${m.email}` : ""}
                  </p>
                </div>
                {m.role === "editor" || m.role === "viewer" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={m.role}
                      disabled={busy}
                      onChange={(e) =>
                        void updateMemberRole(
                          m.userId,
                          parseCollaboratorInviteRole(e.target.value)
                        )
                      }
                      className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-foreground"
                      aria-label={`Access level for ${collaboratorDisplayName(m)}`}
                    >
                      <option value="editor">Edit</option>
                      <option value="viewer">View</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeMember(m.userId)}
                      className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-2.5 py-1 text-xs font-medium text-foreground hover:bg-stone-50 disabled:opacity-50"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
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
                    {collaboratorRoleLabel(inv.role)} · Expires{" "}
                    {new Date(inv.expiresAt).toLocaleDateString()}
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

      {vaultKind === "client" ? (
        <ClientSharingPanel profileId={profileId} vaultName={vaultName} />
      ) : vaultKind === "business" || vaultKind === "non_profit" ? (
        <ClientSharingPanel
          profileId={profileId}
          vaultName={vaultName}
          audienceLabel="viewers"
        />
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
