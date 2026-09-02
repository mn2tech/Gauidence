import Link from "next/link";
import { SUMMIT_ADMIN_ADD_LABELS, SUMMIT_EMPTY_STATE_MESSAGES } from "@/lib/summit-space/emptyStates";
import { summitPublicPath } from "@/lib/summit-space/constants";

type Props = {
  categoryId: string;
  summitSlug: string;
  isOwner?: boolean;
};

export default function SummitEmptyState({
  categoryId,
  summitSlug,
  isOwner,
}: Props) {
  const message =
    SUMMIT_EMPTY_STATE_MESSAGES[categoryId] ??
    "No verified information has been published in this category yet.";
  const adminLabel = SUMMIT_ADMIN_ADD_LABELS[categoryId];

  return (
    <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 text-center">
      <p className="text-ink-muted">{message}</p>
      <Link
        href={`${summitPublicPath(summitSlug)}#ask-gideon`}
        className="mt-4 inline-block text-sm font-semibold text-brand hover:underline"
      >
        Ask Gideon instead
      </Link>
      {isOwner && adminLabel ? (
        <Link
          href={`/s/${summitSlug}/admin`}
          className="mt-3 block text-sm font-semibold text-brand hover:underline"
        >
          + {adminLabel}
        </Link>
      ) : null}
    </div>
  );
}
