"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Briefcase, Loader2, Plus, Users } from "lucide-react";
import ProfileLocationRow from "@/components/ProfileLocationRow";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  ACTIVE_CLIENTS_GROUP_LABEL,
  INACTIVE_CLIENTS_GROUP_LABEL,
  activeClientsOf,
  canManageProfileAccess,
  inactiveClientsOf,
  type GuardianProfile,
} from "@/lib/profiles/types";

type Props = {
  parent: GuardianProfile;
  /** Nested inside another card (e.g. simple home vaults). */
  embedded?: boolean;
};

function ClientRow({
  cli,
  openingId,
  statusBusyId,
  onOpenVault,
  onSetStatus,
  onRefresh,
}: {
  cli: GuardianProfile;
  openingId: string | null;
  statusBusyId: string | null;
  onOpenVault: (id: string) => void;
  onSetStatus: (id: string, status: "active" | "inactive") => void;
  onRefresh: () => void | Promise<void>;
}) {
  const isInactive = cli.client_status === "inactive";

  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 py-3 ${
        isInactive ? "opacity-80" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{cli.display_name}</p>
        {cli.description?.trim() ? (
          <p className="text-xs text-ink-muted">{cli.description.trim()}</p>
        ) : null}
        <ProfileLocationRow profile={cli} onSaved={onRefresh} />
      </div>
      <div className="flex flex-wrap gap-2">
        {canManageProfileAccess(cli) ? (
          <Link
            href={`/settings/profiles/${cli.id}/collaborators`}
            className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50"
          >
            <Users className="h-3.5 w-3.5" />
            Client access
          </Link>
        ) : null}
        {canManageProfileAccess(cli) ? (
          <button
            type="button"
            onClick={() =>
              void onSetStatus(cli.id, isInactive ? "active" : "inactive")
            }
            disabled={statusBusyId === cli.id}
            className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-60"
          >
            {statusBusyId === cli.id
              ? "Saving…"
              : isInactive
                ? "Mark active"
                : "Mark inactive"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void onOpenVault(cli.id)}
          disabled={openingId === cli.id}
          className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-60"
        >
          {openingId === cli.id ? "Opening…" : "Open vault"}
        </button>
      </div>
    </li>
  );
}

export default function LinkedClientsPanel({ parent, embedded = false }: Props) {
  const { profiles, refresh, switchProfile } = useActiveProfile();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const activeClients = useMemo(
    () => activeClientsOf(profiles, parent.id),
    [profiles, parent.id]
  );
  const inactiveClients = useMemo(
    () => inactiveClientsOf(profiles, parent.id),
    [profiles, parent.id]
  );

  const addClient = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionId: "client",
          displayName: name.trim(),
          locationAddress: address.trim() || null,
          description: note.trim() || null,
          parentProfileId: parent.id,
          linkedKind: "client",
          switchTo: false,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't add client.");
        return;
      }
      setName("");
      setAddress("");
      setNote("");
      setOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const openVault = async (id: string) => {
    setOpeningId(id);
    setError(null);
    try {
      const ok = await switchProfile(id);
      if (!ok) setError("Couldn't open client vault.");
      else window.dispatchEvent(new CustomEvent("guardian:profile-changed"));
    } finally {
      setOpeningId(null);
    }
  };

  const setClientStatus = async (id: string, status: "active" | "inactive") => {
    setStatusBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientStatus: status }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't update client status.");
        return;
      }
      await refresh();
    } finally {
      setStatusBusyId(null);
    }
  };

  const empty = activeClients.length === 0 && inactiveClients.length === 0;

  return (
    <div
      className={
        embedded
          ? "pt-2"
          : "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-light text-brand">
            <Briefcase className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Clients</h2>
            <p className="text-xs text-ink-muted">
              Separate vaults linked to {parent.display_name}
            </p>
          </div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add client
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {open && (
        <form
          onSubmit={addClient}
          className="mt-4 space-y-3 border-t border-stone-100 pt-4"
        >
          <label className="block text-sm">
            <span className="font-medium">Client name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="Acme Corp"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Site address</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="123 Business Park Dr, City, ST"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-muted">Notes (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
              placeholder="Website redesign · retainer"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Add client
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
              className="rounded-full px-3 py-2 text-sm text-ink-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {empty ? (
        <p className="mt-4 py-3 text-sm text-ink-muted">
          No clients yet. Add one to keep their contracts, invoices, and logs in
          a separate vault under this organization.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {ACTIVE_CLIENTS_GROUP_LABEL}
            </h3>
            <ul className="mt-2 divide-y divide-stone-100">
              {activeClients.length === 0 ? (
                <li className="py-3 text-sm text-ink-muted">
                  No active clients. Mark inactive clients as active to move
                  them here.
                </li>
              ) : (
                activeClients.map((cli) => (
                  <ClientRow
                    key={cli.id}
                    cli={cli}
                    openingId={openingId}
                    statusBusyId={statusBusyId}
                    onOpenVault={openVault}
                    onSetStatus={setClientStatus}
                    onRefresh={refresh}
                  />
                ))
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {INACTIVE_CLIENTS_GROUP_LABEL}
            </h3>
            <ul className="mt-2 divide-y divide-stone-100">
              {inactiveClients.length === 0 ? (
                <li className="py-3 text-sm text-ink-muted">
                  No inactive clients. Mark a client inactive when the
                  relationship didn&apos;t work out.
                </li>
              ) : (
                inactiveClients.map((cli) => (
                  <ClientRow
                    key={cli.id}
                    cli={cli}
                    openingId={openingId}
                    statusBusyId={statusBusyId}
                    onOpenVault={openVault}
                    onSetStatus={setClientStatus}
                    onRefresh={refresh}
                  />
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
