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
import {
  filterSummitEntitiesForCategory,
  SUMMIT_CATEGORY_LABELS,
} from "@/lib/summit-space/categories";
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

export default function SummitCategoryCards({
  summitSlug,
  entities,
  onSelectCategory,
}: Props) {
  const cards = Object.entries(SUMMIT_CATEGORY_LABELS).map(([id, label]) => ({
    id,
    label,
  }));

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map((card) => {
        const Icon = ICONS[card.id] ?? Target;
        const count = filterSummitEntitiesForCategory(card.id, entities).length;
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
              {count} item{count === 1 ? "" : "s"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
