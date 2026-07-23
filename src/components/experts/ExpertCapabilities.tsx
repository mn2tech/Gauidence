"use client";

import Link from "next/link";
import type { ExpertCapability } from "@/lib/experts/expert-schema";
import { resolveExpertIcon } from "@/lib/experts/icons";

type Props = {
  expertId: string;
  userExpertId: string;
  capabilities: ExpertCapability[];
};

export default function ExpertCapabilities({
  expertId,
  userExpertId,
  capabilities,
}: Props) {
  const enabled = capabilities.filter((c) => c.enabled);
  if (enabled.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h2 className="font-semibold">Capabilities</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {enabled.map((capability) => {
          const Icon = resolveExpertIcon(capability.icon);
          return (
            <Link
              key={capability.id}
              href={`/experts/${expertId}/${capability.route}?installation=${userExpertId}`}
              className="rounded-xl border border-stone-200 p-4 transition hover:border-brand/40 hover:bg-brand-light/20"
            >
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-brand-light p-2 text-brand">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium">{capability.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{capability.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
