import Link from "next/link";
import type { SummitEntityRow } from "@/lib/summit-space/types";
import {
  summitAgencyPath,
  summitOpportunityPath,
  summitOrganizationPath,
  summitResourcePath,
  summitSessionPath,
  summitTakeawayPath,
} from "@/lib/summit-space/constants";
import SummitSourceBadge from "./SummitSourceBadge";

type Props = {
  summitSlug: string;
  entity: SummitEntityRow;
};

function entityHref(summitSlug: string, entity: SummitEntityRow): string | null {
  if (!entity.slug) return null;
  switch (entity.entity_type) {
    case "organization":
      return summitOrganizationPath(summitSlug, entity.slug);
    case "opportunity":
      return summitOpportunityPath(summitSlug, entity.slug);
    case "agency":
      return summitAgencyPath(summitSlug, entity.slug);
    case "resource":
      return summitResourcePath(summitSlug, entity.slug);
    case "session":
      return summitSessionPath(summitSlug, entity.slug);
    case "action_item":
      if ((entity.properties as Record<string, string>).category === "takeaway") {
        return summitTakeawayPath(summitSlug, entity.slug);
      }
      return null;
    default:
      return null;
  }
}

function entitySubtitle(entity: SummitEntityRow): string | null {
  const props = entity.properties as Record<string, string | string[]>;
  if (entity.entity_type === "opportunity" && props.opportunity_type) {
    return String(props.opportunity_type);
  }
  if (entity.entity_type === "resource" && props.who_should_use) {
    return String(props.who_should_use);
  }
  return null;
}

export default function SummitEntityCard({ summitSlug, entity }: Props) {
  const href = entityHref(summitSlug, entity);
  const subtitle = entitySubtitle(entity);

  const inner = (
    <>
      <p className="font-semibold">{entity.name}</p>
      {subtitle ? (
        <p className="mt-0.5 text-xs font-medium text-brand">{subtitle}</p>
      ) : null}
      {entity.description ? (
        <p className="mt-1 text-sm text-ink-muted line-clamp-2">
          {entity.description}
        </p>
      ) : null}
      <SummitSourceBadge sourceType={entity.source_type} className="mt-2" />
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-brand/40"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      {inner}
    </div>
  );
}
