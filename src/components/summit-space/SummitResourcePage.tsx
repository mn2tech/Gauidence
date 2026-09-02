"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { ResourcePageData } from "@/lib/summit-space/types";
import { summitAgencyPath, summitPublicPath } from "@/lib/summit-space/constants";
import SummitSourceBadge from "./SummitSourceBadge";

type Props = {
  summitSlug: string;
  data: ResourcePageData;
};

export default function SummitResourcePage({ summitSlug, data }: Props) {
  const { resource, agencies } = data;
  const props = resource.properties as Record<string, string>;
  const officialUrl = props.official_url ?? resource.source_url ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`${summitPublicPath(summitSlug)}/resources`}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Resources
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-bold sm:text-3xl">{resource.name}</h1>
        {resource.description ? (
          <p className="mt-3 text-ink-muted">{resource.description}</p>
        ) : null}
        <SummitSourceBadge sourceType={resource.source_type} className="mt-2" />
      </header>

      {props.who_should_use ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Who should use it
          </h2>
          <p className="mt-2 text-sm">{props.who_should_use}</p>
        </section>
      ) : null}

      {props.why_it_matters ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Why it matters
          </h2>
          <p className="mt-2 text-sm">{props.why_it_matters}</p>
        </section>
      ) : null}

      {officialUrl ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Official link
          </h2>
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
          >
            {officialUrl}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </section>
      ) : null}

      {agencies.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Related agencies
          </h2>
          <ul className="mt-2 space-y-2">
            {agencies.map((agency) => (
              <li key={agency.id}>
                <Link
                  href={summitAgencyPath(summitSlug, agency.slug!)}
                  className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand/40"
                >
                  {agency.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-ink-muted">
        <p>
          <span className="font-semibold text-foreground">Source:</span>{" "}
          {resource.source_label ?? "Public source"}
        </p>
      </section>
    </div>
  );
}
