"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { OrganizationPageData } from "@/lib/summit-space/types";
import {
  summitOpportunityPath,
  summitPublicPath,
  summitResourcePath,
  summitSessionPath,
} from "@/lib/summit-space/constants";
import SummitSourceBadge from "./SummitSourceBadge";
import SummitAskGideon from "./SummitAskGideon";

type Props = {
  summitSlug: string;
  data: OrganizationPageData;
};

export default function SummitOrganizationPage({
  summitSlug,
  data,
}: Props) {
  const {
    organization,
    speakers,
    sessions,
    opportunities,
    resources,
  } = data;
  const props = organization.properties as Record<string, string | string[]>;
  const isPrime = props.role === "prime_contractor";
  const questions = Array.isArray(props.questions_to_ask)
    ? props.questions_to_ask
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={
          isPrime
            ? `${summitPublicPath(summitSlug)}/prime-contractors`
            : summitPublicPath(summitSlug)
        }
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {isPrime ? "Prime Contractors" : "Summit Hub"}
      </Link>

      <header className="mt-4">
        {isPrime ? (
          <p className="text-sm font-medium text-brand">Prime Contractor</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          {organization.name}
        </h1>
        {organization.description ? (
          <p className="mt-3 text-ink-muted">{organization.description}</p>
        ) : null}
        <SummitSourceBadge
          sourceType={organization.source_type}
          className="mt-2"
        />
      </header>

      {speakers.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Summit representative
          </h2>
          <ul className="mt-3 space-y-3">
            {speakers.map((speaker) => {
              const sp = speaker.properties as Record<string, string>;
              return (
                <li
                  key={speaker.id}
                  className="rounded-xl border border-stone-200 bg-white p-4"
                >
                  <p className="font-semibold">{speaker.name}</p>
                  {sp.title ? (
                    <p className="text-sm text-ink-muted">{sp.title}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {sessions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Relevant session
          </h2>
          <ul className="mt-3 space-y-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={summitSessionPath(summitSlug, session.slug!)}
                  className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand/40"
                >
                  <p className="font-medium">{session.name}</p>
                  {session.description ? (
                    <p className="mt-1 text-sm text-ink-muted line-clamp-2">
                      {session.description}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {props.engagement_path ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Small-business engagement path
          </h2>
          <p className="mt-2 rounded-xl bg-stone-50 p-4 text-sm">
            {String(props.engagement_path)}
          </p>
        </section>
      ) : props.small_business_engagement ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Small-business engagement path
          </h2>
          <p className="mt-2 rounded-xl bg-stone-50 p-4 text-sm">
            {String(props.small_business_engagement)}
          </p>
        </section>
      ) : null}

      {props.federal_focus ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Known federal focus
          </h2>
          <p className="mt-2 text-sm">{String(props.federal_focus)}</p>
        </section>
      ) : null}

      {props.division ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Division
          </h2>
          <p className="mt-2 text-sm">{String(props.division)}</p>
        </section>
      ) : null}

      {opportunities.length > 0 ? (
        <section className="mt-8">
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
                  <p className="font-medium">{opp.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {resources.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Related resources
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

      {questions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Questions to ask this prime
          </h2>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            {questions.map((q) => (
              <li key={String(q)}>{String(q)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-ink-muted">
        <p>
          <span className="font-semibold text-foreground">Source:</span>{" "}
          {organization.source_label ?? "Summit materials"}
        </p>
        <p className="mt-1">
          <span className="font-semibold text-foreground">Last verified:</span>{" "}
          {new Date(organization.last_updated_at).toLocaleDateString()}
        </p>
      </section>

      <section className="mt-10">
        <SummitAskGideon
          summitSlug={summitSlug}
          placeholder={`Ask about ${organization.name}…`}
        />
      </section>
    </div>
  );
}
