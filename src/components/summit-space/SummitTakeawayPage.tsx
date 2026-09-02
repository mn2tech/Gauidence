"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { TakeawayPageData } from "@/lib/summit-space/types";
import {
  summitOrganizationPath,
  summitPublicPath,
  summitSessionPath,
} from "@/lib/summit-space/constants";
import SummitSourceBadge from "./SummitSourceBadge";

type Props = {
  summitSlug: string;
  data: TakeawayPageData;
};

export default function SummitTakeawayPage({ summitSlug, data }: Props) {
  const { takeaway, sessions, organizations } = data;
  const props = takeaway.properties as Record<string, string>;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`${summitPublicPath(summitSlug)}/takeaways`}
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Summit Takeaways
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-bold sm:text-3xl">{takeaway.name}</h1>
        {takeaway.description ? (
          <p className="mt-3 text-ink-muted">{takeaway.description}</p>
        ) : null}
        <SummitSourceBadge sourceType={takeaway.source_type} className="mt-2" />
      </header>

      {sessions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Supporting evidence
          </h2>
          <ul className="mt-2 space-y-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={summitSessionPath(summitSlug, session.slug!)}
                  className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-brand/40"
                >
                  <p className="font-medium">{session.name}</p>
                  {props.evidence ? (
                    <p className="mt-1 text-xs text-ink-muted">{props.evidence}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : props.synthesis_basis ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Supporting evidence
          </h2>
          <p className="mt-2 text-sm text-ink-muted">{props.synthesis_basis}</p>
        </section>
      ) : null}

      {organizations.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            Related organizations
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

      <section className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-ink-muted">
        <p>
          <span className="font-semibold text-foreground">Source:</span>{" "}
          {takeaway.source_label ?? "Summit materials"}
        </p>
        <p className="mt-1">
          <span className="font-semibold text-foreground">Last verified:</span>{" "}
          {new Date(takeaway.last_updated_at).toLocaleDateString()}
        </p>
      </section>
    </div>
  );
}
