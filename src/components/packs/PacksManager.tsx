"use client";

import { useCallback, useEffect, useState } from "react";
import type { PackListItem } from "@/lib/packs/types";

type Props = {
  profileId: string;
  profileName: string;
};

export default function PacksManager({ profileId, profileName }: Props) {
  const [packs, setPacks] = useState<PackListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/packs?profileId=${encodeURIComponent(profileId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load packs.");
      }
      const data = await res.json();
      setPacks(data.packs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const installed = packs.filter((p) => p.installation?.status === "installed");
  const available = packs.filter((p) => p.installation?.status !== "installed");

  return (
    <div className="space-y-10">
      <p className="text-sm text-ink-muted">
        Packs for <span className="font-medium text-ink">{profileName}</span>.
        Packs teach Guardian how to understand this organization — they do not
        duplicate your documents.
      </p>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading packs…</p>
      ) : (
        <>
          <section>
            <h2 className="text-lg font-semibold tracking-tight">
              Installed Packs
            </h2>
            {installed.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                No packs installed yet. Install Guardian Business below to get
                started.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {installed.map((item) => (
                  <PackCard
                    key={item.pack.id}
                    item={item}
                    profileId={profileId}
                    installed
                  />
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight">
              Available Packs
            </h2>
            {available.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                All available packs are installed.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {available.map((item) => (
                  <PackCard
                    key={item.pack.id}
                    item={item}
                    profileId={profileId}
                    installed={false}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function PackCard({
  item,
  profileId,
  installed,
}: {
  item: PackListItem;
  profileId: string;
  installed: boolean;
}) {
  const version = item.latestVersion?.version ?? "—";
  const base = `/settings/packs/${item.pack.slug}?profileId=${encodeURIComponent(profileId)}`;

  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">{item.pack.name}</h3>
          <p className="mt-1 text-sm text-ink-muted">{item.pack.description}</p>
          <p className="mt-2 text-xs text-ink-muted">
            Version {version}
            {item.pack.pack_number != null
              ? ` · Pack #${String(item.pack.pack_number).padStart(3, "0")}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={base}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-50"
          >
            View
          </a>
          {installed ? (
            <>
              <a
                href={`${base}&tab=configure`}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-50"
              >
                Configure
              </a>
              <a
                href={`${base}&tab=analyze`}
                className="rounded-lg border border-stone-200 px-3 py-1.5 text-sm font-medium hover:bg-stone-50"
              >
                Analyze Knowledge
              </a>
              <a
                href={`/settings/packs/${item.pack.slug}/dashboard?profileId=${encodeURIComponent(profileId)}`}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Dashboard
              </a>
            </>
          ) : (
            <a
              href={`${base}&tab=install`}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              Install
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
