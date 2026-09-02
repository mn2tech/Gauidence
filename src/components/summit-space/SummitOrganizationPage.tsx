"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { OrganizationPageData } from "@/lib/summit-space/types";
import { summitPublicPath } from "@/lib/summit-space/constants";
import SummitAskGideon from "./SummitAskGideon";

type Props = {
  summitSlug: string;
  summitName: string;
  data: OrganizationPageData;
};

export default function SummitOrganizationPage({
  summitSlug,
  summitName,
  data,
}: Props) {
  const { organization, speakers, sessions } = data;
  const props = organization.properties as Record<string, string>;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`${summitPublicPath(summitSlug)}/prime-contractors`}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Prime Contractors
      </Link>

      <header className="mt-4">
        <p className="text-sm font-medium text-brand">Prime Contractor</p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
          {organization.name}
        </h1>
        {organization.description ? (
          <p className="mt-3 text-ink-muted">{organization.description}</p>
        ) : null}
      </header>

      {speakers.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Summit Speaker
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
            Relevant Session
          </h2>
          <ul className="mt-3 space-y-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="rounded-xl border border-stone-200 bg-white p-4"
              >
                <p className="font-medium">{session.name}</p>
                {session.description ? (
                  <p className="mt-1 text-sm text-ink-muted">
                    {session.description}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {props.small_business_engagement ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Small Business Engagement
          </h2>
          <p className="mt-2 rounded-xl bg-stone-50 p-4 text-sm">
            {props.small_business_engagement}
          </p>
        </section>
      ) : null}

      {props.division ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Division
          </h2>
          <p className="mt-2 text-sm">{props.division}</p>
        </section>
      ) : null}

      <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-ink-muted">
        <p>
          <span className="font-semibold text-foreground">Source:</span>{" "}
          {organization.source_label ?? "Summit materials"}
        </p>
        <p className="mt-1">
          <span className="font-semibold text-foreground">Last updated:</span>{" "}
          {new Date(organization.last_updated_at).toLocaleDateString()}
        </p>
        <p className="mt-2 font-medium text-brand">
          VERIFIED SUMMIT INFORMATION
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">
          Ask Gideon about {organization.name}
        </h2>
        <div className="mt-4">
          <SummitAskGideon
            summitSlug={summitSlug}
            placeholder={`Ask about ${organization.name}…`}
          />
        </div>
      </section>
    </div>
  );
}
