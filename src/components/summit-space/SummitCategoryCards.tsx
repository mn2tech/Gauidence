"use client";

import Link from "next/link";
import {
  BookOpen,
  Building2,
  Landmark,
  Lightbulb,
  Presentation,
  Target,
} from "lucide-react";
import type { SummitEntityRow } from "@/lib/summit-space/types";
import { summitOrganizationPath } from "@/lib/summit-space/constants";

const ICONS: Record<string, typeof Target> = {
  opportunities: Target,
  "prime-contractors": Building2,
  agencies: Landmark,
  sessions: Presentation,
  resources: BookOpen,
  takeaways: Lightbulb,
};

type Props = {
  summitSlug: string;
  entities: SummitEntityRow[];
  onSelectCategory?: (categoryId: string) => void;
};

function filterForCategory(
  categoryId: string,
  entities: SummitEntityRow[]
): SummitEntityRow[] {
  switch (categoryId) {
    case "opportunities":
      return entities.filter((e) => e.entity_type === "opportunity");
    case "prime-contractors":
      return entities.filter(
        (e) =>
          e.entity_type === "organization" &&
          (e.properties as Record<string, string>).role === "prime_contractor"
      );
    case "agencies":
      return entities.filter((e) => e.entity_type === "agency");
    case "sessions":
      return entities.filter((e) => e.entity_type === "session");
    case "resources":
      return entities.filter((e) => e.entity_type === "resource");
    case "takeaways":
      return entities.filter(
        (e) =>
          e.entity_type === "action_item" ||
          (e.properties as Record<string, string>).category === "takeaway"
      );
    default:
      return [];
  }
}

export default function SummitCategoryCards({
  summitSlug,
  entities,
  onSelectCategory,
}: Props) {
  const cards = [
    { id: "opportunities", label: "Opportunities" },
    { id: "prime-contractors", label: "Prime Contractors" },
    { id: "agencies", label: "Agencies" },
    { id: "sessions", label: "Sessions" },
    { id: "resources", label: "Resources" },
    { id: "takeaways", label: "Summit Takeaways" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map((card) => {
        const Icon = ICONS[card.id] ?? Target;
        const count = filterForCategory(card.id, entities).length;
        return (
          <Link
            key={card.id}
            href={`/s/${summitSlug}/${card.id}`}
            onClick={() => onSelectCategory?.(card.id)}
            className="flex flex-col rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-brand/40 hover:shadow-md"
          >
            <Icon className="h-6 w-6 text-brand" aria-hidden />
            <span className="mt-3 font-semibold leading-tight">{card.label}</span>
            <span className="mt-1 text-xs text-ink-muted">
              {count > 0 ? `${count} item${count === 1 ? "" : "s"}` : "Explore"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export { filterForCategory };
