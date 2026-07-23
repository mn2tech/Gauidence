"use client";

import Link from "next/link";
import type { ExpertCapability } from "@/lib/experts/expert-schema";
import type { ExpertPublicView } from "@/lib/experts/expert-types";
import { expertAccentClass, resolveExpertIcon } from "@/lib/experts/icons";
import ExpertSafetyNotice from "./ExpertSafetyNotice";

type Props = {
  expert: ExpertPublicView;
  userExpertId: string;
  currentRoute?: string;
};

export default function ExpertHeader({ expert, userExpertId, currentRoute }: Props) {
  const Icon = resolveExpertIcon(expert.icon);
  const accent = expertAccentClass(expert.theme.accent);

  const links = [
    { href: `/experts/${expert.id}?installation=${userExpertId}`, label: "Dashboard", route: "dashboard" },
    ...expert.capabilities
      .filter((c: ExpertCapability) => c.enabled)
      .map((c: ExpertCapability) => ({
        href: `/experts/${expert.id}/${c.route}?installation=${userExpertId}`,
        label: c.title,
        route: c.route,
      })),
    { href: `/experts/${expert.id}/glossary?installation=${userExpertId}`, label: "Glossary", route: "glossary" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-12 w-12 items-center justify-center rounded-xl border ${accent}`}>
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {expert.category}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">{expert.name}</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-muted">{expert.description}</p>
          </div>
        </div>
        <Link
          href="/experts"
          className="text-sm font-medium text-brand hover:underline"
        >
          All Experts
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2">
        {links.map((link) => {
          const active = currentRoute === link.route || (!currentRoute && link.route === "dashboard");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-brand text-white"
                  : "border border-stone-200 bg-white text-ink-muted hover:text-foreground"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <ExpertSafetyNotice disclaimer={expert.disclaimer} expertName={expert.shortName} />
    </div>
  );
}
