"use client";

import Link from "next/link";
import type { GideonWelcomeAction } from "@/lib/gideon-welcome/types";

type SuggestedActionsProps = {
  actions: GideonWelcomeAction[];
  showPrompt?: boolean;
};

export default function SuggestedActions({
  actions,
  showPrompt = true,
}: SuggestedActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className="space-y-2.5">
      {showPrompt ? (
        <p className="text-sm font-medium text-foreground">What would you like to do?</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <Link
            key={action.id}
            href={action.href ?? "#"}
            className="welcome-chip inline-flex items-center rounded-full border border-stone-300 bg-white px-3.5 py-2 text-xs font-medium text-foreground transition hover:border-brand hover:bg-brand-light/40 sm:text-sm"
            style={{ animationDelay: `${0.04 * index}s` }}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
