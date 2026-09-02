import Link from "next/link";
import {
  CONTRIBUTION_TYPE_ICONS,
  CONTRIBUTION_TYPE_LABELS,
  type PublicContributionView,
} from "@/lib/summit-space/contributions";
import SummitSourceBadge from "./SummitSourceBadge";

type Props = {
  summitSlug: string;
  contribution: PublicContributionView;
};

export default function SummitContributionCard({ summitSlug, contribution }: Props) {
  const c = contribution;

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span>{CONTRIBUTION_TYPE_ICONS[c.contributionType]}</span>
        <span className="text-xs font-medium text-ink-muted">
          {CONTRIBUTION_TYPE_LABELS[c.contributionType]}
        </span>
      </div>

      {c.imageUrl ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-stone-50">
          <img
            src={c.imageUrl}
            alt="Community contribution"
            className="max-h-80 w-full object-contain"
          />
        </div>
      ) : null}

      <p className="mt-2 text-sm leading-relaxed">{c.content}</p>

      {c.session ? (
        <p className="mt-2 text-xs text-ink-muted">
          Session:{" "}
          <Link
            href={`/s/${summitSlug}/session/${c.session.slug}`}
            className="text-brand hover:underline"
          >
            {c.session.name}
          </Link>
        </p>
      ) : null}
      {c.organization ? (
        <p className="mt-1 text-xs text-ink-muted">
          Organization:{" "}
          <Link
            href={`/s/${summitSlug}/organization/${c.organization.slug}`}
            className="text-brand hover:underline"
          >
            {c.organization.name}
          </Link>
        </p>
      ) : null}
      {(c.contributorName || c.contributorCompany) && (
        <p className="mt-2 text-xs text-ink-muted">
          Shared by{" "}
          {[c.contributorName, c.contributorCompany].filter(Boolean).join(" · ")}
        </p>
      )}
      <SummitSourceBadge sourceType="community" className="mt-2" />
    </article>
  );
}
