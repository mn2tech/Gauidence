"use client";

import { useEffect, useState } from "react";

type ProfileOption = {
  id: string;
  display_name: string | null;
  profile_type: string | null;
};

type Props = {
  summitSlug: string;
};

export default function SummitAdminSetup({ summitSlug }: Props) {
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((json) => {
        const rows = (json.profiles ?? json ?? []) as ProfileOption[];
        const list = Array.isArray(rows) ? rows : [];
        setProfiles(list);
        const summitProfile = list.find(
          (p) =>
            p.display_name?.includes("Small Business Government Contracting Summit")
        );
        const eventProfile = list.find((p) => p.profile_type === "event");
        setSelectedId(summitProfile?.id ?? eventProfile?.id ?? list[0]?.id ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function linkProfile() {
    if (!selectedId) return;
    setLinking(true);
    setError(null);
    const res = await fetch(`/api/summit/${summitSlug}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId: selectedId }),
    });
    const json = await res.json().catch(() => ({}));
    setLinking(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => window.location.reload(), 600);
    } else {
      setError(json.error ?? "Could not link summit profile");
    }
  }

  if (loading) {
    return (
      <p className="mt-4 text-sm text-ink-muted">Loading your Guardian profiles…</p>
    );
  }

  if (done) {
    return (
      <p className="mt-4 text-sm text-brand">Summit linked. Reloading admin…</p>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <h2 className="font-semibold text-amber-950">Link this summit to Guardian</h2>
      <p className="mt-2 text-sm text-amber-900">
        Summit admin is not connected to a Guardian profile yet. Link your event
        space to review community contributions and capture summit intelligence.
      </p>
      {profiles.length === 0 ? (
        <p className="mt-3 text-sm text-amber-900">
          Create an event Guardian profile first, then return here to link it.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-xl border border-amber-200 bg-white p-3 text-base"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name ?? "Guardian profile"}
                {profile.profile_type ? ` (${profile.profile_type})` : ""}
              </option>
            ))}
          </select>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <button
            type="button"
            onClick={linkProfile}
            disabled={linking || !selectedId}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {linking ? "Linking…" : "Link Summit Profile"}
          </button>
        </div>
      )}
    </div>
  );
}
