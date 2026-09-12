"use client";

import { useRouter } from "next/navigation";
import type { GideonWelcomeAction } from "@/lib/gideon-welcome/types";
import { ASK_GIDEON_PATH } from "@/lib/simple-home/routing";

type SuggestedActionsProps = {
  actions: GideonWelcomeAction[];
  showPrompt?: boolean;
};

export default function SuggestedActions({
  actions,
  showPrompt = true,
}: SuggestedActionsProps) {
  const router = useRouter();

  if (actions.length === 0) return null;

  function handleAction(action: GideonWelcomeAction) {
    const href = action.href?.trim();
    if (href && href !== "#") {
      router.push(href);
      return;
    }
    if (action.question?.trim()) {
      const params = new URLSearchParams({ draft: action.question.trim() });
      router.push(`${ASK_GIDEON_PATH}?${params.toString()}`);
      return;
    }
    router.push(ASK_GIDEON_PATH);
  }

  return (
    <div className="space-y-2.5">
      {showPrompt ? (
        <p className="text-sm font-medium text-foreground">What would you like to do?</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action, index) => (
          <button
            key={action.id}
            type="button"
            onClick={() => handleAction(action)}
            className="welcome-chip inline-flex min-h-11 items-center rounded-full border border-border-subtle bg-surface px-4 py-2 text-left text-sm font-semibold text-foreground shadow-sm transition hover:border-brand hover:bg-brand-light/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            style={{ animationDelay: `${0.04 * index}s` }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
