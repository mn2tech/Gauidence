"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, FolderPlus } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import ProfileSetupHub from "@/components/ProfileSetupHub";
import { useActiveProfile } from "@/components/ProfileProvider";
import { useUpgradeModal } from "@/components/UpgradeProvider";
import { useSimpleHomeData } from "@/hooks/useSimpleHomeData";
import {
  GuardianSourcePanel,
  GuardianWatchList,
  useGuardianWatchHome,
} from "@/hooks/useGuardianWatchHome";
import PersonalSpaceWelcome from "@/components/personal-space/PersonalSpaceWelcome";
import GideonWelcome from "@/components/gideon-welcome/GideonWelcome";
import { formatActivityWhen } from "@/lib/simple-home/helpers";
import { VAULTS_PATH } from "@/lib/simple-home/routing";
import { documentsHref } from "@/lib/routes";
import { getContainerLabel, topLevelProfiles } from "@/lib/profiles/types";
import { PERSONAL_SPACE_DISPLAY_NAME } from "@/lib/personal-space/types";
import { isPersonalSpaceProfile } from "@/lib/personal-space/welcome";

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

export default function SimpleHomeScreen() {
  const router = useRouter();
  const { active, profiles, loading: profilesLoading, switchProfile } =
    useActiveProfile();
  const { data, loading } = useSimpleHomeData();
  const watch = useGuardianWatchHome();
  const { openUpgrade } = useUpgradeModal();

  const spaces = topLevelProfiles(profiles);
  const personal =
    profiles.find((p) => isPersonalSpaceProfile(p) && p.is_default) ??
    profiles.find((p) => isPersonalSpaceProfile(p)) ??
    null;
  const isPersonalActive = active
    ? isPersonalSpaceProfile(active)
    : Boolean(personal);
  const knowledgeEmpty =
    !loading &&
    !watch.loading &&
    data.recentActivity.length === 0 &&
    data.todayAlerts.length === 0 &&
    watch.data.today.length === 0 &&
    watch.data.needsAttention.length === 0 &&
    watch.data.comingUp.length === 0;

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

  // Personal Space is auto-created — avoid a create-space-first experience.
  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <PersonalSpaceWelcome spaceName={PERSONAL_SPACE_DISPLAY_NAME} />
        <p className="mt-6 text-center text-sm text-ink-muted">
          Setting up your Personal Space…
        </p>
        <div className="mt-4">
          <ProfileSetupHub returnTo="/home" />
        </div>
      </div>
    );
  }

  const showPersonalWelcome = isPersonalActive && knowledgeEmpty;
  const watchLoading = watch.loading;

  return (
    <div className="simple-home-page mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:gap-7 sm:py-8">
      {showPersonalWelcome ? (
        <PersonalSpaceWelcome
          spaceName={
            personal?.display_name ||
            active?.display_name ||
            PERSONAL_SPACE_DISPLAY_NAME
          }
        />
      ) : (
        <GideonWelcome />
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/knowledge"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-white px-3 py-2 text-xs font-semibold text-foreground transition hover:border-brand/40"
        >
          <BookOpen className="h-3.5 w-3.5 text-brand" />
          My Knowledge
        </Link>
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

      {!watchLoading && watch.data.today.length > 0 ? (
        <Section title="Today">
          <GuardianWatchList
            items={watch.data.today}
            onComplete={(id) => void watch.complete(id)}
            onDismiss={(id) => void watch.dismiss(id)}
            onViewSource={(id) => void watch.viewSource(id)}
          />
        </Section>
      ) : null}

      <Section title="What You Need">
        {watchLoading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : watch.data.needsAttention.length > 0 ? (
          <GuardianWatchList
            items={watch.data.needsAttention}
            onComplete={(id) => void watch.complete(id)}
            onDismiss={(id) => void watch.dismiss(id)}
            onViewSource={(id) => void watch.viewSource(id)}
          />
        ) : (
          <p className="text-sm text-ink-muted">
            Nothing needs your attention right now.
          </p>
        )}
      </Section>

      <Section title="Coming Up">
        {watchLoading ? (
          <p className="text-sm text-ink-muted">Loading…</p>
        ) : watch.data.comingUp.length > 0 ? (
          <GuardianWatchList
            items={watch.data.comingUp}
            onComplete={(id) => void watch.complete(id)}
            onDismiss={(id) => void watch.dismiss(id)}
            onViewSource={(id) => void watch.viewSource(id)}
          />
        ) : (
          <p className="text-sm text-ink-muted">Nothing coming up soon.</p>
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

      <GuardianSourcePanel
        open={watch.sourceOpen}
        onClose={watch.closeSource}
      />
    </div>
  );
}
