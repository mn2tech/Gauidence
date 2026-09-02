"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SummitEntityRow } from "@/lib/summit-space/types";
import { summitCommunityPath } from "@/lib/summit-space/constants";
import type { PublicContributionView } from "@/lib/summit-space/contributions";
import SummitContributionForm from "./SummitContributionForm";
import SummitContributionCard from "./SummitContributionCard";

type Props = {
  summitSlug: string;
  entities: SummitEntityRow[];
};

export default function SummitCommunityInsights({ summitSlug, entities }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [published, setPublished] = useState<PublicContributionView[]>([]);

  useEffect(() => {
    fetch(`/api/public/summit/${summitSlug}/contributions`)
      .then((r) => r.json())
      .then((json) => setPublished((json.contributions ?? []).slice(0, 2)))
      .catch(() => setPublished([]));
  }, [summitSlug, showForm]);

  return (
    <section className="mt-10 rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="text-lg font-semibold">Community Insights</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Help build the collective knowledge from the summit. Share a photo,
        takeaway, opportunity, or useful resource. Submissions are reviewed
        before they appear publicly.
      </p>

      {published.length > 0 ? (
        <div className="mt-4 space-y-3">
          {published.map((contribution) => (
            <SummitContributionCard
              key={contribution.id}
              summitSlug={summitSlug}
              contribution={contribution}
            />
          ))}
        </div>
      ) : null}

      {showForm ? (
        <div className="mt-4">
          <SummitContributionForm
            summitSlug={summitSlug}
            entities={entities}
            onClose={() => setShowForm(false)}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={summitCommunityPath(summitSlug)}
            className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold hover:bg-stone-50"
          >
            Explore Community Insights
          </Link>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + Share What You Learned
          </button>
        </div>
      )}
    </section>
  );
}
