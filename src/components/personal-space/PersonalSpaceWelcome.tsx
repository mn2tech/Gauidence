"use client";

import Link from "next/link";
import { FileUp, MessageSquarePlus } from "lucide-react";
import {
  PERSONAL_SPACE_ACTIONS,
  PERSONAL_SPACE_SECONDARY_ACTIONS,
  PERSONAL_SPACE_WELCOME,
} from "@/lib/personal-space/types";
import {
  FIRST_MINUTE_CHIPS,
  firstMinuteChipHref,
} from "@/lib/guardian-today/firstMinute";

const ICONS = {
  "tell-guardian": MessageSquarePlus,
  "add-something": FileUp,
} as const;

export default function PersonalSpaceWelcome({
  spaceName,
}: {
  spaceName: string;
}) {
  return (
    <section className="simple-home-card welcome-strip space-y-5 p-5 sm:p-6">
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {spaceName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
          {PERSONAL_SPACE_WELCOME.title}
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-ink-muted">
          {PERSONAL_SPACE_WELCOME.body}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FIRST_MINUTE_CHIPS.map((chip) => (
          <Link
            key={chip.id}
            href={firstMinuteChipHref(chip)}
            className="rounded-full border border-border-subtle bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-brand/40 hover:bg-brand-light/40"
          >
            {chip.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PERSONAL_SPACE_ACTIONS.map((action) => {
          const Icon = ICONS[action.id];
          const primary = action.id === "tell-guardian";
          return (
            <Link
              key={action.id}
              href={action.href}
              className={`flex flex-col gap-3 rounded-2xl border p-4 transition hover:shadow-card ${
                primary
                  ? "border-brand/30 bg-gradient-to-br from-brand-light/50 to-white"
                  : "border-border-subtle bg-white"
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  primary
                    ? "bg-brand text-white shadow-sm"
                    : "bg-brand-light text-brand"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {action.label}
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {action.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border-subtle pt-4">
        {PERSONAL_SPACE_SECONDARY_ACTIONS.map((action) => (
          <Link
            key={action.id}
            href={action.href}
            className="text-xs font-semibold text-ink-muted transition hover:text-brand"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
