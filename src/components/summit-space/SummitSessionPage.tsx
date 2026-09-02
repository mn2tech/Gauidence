"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { SummitEntityRow } from "@/lib/summit-space/types";
import {
  summitOpportunityPath,
  summitOrganizationPath,
  summitPublicPath,
} from "@/lib/summit-space/constants";
import SummitSourceBadge from "./SummitSourceBadge";
import SummitAskGideon from "./SummitAskGideon";

type Props = {
  summitSlug: string;
  session: SummitEntityRow;
  speakers: SummitEntityRow[];
  organizations: SummitEntityRow[];
  opportunities: SummitEntityRow[];
};

export default function SummitSessionPage({
  summitSlug,
  session,
  speakers,
  organizations,
  opportunities,
}: Props) {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`${summitPublicPath(summitSlug)}/sessions`}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Sessions
      </Link>

      <header className="mt-4">
        <p className="text-sm font-medium text-brand">Summit Session</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{session.name}</h1>
        {session.description ? (
          <p className="mt-3 text-ink-muted">{session.description}</p>
        ) : null}
        <SummitSourceBadge sourceType={session.source_type} className="mt-2" />
      </header>

      {speakers.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Speakers
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
                  {sp.organization ? (
                    <p className="text-sm text-ink-muted">{sp.organization}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {organizations.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Organizations discussed
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
                  {opp.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-10">
        <SummitAskGideon summitSlug={summitSlug} />
      </section>
    </div>
  );
}
