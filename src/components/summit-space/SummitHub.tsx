"use client";

import { useState } from "react";
import Link from "next/link";
import type { SummitEntityRow, SummitSpaceRow } from "@/lib/summit-space/types";
import { SUMMIT_DISCLAIMER } from "@/lib/summit-space/constants";
import SummitAskGideon from "./SummitAskGideon";
import SummitCategoryCards from "./SummitCategoryCards";
import SummitCommunityInsights from "./SummitCommunityInsights";
import SummitLeadForm from "./SummitLeadForm";
import SummitShareButton from "./SummitShareButton";

type Props = {
  space: SummitSpaceRow;
  entities: SummitEntityRow[];
  isOwner?: boolean;
};

export default function SummitHub({ space, entities, isOwner }: Props) {
  const [showLeadForm, setShowLeadForm] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="text-center">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <p className="text-xs font-medium uppercase tracking-wider text-brand">
            Powered by Guardian + {space.owner_label ?? "NM2TECH"}
          </p>
          <SummitShareButton summitSlug={space.slug} summitName={space.name} />
          {isOwner ? (
            <Link
              href={`/s/${space.slug}/admin`}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Admin
            </Link>
          ) : null}
        </div>
        <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl">
          2026 Small Business
          <br />
          Government Contracting Summit
        </h1>
        <p className="mt-3 text-lg text-ink-muted">
          Turn today&apos;s conversations into tomorrow&apos;s opportunities.
        </p>
        {space.subtitle ? (
          <p className="mt-2 text-sm font-medium text-ink-muted">
            {space.subtitle}
          </p>
        ) : null}
      </header>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a
          href="#ask-gideon"
          className="rounded-xl bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark"
        >
          Ask Gideon
        </a>
        <Link
          href={`/s/${space.slug}/opportunities`}
          className="rounded-xl border border-stone-300 bg-white px-6 py-3 font-semibold hover:bg-stone-50"
        >
          Explore Opportunities
        </Link>
      </div>

      <section className="mt-10">
        <SummitAskGideon
          summitSlug={space.slug}
          onAnswered={() => setShowLeadForm(true)}
        />
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Explore the Hub</h2>
        <SummitCategoryCards summitSlug={space.slug} entities={entities} />
      </section>

      <SummitCommunityInsights summitSlug={space.slug} entities={entities} />

      {showLeadForm ? (
        <section className="mt-10">
          <SummitLeadForm summitSlug={space.slug} />
        </section>
      ) : null}

      <p className="mt-10 text-center text-xs leading-relaxed text-ink-muted">
        {SUMMIT_DISCLAIMER}
      </p>
    </div>
  );
}
