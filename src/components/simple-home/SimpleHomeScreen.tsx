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
import { useUpgradeModal } from "@/components/UpgradeProvider";
import { useSimpleHomeData } from "@/hooks/useSimpleHomeData";
import GideonWelcome from "@/components/gideon-welcome/GideonWelcome";
import { formatActivityWhen } from "@/lib/simple-home/helpers";
import {
  ADD_ANYTHING_PATH,
  ASK_GIDEON_PATH,
  REMEMBER_TODAY_PATH,
  VAULTS_PATH,
} from "@/lib/simple-home/routing";
import { documentsHref } from "@/lib/routes";
import { getContainerLabel, topLevelProfiles } from "@/lib/profiles/types";

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
    label: "Add Knowledge",
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
  const { openUpgrade } = useUpgradeModal();

  const spaces = topLevelProfiles(profiles);

  async function handleNewSpace() {
    try {
      const res = await fetch("/api/billing/status");
      const body = (await res.json().catch(() => ({}))) as {
        plan?: string;
        limits?: { spacesPerAccount?: number };
      };
      const limit = body.limits?.spacesPerAccount ?? 1;
      if ((body.plan === "free" || !body.plan) && spaces.length >= limit) {
        openUpgrade({
          reason:
            "You've used your Free Space. Upgrade to Guardian Pro to create more Spaces — your existing knowledge stays available.",
        });
        return;
      }
    } catch {
      /* fall through to create UI */
    }
    router.push("/settings/profiles?add=1&return=%2Fhome");
  }

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
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Create your first Space.
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            A Space gives Guardian a place to understand one part of your life
            or work.
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
                <Icon
                  className={`h-6 w-6 ${action.accent ? "text-brand" : "text-ink-muted"}`}
                />
                <span className="text-sm font-semibold">{action.label}</span>
              </Link>
            );
          })}
        </div>
        <ProfileSetupHub returnTo="/home" />
      </div>
    );
  }

  const attentionItems: { id: string; text: string; href: string }[] = [];
  for (const alert of data.todayAlerts.slice(0, 3)) {
    attentionItems.push({
      id: `alert-${alert.id}`,
      text: alert.title,
      href: active ? documentsHref(active.id) : ADD_ANYTHING_PATH,
    });
  }
  for (const req of data.openRequests.slice(0, 2)) {
    attentionItems.push({
      id: `req-${req.id}`,
      text: req.title,
      href: `/requests?id=${req.id}`,
    });
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
                  action.accent
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

      <Section title="Your Spaces">
        <ul className="space-y-1">
          {spaces.slice(0, 5).map((space) => (
            <li key={space.id}>
              <button
                type="button"
                onClick={() => {
                  void switchProfile(space.id);
                  router.push(documentsHref(space.id));
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-brand-light/35"
              >
                <ProfileAvatar profile={space} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {space.display_name}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {getContainerLabel(space.profile_type)}
                  </span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-ink-muted" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={VAULTS_PATH}
            className="text-xs font-semibold text-brand hover:text-brand-dark"
          >
            View all Spaces
          </Link>
          <button
            type="button"
            onClick={() => void handleNewSpace()}
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-foreground"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            New Space
          </button>
        </div>
      </Section>

      <Section title="Needs Attention">
        {loading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : attentionItems.length > 0 ? (
          <ul className="space-y-1">
            {attentionItems.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="block rounded-xl px-2 py-2.5 text-sm font-medium text-foreground transition hover:bg-brand-light/35"
                >
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">
            Nothing needs your attention right now.
          </p>
        )}
      </Section>

      {data.recentActivity.length > 0 ? (
        <Section title="Continue where you left off">
          <ul className="space-y-1">
            {data.recentActivity.slice(0, 5).map((item) => (
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
