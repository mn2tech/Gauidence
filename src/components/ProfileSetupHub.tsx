"use client";

import Link from "next/link";
import { Building2, GraduationCap, Home, Users } from "lucide-react";
import {
  PROFILE_CREATE_GROUPS,
  type ProfileCreateGroupId,
} from "@/lib/profiles/types";

const ICONS: Record<
  ProfileCreateGroupId,
  typeof Users
> = {
  family: Users,
  business: Building2,
  student: GraduationCap,
  other: Home,
};

/**
 * First-run hub when the account has no people/spaces yet.
 */
export default function ProfileSetupHub({
  returnTo = "/ask",
}: {
  returnTo?: string;
}) {
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/ask";
  const returnQuery = `&return=${encodeURIComponent(safeReturn)}`;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold tracking-tight">
        What would you like to create?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        Choose a Space or Workspace to get started. You can add more anytime from
        Manage spaces.
      </p>
      <p className="mt-3 text-sm text-ink-muted">
        Need a walkthrough?{" "}
        <Link
          href="/help"
          className="font-semibold text-brand hover:text-brand-dark"
        >
          Open Help &amp; Quick Start
        </Link>
      </p>
      <p className="mt-3 text-sm text-ink-muted">
        Create your first space to get started.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {PROFILE_CREATE_GROUPS.map((g) => {
          const Icon = ICONS[g.id];
          return (
            <li key={g.id}>
              <Link
                href={`/settings/profiles?add=1&group=${g.id}${returnQuery}`}
                className="flex h-full flex-col rounded-xl border border-stone-200 px-4 py-4 text-left transition hover:border-brand hover:bg-brand-light/40"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light text-brand">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="mt-3 text-sm font-semibold">{g.label}</span>
                <span className="mt-1 text-xs text-ink-muted">
                  {g.description}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
