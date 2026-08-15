"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardCardData } from "@/lib/packs/types";

type DashboardSummary = {
  clients: number;
  openProposals: number;
  followUps: number;
  expiringContracts: number;
  entities: number;
};

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
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
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
      setSummary(data.dashboard.summary ?? null);
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
          Live dashboard for {profileName}
          {version ? ` · v${version}` : ""}. Counts come from Guardian data only —
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
          <a
            href={`/ask?profileId=${encodeURIComponent(profileId)}`}
            className="font-semibold text-brand hover:text-brand-dark"
          >
            Ask Gideon →
          </a>
          <button
            type="button"
            onClick={() => void load()}
            className="font-semibold text-ink-muted hover:text-ink"
          >
            Refresh
          </button>
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
        <>
          {summary ? (
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
              <li>
                <span className="font-semibold tabular-nums text-ink">
                  {summary.clients}
                </span>{" "}
                clients
              </li>
              <li>
                <span className="font-semibold tabular-nums text-ink">
                  {summary.openProposals}
                </span>{" "}
                open proposals
              </li>
              <li>
                <span
                  className={`font-semibold tabular-nums ${
                    summary.followUps > 0 ? "text-amber-800" : "text-ink"
                  }`}
                >
                  {summary.followUps}
                </span>{" "}
                need follow-up
              </li>
              <li>
                <span
                  className={`font-semibold tabular-nums ${
                    summary.expiringContracts > 0
                      ? "text-amber-800"
                      : "text-ink"
                  }`}
                >
                  {summary.expiringContracts}
                </span>{" "}
                contracts ending soon
              </li>
              <li>
                <span className="font-semibold tabular-nums text-ink">
                  {summary.entities}
                </span>{" "}
                ontology entities
              </li>
            </ul>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const attention = card.tone === "attention" && (card.count ?? 0) > 0;
              return (
                <article
                  key={card.key}
                  className={`rounded-2xl border bg-white p-5 ${
                    attention
                      ? "border-amber-300 ring-1 ring-amber-100"
                      : "border-stone-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold tracking-tight">{card.title}</h2>
                    {attention ? (
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                        Attention
                      </span>
                    ) : null}
                  </div>
                  {card.count != null && card.count > 0 ? (
                    <>
                      <p className="mt-2 text-3xl font-bold tabular-nums">
                        {card.count}
                      </p>
                      {card.detail ? (
                        <p className="mt-1 text-xs text-ink-muted">{card.detail}</p>
                      ) : null}
                      <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                        {card.items.slice(0, 5).map((item) => (
                          <li key={item.id}>
                            {item.href ? (
                              <a
                                href={item.href}
                                className="font-medium text-ink hover:text-brand hover:underline"
                              >
                                {item.label}
                              </a>
                            ) : (
                              <span className="font-medium text-ink">
                                {item.label}
                              </span>
                            )}
                            {item.meta ? (
                              <span className="mt-0.5 block text-xs">
                                {item.meta}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-ink-muted">{card.empty}</p>
                  )}
                  {card.askHref ? (
                    <p className="mt-4">
                      <a
                        href={card.askHref}
                        className="text-sm font-semibold text-brand hover:text-brand-dark"
                      >
                        {card.key === "ontology_health"
                          ? "Open explorer →"
                          : "Ask Gideon →"}
                      </a>
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
