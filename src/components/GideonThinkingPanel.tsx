"use client";

import { Check } from "lucide-react";
import GideonAvatar from "@/components/GideonAvatar";

type Props = {
  steps: string[];
  activeIndex: number;
  className?: string;
};

export default function GideonThinkingPanel({
  steps,
  activeIndex,
  className = "",
}: Props) {
  if (steps.length === 0) return null;

  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <GideonAvatar size={40} variant="portrait" pulse />
      <div className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-3.5 py-3 shadow-sm">
        <p className="text-sm font-medium text-foreground">
          Gideon is thinking…
        </p>
        <ul className="mt-2 space-y-1.5">
          {steps.map((step, index) => {
            const done = index < activeIndex;
            const active = index === activeIndex;
            return (
              <li
                key={`${step}-${index}`}
                className={`flex items-center gap-2 text-xs ${
                  done
                    ? "text-ink-muted"
                    : active
                      ? "font-medium text-foreground"
                      : "text-stone-400"
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    done
                      ? "border-brand bg-brand text-white"
                      : active
                        ? "border-brand bg-brand/10"
                        : "border-stone-300"
                  }`}
                  aria-hidden
                >
                  {done ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : null}
                </span>
                <span>{step}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
