"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FolderPlus,
  NotebookPen,
  Plus,
  Sparkles,
} from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import GuardianLogo from "@/components/brand/GuardianLogo";
import { GUARDIAN_BRAND_TAGLINE } from "@/lib/branding";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useSimpleHomeData } from "@/hooks/useSimpleHomeData";
import GideonWelcome from "@/components/gideon-welcome/GideonWelcome";
import { formatActivityWhen } from "@/lib/simple-home/helpers";
import {
  ADD_ANYTHING_PATH,
  ASK_GIDEON_PATH,
  REMEMBER_TODAY_PATH,
} from "@/lib/simple-home/routing";
import { documentsHref } from "@/lib/routes";
import { getContainerLabel } from "@/lib/profiles/types";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="simple-home-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const PRIMARY_ACTIONS = [
  {
    href: ADD_ANYTHING_PATH,
    label: "Add Anything",
    description: "Upload, paste, or capture",
    icon: Plus,
    accent: true,
  },
  {
    href: REMEMBER_TODAY_PATH,
    label: "Remember Today",
    description: "What happened today?",
    icon: NotebookPen,
    accent: false,
  },
  {
    href: ASK_GIDEON_PATH,
    label: "Ask Gideon",
    description: "Search everything you know",
    icon: Sparkles,
    accent: false,
  },
] as const;

export default function SimpleHomeScreen() {
  const router = useRouter();
  const { active, profiles, loading: profilesLoading, switchProfile } =
    useActiveProfile();
  const { data, loading } = useSimpleHomeData();

  if (profilesLoading) {
    return <p className="p-6 text-sm text-ink-muted">Loading your home…</p>;
  }

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8 text-center">
          <GuardianLogo variant="lockup" size="md" className="mx-auto" />
          <p className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-muted">
            {GUARDIAN_BRAND_TAGLINE}
          </p>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">Welcome to Guardian</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Guardian becomes more useful as it remembers the things that matter to you.
          </p>
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {PRIMARY_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className={`simple-home-card flex flex-col items-center gap-2 p-4 text-center transition hover:shadow-card ${
                  action.accent ? "border-brand/30 bg-brand-light/20" : ""
                }`}
              >
                <Icon className={`h-6 w-6 ${action.accent ? "text-brand" : "text-ink-muted"}`} />
                <span className="text-sm font-semibold">{action.label}</span>
              </Link>
            );
          })}
        </div>
        <ProfileSetupHub returnTo="/home" />
      </div>
    );
  }

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:gap-7 sm:py-8">
      <GideonWelcome />

      <div
        className="grid gap-3 welcome-strip sm:grid-cols-3"
        style={{ animationDelay: "0.05s" }}
      >
        {PRIMARY_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={`simple-home-card flex flex-col gap-3 p-4 transition hover:shadow-card ${
                action.accent
                  ? "border-brand/30 bg-gradient-to-br from-brand-light/50 to-white"
                  : ""
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  action.accent ? "bg-brand text-white shadow-sm" : "bg-brand-light text-brand"
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

      <Link
        href="/settings/profiles?add=1&return=%2Fhome"
        className="simple-home-card welcome-strip flex items-center gap-3 p-4 transition hover:shadow-card"
        style={{ animationDelay: "0.08s" }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <FolderPlus className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">New space</span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            Family, business, personal, and more
          </span>
        </span>
      </Link>

      {data.recentActivity.length > 0 ? (
        <Section title="Recent activity">
          {loading ? (
            <p className="text-sm text-ink-muted">Loading…</p>
          ) : (
            <ul className="space-y-1">
              {data.recentActivity.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start justify-between gap-3 rounded-xl px-2 py-2.5 text-sm transition hover:bg-brand-light/35"
                  >
                    <span className="min-w-0 font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {formatActivityWhen(item.occurredAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {active ? (
        <button
          type="button"
          onClick={() => {
            void switchProfile(active.id);
            router.push(documentsHref(active.id));
          }}
          className="simple-home-card welcome-strip flex w-full items-center gap-3 p-4 text-left transition hover:shadow-card"
          style={{ animationDelay: "0.12s" }}
        >
          <ProfileAvatar profile={active} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              Continue in {active.display_name}
            </span>
            <span className="mt-0.5 block text-xs text-ink-muted">
              {getContainerLabel(active.profile_type)}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-brand" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
