"use client";

import Link from "next/link";
import type { ExpertCatalogItem } from "@/lib/experts/expert-schema";
import type { UserExpert } from "@/lib/experts/expert-types";
import {
  expertStatusClass,
  expertStatusLabel,
  resolveExpertIcon,
} from "@/lib/experts/icons";
import { isExpertInstallable } from "@/lib/experts/expert-types";

type Props = {
  expert: ExpertCatalogItem & { effectiveStatus?: string };
  installations: UserExpert[];
  onInstall: () => void;
};

export default function ExpertCatalogCard({
  expert,
  installations,
  onInstall,
}: Props) {
  const Icon = resolveExpertIcon(expert.icon);
  const status = (expert as { effectiveStatus?: string }).effectiveStatus ?? expert.status;
  const installable = isExpertInstallable(status as never);
  const primaryInstallation = installations[0];

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-brand-light p-2 text-brand">
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-semibold">{expert.name}</h3>
            <p className="mt-1 text-sm text-ink-muted">{expert.description}</p>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${expertStatusClass(status)}`}>
          {expertStatusLabel(status)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">
          {expert.category} · v{expert.version}
        </p>
        {status === "coming-soon" ? (
          <button
            type="button"
            disabled
            className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-ink-muted"
          >
            Coming soon
          </button>
        ) : primaryInstallation ? (
          <Link
            href={`/experts/${expert.id}?installation=${primaryInstallation.id}`}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Open Expert
          </Link>
        ) : installable ? (
          <button
            type="button"
            onClick={onInstall}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Install Expert
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-ink-muted"
          >
            Unavailable
          </button>
        )}
      </div>
    </article>
  );
}
