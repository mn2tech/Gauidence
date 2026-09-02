"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { OpportunityPageData } from "@/lib/summit-space/types";
import {
  summitOrganizationPath,
  summitPublicPath,
  summitSessionPath,
} from "@/lib/summit-space/constants";
import SummitSourceBadge from "./SummitSourceBadge";
import SummitAskGideon from "./SummitAskGideon";

type Props = {
  summitSlug: string;
  data: OpportunityPageData;
};

export default function SummitOpportunityPage({ summitSlug, data }: Props) {
  const { opportunity, organization, sessions } = data;
  const props = opportunity.properties as Record<string, string | string[]>;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`${summitPublicPath(summitSlug)}/opportunities`}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Opportunities
      </Link>

      <header className="mt-4">
        {props.opportunity_type ? (
          <p className="text-sm font-medium text-brand">
            {String(props.opportunity_type)}
          </p>
        ) : null}
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          {opportunity.name}
        </h1>
        <SummitSourceBadge
          sourceType={opportunity.source_type}
          className="mt-2"
        />
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          What is the opportunity?
        </h2>
        <p className="mt-2 text-ink-muted">
          {opportunity.description ?? "No description available."}
        </p>
      </section>

      {props.why_it_matters ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Why it may matter
          </h2>
          <p className="mt-2 text-sm">{String(props.why_it_matters)}</p>
        </section>
      ) : null}

      {organization ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Related organization
          </h2>
          <Link
            href={summitOrganizationPath(summitSlug, organization.slug!)}
            className="mt-2 block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand/40"
          >
            <p className="font-semibold">{organization.name}</p>
            {organization.description ? (
              <p className="mt-1 text-sm text-ink-muted line-clamp-2">
                {organization.description}
              </p>
            ) : null}
          </Link>
        </section>
      ) : null}

      {Array.isArray(props.capability_areas) && props.capability_areas.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Capability areas
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {props.capability_areas.map((area) => (
              <li
                key={String(area)}
                className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium"
              >
                {String(area)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {props.recommended_next_step ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Recommended next step
          </h2>
          <p className="mt-2 rounded-xl bg-brand/5 p-4 text-sm">
            {String(props.recommended_next_step)}
          </p>
        </section>
      ) : null}

      {sessions.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Related session
          </h2>
          <ul className="mt-2 space-y-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={summitSessionPath(summitSlug, session.slug!)}
                  className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand/40"
                >
                  <p className="font-medium">{session.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-ink-muted">
        <p>
          <span className="font-semibold text-foreground">Source:</span>{" "}
          {opportunity.source_label ?? "Summit materials"}
        </p>
        <p className="mt-1">
          <span className="font-semibold text-foreground">Last verified:</span>{" "}
          {new Date(opportunity.last_updated_at).toLocaleDateString()}
        </p>
      </section>

      <section className="mt-10">
        <SummitAskGideon
          summitSlug={summitSlug}
          placeholder={`Ask about ${opportunity.name}…`}
        />
      </section>
    </div>
  );
}
