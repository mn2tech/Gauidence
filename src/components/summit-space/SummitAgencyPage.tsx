"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { AgencyPageData } from "@/lib/summit-space/types";
import {
  summitOpportunityPath,
  summitOrganizationPath,
  summitPublicPath,
  summitResourcePath,
  summitSessionPath,
} from "@/lib/summit-space/constants";
import SummitSourceBadge from "./SummitSourceBadge";
import SummitAskGideon from "./SummitAskGideon";

type Props = {
  summitSlug: string;
  data: AgencyPageData;
};

export default function SummitAgencyPage({ summitSlug, data }: Props) {
  const { agency, sessions, organizations, opportunities, resources } = data;
  const props = agency.properties as Record<string, string | string[]>;
  const officialUrl =
    props.official_resource_url ?? agency.source_url ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`${summitPublicPath(summitSlug)}/agencies`}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Agencies
      </Link>

      <header className="mt-4">
        <p className="text-sm font-medium text-brand">Federal Agency</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{agency.name}</h1>
        {agency.description ? (
          <p className="mt-3 text-ink-muted">{agency.description}</p>
        ) : null}
        <SummitSourceBadge sourceType={agency.source_type} className="mt-2" />
      </header>

      {props.why_it_matters ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Why it matters to small businesses
          </h2>
          <p className="mt-2 text-sm">{String(props.why_it_matters)}</p>
        </section>
      ) : null}

      {officialUrl ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Official contracting resource
          </h2>
          <a
            href={String(officialUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
          >
            {String(officialUrl)}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </section>
      ) : null}

      {sessions.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Related summit sessions
          </h2>
          <ul className="mt-2 space-y-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={summitSessionPath(summitSlug, s.slug!)}
                  className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand/40"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {organizations.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Related prime contractors
          </h2>
          <ul className="mt-2 space-y-2">
            {organizations.map((org) => (
              <li key={org.id}>
                <Link
                  href={summitOrganizationPath(summitSlug, org.slug!)}
                  className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand/40"
                >
                  {org.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {opportunities.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Related opportunities
          </h2>
          <ul className="mt-2 space-y-2">
            {opportunities.map((opp) => (
              <li key={opp.id}>
                <Link
                  href={summitOpportunityPath(summitSlug, opp.slug!)}
                  className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand/40"
                >
                  {opp.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {resources.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Small-business resources
          </h2>
          <ul className="mt-2 space-y-2">
            {resources.map((res) => (
              <li key={res.id}>
                <Link
                  href={summitResourcePath(summitSlug, res.slug!)}
                  className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand/40"
                >
                  {res.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-ink-muted">
        <p>
          <span className="font-semibold text-foreground">Source:</span>{" "}
          {agency.source_label ?? "Public source"}
        </p>
        <p className="mt-1">
          <span className="font-semibold text-foreground">Last verified:</span>{" "}
          {new Date(agency.last_updated_at).toLocaleDateString()}
        </p>
      </section>

      <section className="mt-10">
        <SummitAskGideon summitSlug={summitSlug} />
      </section>
    </div>
  );
}
