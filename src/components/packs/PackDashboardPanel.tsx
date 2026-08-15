"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardCardData } from "@/lib/packs/types";

type Props = {
  slug: string;
  profileId: string;
  profileName: string;
};

export default function PackDashboardPanel({
  slug,
  profileId,
  profileName,
}: Props) {
  const [cards, setCards] = useState<DashboardCardData[]>([]);
  const [packName, setPackName] = useState("Business Pack");
  const [version, setVersion] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/packs/${encodeURIComponent(slug)}/dashboard?profileId=${encodeURIComponent(profileId)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to load dashboard.");
      }
      const data = await res.json();
      setPackName(data.dashboard.packName);
      setVersion(data.dashboard.version);
      setCards(data.dashboard.cards ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [slug, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{packName}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Dashboard for {profileName}
          {version ? ` · v${version}` : ""}. Counts reflect Guardian data only —
          never invented metrics.
        </p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <a
            href={`/settings/packs/${slug}?profileId=${encodeURIComponent(profileId)}&tab=analyze`}
            className="font-semibold text-brand hover:text-brand-dark"
          >
            Analyze knowledge →
          </a>
          <a
            href={`/settings/packs/${slug}/ontology?profileId=${encodeURIComponent(profileId)}`}
            className="font-semibold text-brand hover:text-brand-dark"
          >
            Ontology Explorer →
          </a>
          <a href="/" className="font-semibold text-brand hover:text-brand-dark">
            Ask Gideon →
          </a>
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-ink-muted">Loading dashboard…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <article
              key={card.key}
              className="rounded-2xl border border-stone-200 bg-white p-5"
            >
              <h2 className="font-semibold tracking-tight">{card.title}</h2>
              {card.count != null && card.count > 0 ? (
                <>
                  <p className="mt-2 text-3xl font-bold tabular-nums">
                    {card.count}
                  </p>
                  <ul className="mt-3 space-y-1 text-sm text-ink-muted">
                    {card.items.slice(0, 5).map((item) => (
                      <li key={item.id}>
                        {item.href ? (
                          <a
                            href={item.href}
                            className="hover:text-brand hover:underline"
                          >
                            {item.label}
                          </a>
                        ) : (
                          item.label
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">{card.empty}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
