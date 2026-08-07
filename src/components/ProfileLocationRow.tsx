"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import GetDirectionsButton from "@/components/GetDirectionsButton";
import { formatProfileAddress } from "@/lib/location/directions";
import { canManageProfileAccess, type GuardianProfile } from "@/lib/profiles/types";

type Props = {
  profile: GuardianProfile;
  onSaved?: () => void | Promise<void>;
};

export default function ProfileLocationRow({ profile, onSaved }: Props) {
  const address = formatProfileAddress(profile);
  const canEdit = canManageProfileAccess(profile);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(profile.location_address ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationAddress: value.trim() || null }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't save address.");
        return;
      }
      setEditing(false);
      await onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="mt-1 space-y-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          placeholder="123 Main St, City, ST"
          className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs outline-none ring-brand focus:ring-2"
        />
        {error ? (
          <p className="text-[11px] text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setValue(profile.location_address ?? "");
              setError(null);
            }}
            className="text-[11px] text-ink-muted hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {address ? (
        <p className="text-xs text-ink-muted">{address}</p>
      ) : canEdit ? (
        <p className="text-xs text-ink-muted">No address yet</p>
      ) : null}
      {address ? <GetDirectionsButton destination={address} /> : null}
      {canEdit ? (
        <button
          type="button"
          onClick={() => {
            setValue(profile.location_address ?? address ?? "");
            setEditing(true);
            setError(null);
          }}
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-brand-dark hover:underline"
        >
          <Pencil className="h-3 w-3" aria-hidden />
          {address ? "Edit address" : "Add address"}
        </button>
      ) : null}
    </div>
  );
}
