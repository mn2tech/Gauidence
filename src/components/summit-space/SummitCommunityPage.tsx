"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CONTRIBUTION_TYPE_ICONS,
  CONTRIBUTION_TYPE_LABELS,
  type ContributionType,
  type PublicContributionView,
} from "@/lib/summit-space/contributions";
import { summitCommunityPath, summitPublicPath } from "@/lib/summit-space/constants";
import SummitContributionForm from "./SummitContributionForm";
import SummitSourceBadge from "./SummitSourceBadge";
import type { SummitEntityRow } from "@/lib/summit-space/types";

type Props = {
  summitSlug: string;
  summitName: string;
  entities: SummitEntityRow[];
};

const FILTERS: { id: "all" | ContributionType | "photos"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "photos", label: "Photos" },
  { id: "takeaway", label: "Takeaways" },
  { id: "opportunity", label: "Opportunities" },
  { id: "resource", label: "Resources" },
];

export default function SummitCommunityPage({
  summitSlug,
  summitName,
  entities,
}: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [contributions, setContributions] = useState<PublicContributionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = filter !== "all" ? `?filter=${filter}` : "";
    fetch(`/api/public/summit/${summitSlug}/contributions${params}`)
      .then((r) => r.json())
      .then((json) => {
        setContributions(json.contributions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [summitSlug, filter]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={summitPublicPath(summitSlug)}
        className="text-sm text-brand hover:underline"
      >
        ← Back to Summit Hub
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-bold">Community Insights</h1>
        <p className="mt-2 text-sm text-ink-muted">
          See what attendees are adding to the {summitName} Knowledge Hub.
        </p>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filter === f.id
                ? "bg-brand text-white"
                : "border border-stone-200 bg-white hover:border-brand/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {showForm ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <SummitContributionForm
              summitSlug={summitSlug}
              entities={entities}
              onClose={() => setShowForm(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-white hover:bg-brand-dark"
          >
            + Share What You Learned
          </button>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {loading ? (
          <p className="text-center text-sm text-ink-muted">Loading…</p>
        ) : contributions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-200 p-8 text-center text-sm text-ink-muted">
            No published community insights yet. Be the first to share what you
            learned!
          </p>
        ) : (
          contributions.map((c) => (
            <article
              key={c.id}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span>{CONTRIBUTION_TYPE_ICONS[c.contributionType]}</span>
                <span className="text-xs font-medium text-ink-muted">
                  {CONTRIBUTION_TYPE_LABELS[c.contributionType]}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{c.content}</p>
              {c.session ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Session:{" "}
                  <Link
                    href={`/s/${summitSlug}/session/${c.session.slug}`}
                    className="text-brand hover:underline"
                  >
                    {c.session.name}
                  </Link>
                </p>
              ) : null}
              {c.organization ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Organization:{" "}
                  <Link
                    href={`/s/${summitSlug}/organization/${c.organization.slug}`}
                    className="text-brand hover:underline"
                  >
                    {c.organization.name}
                  </Link>
                </p>
              ) : null}
              {(c.contributorName || c.contributorCompany) && (
                <p className="mt-2 text-xs text-ink-muted">
                  Shared by{" "}
                  {[c.contributorName, c.contributorCompany]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <SummitSourceBadge sourceType="community" className="mt-2" />
            </article>
          ))
        )}
      </div>
    </div>
  );
}
